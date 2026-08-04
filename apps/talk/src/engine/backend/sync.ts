/**
 * BackendSync — durable persistence to the FastAPI backend.
 *
 * The engine runs the conversation locally (branching, validation, instant
 * resume via localStorage). This controller mirrors every step to the backend
 * as the system of record: it creates the Journey when the navigator is
 * answered, POSTs each answer, and POSTs completion — all through a serial,
 * offline-tolerant queue. Nothing is lost offline; the queue flushes on
 * reconnect. It never blocks the UI.
 */

import type { ConversationEngine } from "@billbeak/conversation-engine";
import { api } from "@/api/client.ts";
import type { ConfirmationConfig } from "@/config/types.ts";

type Op =
  | { kind: "create"; journeyKey: string; leadSource?: string }
  | { kind: "answer"; questionId: string; value: unknown }
  | { kind: "complete" };

interface SyncState {
  journeyKey: string | null;
  journeyId: string | null;
  queue: Op[];
  preJourney: { questionId: string; value: unknown }[];
  completed: boolean;
}

export type SyncStatus = "idle" | "syncing" | "queued-offline" | "completed" | "error";

export interface SyncSnapshot {
  journeyKey: string | null;
  journeyId: string | null;
  status: SyncStatus;
  confirmation: ConfirmationConfig | null;
  online: boolean;
}

type Listener = (snapshot: SyncSnapshot) => void;

export class BackendSync {
  private engine: ConversationEngine | null = null;
  private state: SyncState;
  private status: SyncStatus = "idle";
  private confirmation: ConfirmationConfig | null = null;
  private processing = false;
  private cached: SyncSnapshot;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly storageKey: string,
    private readonly navigatorMap: Record<string, string>,
    private readonly navigatorQuestionId = "sh_navigator",
    private readonly leadSource?: string,
  ) {
    this.state = this.restore();
    this.cached = this.build();
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOnline);
    }
  }

  attach(engine: ConversationEngine): void {
    this.engine = engine;
    // Flush anything left queued from a previous session/offline period.
    void this.process();
  }

  /* ----------------------------------------------------------------- */
  /*  engine hook entry points                                          */
  /* ----------------------------------------------------------------- */

  handleQuestionExit(questionId: string): void {
    const value = this.engine?.getState().answers[questionId]?.value;

    if (questionId === this.navigatorQuestionId) {
      const journeyKey = typeof value === "string" ? this.navigatorMap[value] : undefined;
      if (journeyKey) {
        this.state.journeyKey = journeyKey;
        this.enqueue({ kind: "create", journeyKey, leadSource: this.leadSource });
        for (const buffered of this.state.preJourney) {
          this.enqueue({ kind: "answer", questionId: buffered.questionId, value: buffered.value });
        }
        this.enqueue({ kind: "answer", questionId, value });
        this.state.preJourney = [];
        void this.loadConfirmation(journeyKey);
      }
      this.persist();
      return;
    }

    if (!this.state.journeyKey) {
      this.state.preJourney.push({ questionId, value });
      this.persist();
      return;
    }
    this.enqueue({ kind: "answer", questionId, value });
  }

  requestComplete(): void {
    this.enqueue({ kind: "complete" });
  }

  /* ----------------------------------------------------------------- */
  /*  subscription                                                      */
  /* ----------------------------------------------------------------- */

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.cached);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Stable snapshot (referentially cached until the next change). */
  snapshot(): SyncSnapshot {
    return this.cached;
  }

  private build(): SyncSnapshot {
    return {
      journeyKey: this.state.journeyKey,
      journeyId: this.state.journeyId,
      status: this.status,
      confirmation: this.confirmation,
      online: typeof navigator === "undefined" ? true : navigator.onLine,
    };
  }

  getJourneyId(): string | null {
    return this.state.journeyId;
  }

  /** Ensure the backend Journey exists (needed before uploads). Returns null if offline/unavailable. */
  async ensureJourneyId(): Promise<string | null> {
    if (this.state.journeyId) return this.state.journeyId;
    await this.process();
    return this.state.journeyId;
  }

  dispose(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOnline);
    }
    this.listeners.clear();
  }

  /* ----------------------------------------------------------------- */
  /*  queue processing                                                  */
  /* ----------------------------------------------------------------- */

  private enqueue(op: Op): void {
    this.state.queue.push(op);
    this.persist();
    void this.process();
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.setStatus("queued-offline");
      return;
    }
    this.processing = true;
    try {
      while (this.state.queue.length > 0) {
        const op = this.state.queue[0]!;
        this.setStatus("syncing");
        const ok = await this.execute(op);
        if (!ok) {
          // Network failure — keep the op and retry on reconnect.
          this.setStatus(navigator.onLine ? "error" : "queued-offline");
          return;
        }
        this.state.queue.shift();
        this.persist();
      }
      if (!this.state.completed) this.setStatus("idle");
    } finally {
      this.processing = false;
    }
  }

  /** Returns true when the op is done (or permanently skippable), false on retryable network error. */
  private async execute(op: Op): Promise<boolean> {
    try {
      if (op.kind === "create") {
        const { data, error } = await api.POST("/journeys", {
          body: { journeyKey: op.journeyKey, leadSource: op.leadSource ?? null },
        });
        if (error || !data) return false;
        this.state.journeyId = data.id;
        this.persist();
        return true;
      }
      if (op.kind === "answer") {
        if (!this.state.journeyId) return false;
        const { error, response } = await api.POST("/journeys/{journey_id}/answers", {
          params: { path: { journey_id: this.state.journeyId } },
          body: { questionId: op.questionId, value: op.value },
        });
        // 4xx (already-validated locally) is not retryable — drop it, don't wedge the queue.
        if (error) return response.status >= 400 && response.status < 500;
        return true;
      }
      // complete
      if (!this.state.journeyId) return false;
      const { data, error, response } = await api.POST("/journeys/{journey_id}/complete", {
        params: { path: { journey_id: this.state.journeyId } },
      });
      if (error) {
        if (response.status === 409) {
          this.state.completed = true;
          this.setStatus("completed");
          return true; // already completed server-side
        }
        return response.status >= 400 && response.status < 500;
      }
      if (data) {
        this.confirmation = data.confirmation as unknown as ConfirmationConfig;
        this.state.completed = true;
        this.setStatus("completed");
      }
      return true;
    } catch {
      return false; // network error — retryable
    }
  }

  private handleOnline = (): void => {
    void this.process();
  };

  private async loadConfirmation(journeyKey: string): Promise<void> {
    try {
      const { data } = await api.GET("/configuration/{journey_key}", {
        params: { path: { journey_key: journeyKey } },
      });
      if (data) {
        this.confirmation = data.confirmation as unknown as ConfirmationConfig;
        this.emit();
      }
    } catch {
      /* offline — confirmation arrives with the complete response instead */
    }
  }

  /* ----------------------------------------------------------------- */
  /*  persistence + notify                                              */
  /* ----------------------------------------------------------------- */

  private setStatus(status: SyncStatus): void {
    this.status = status;
    this.emit();
  }

  private emit(): void {
    this.cached = this.build();
    for (const listener of this.listeners) listener(this.cached);
  }

  private persist(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch {
      /* storage unavailable */
    }
    this.emit();
  }

  private restore(): SyncState {
    const empty: SyncState = {
      journeyKey: null,
      journeyId: null,
      queue: [],
      preJourney: [],
      completed: false,
    };
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return empty;
      return { ...empty, ...(JSON.parse(raw) as Partial<SyncState>) };
    } catch {
      return empty;
    }
  }
}
