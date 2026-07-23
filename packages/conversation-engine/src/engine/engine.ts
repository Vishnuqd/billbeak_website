/**
 * ConversationEngine — the headless, framework-agnostic orchestrator.
 *
 * It owns no rendering and no product knowledge. It drives the finite state
 * machine (machine/transitions.ts), interprets the flow graph, runs validation,
 * routes uploads through the injected provider, persists via the injected
 * adapter, and emits analytics + lifecycle events. UIs bind by calling the
 * public methods and reading immutable snapshots via `subscribe`/`getState`.
 */

import type {
  AnalyticsAdapter,
  AnalyticsEvent,
  AnalyticsEventType,
  PersistenceAdapter,
  UploadProvider,
} from "../types/adapters.ts";
import type { Answer, AnswersMap, AnswerValue } from "../types/answer.ts";
import { isFileLike } from "../types/answer.ts";
import type { EngineConfig, SubmitHandler } from "../types/config.ts";
import type { FlowDefinition, QuestionNode } from "../types/flow.ts";
import type { EngineHooks } from "../types/hooks.ts";
import type {
  QuestionDefinition,
  QuestionTypeRegistry,
} from "../types/question.ts";
import type { EngineState, EngineStatus, PersistedSession } from "../types/state.ts";
import type { ValidationError, ValidatorRegistry } from "../types/validation.ts";

import { computeProgress } from "../progress/progress.ts";
import { defaultQuestionTypes } from "../questions/registry.ts";
import { builtInValidators } from "../validation/validators.ts";
import { runValidations } from "../validation/run.ts";
import { resolveNextNodeId } from "./resolveNext.ts";
import { validateFlowConfig } from "./validateFlow.ts";
import { type EngineAction, nextStatus } from "../machine/transitions.ts";

export type EngineListener = (state: EngineState) => void;

function defaultId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class ConversationEngine {
  private readonly flow: FlowDefinition;
  private readonly questions: Readonly<Record<string, QuestionDefinition>>;
  private readonly questionTypes: QuestionTypeRegistry;
  private readonly validators: ValidatorRegistry;
  private readonly persistence: PersistenceAdapter | undefined;
  private readonly analytics: AnalyticsAdapter | undefined;
  private readonly uploads: UploadProvider | undefined;
  private readonly hooks: EngineHooks;
  private readonly onSubmit: SubmitHandler | undefined;
  private readonly now: () => string;
  private readonly generateId: () => string;
  private readonly requestedSessionId: string | undefined;

  private readonly listeners = new Set<EngineListener>();

  private status: EngineStatus = "idle";
  private sessionId: string;
  private currentNodeId: string | null = null;
  private answers: Record<string, Answer> = {};
  private history: string[] = [];
  private errors: ValidationError[] = [];
  private outcome: string | null = null;
  private errorText: string | null = null;

  constructor(config: EngineConfig) {
    validateFlowConfig(config);
    this.flow = config.flow;
    this.questions = config.questions;
    this.questionTypes = { ...defaultQuestionTypes, ...config.questionTypes };
    this.validators = { ...builtInValidators, ...config.validators };
    this.persistence = config.persistence;
    this.analytics = config.analytics;
    this.uploads = config.uploads;
    this.hooks = config.hooks ?? {};
    this.onSubmit = config.onSubmit;
    this.now = config.now ?? (() => new Date().toISOString());
    this.generateId = config.generateId ?? defaultId;
    this.requestedSessionId = config.sessionId;
    this.sessionId = config.sessionId ?? this.generateId();
  }

  /* ---------------------------------------------------------------------- */
  /*  Public API                                                            */
  /* ---------------------------------------------------------------------- */

  /** Start the conversation: restore a saved session if one exists, else begin fresh. */
  async load(): Promise<void> {
    this.dispatch("LOAD");

    if (this.persistence && this.requestedSessionId !== undefined) {
      const saved = await this.persistence.load(this.requestedSessionId);
      if (saved && saved.flowId === this.flow.id) {
        this.restore(saved);
        return;
      }
    }

    this.startFresh();
  }

  /** Answer the current question. Validates, uploads if needed, records, advances. */
  async submit(value: AnswerValue): Promise<void> {
    const node = this.requireQuestionNode();
    const question = this.questionFor(node);
    const descriptor = this.questionTypes[question.type];

    const validationErrors = runValidations(
      question,
      descriptor,
      value,
      this.answers,
      this.validators,
    );

    this.dispatch("ANSWER");

    if (validationErrors.length > 0) {
      this.errors = validationErrors;
      this.dispatch("VALIDATE_FAIL");
      this.track("validation_failed", question.id, { count: validationErrors.length });
      this.notify();
      return;
    }

    let finalValue = value;
    const needsUpload = descriptor?.requiresUpload === true && isFileLike(value);

    if (needsUpload) {
      if (this.uploads === undefined) {
        this.errors = [{ rule: "upload", message: "No upload provider configured." }];
        this.dispatch("VALIDATE_FAIL");
        this.notify();
        return;
      }
      this.dispatch("UPLOAD_START");
      this.track("upload_started", question.id);
      this.notify();
      try {
        finalValue = await this.uploads.upload({
          file: value,
          questionId: question.id,
          sessionId: this.sessionId,
        });
        this.track("upload_completed", question.id);
        this.dispatch("UPLOAD_DONE");
      } catch (e) {
        this.errors = [{ rule: "upload", message: errorMessage(e) }];
        this.track("upload_failed", question.id, { message: errorMessage(e) });
        this.dispatch("UPLOAD_FAIL");
        this.notify();
        return;
      }
    } else {
      this.dispatch("VALIDATE_OK");
    }

    this.record(question.id, finalValue, false);
    this.track("question_answered", question.id);
    this.hooks.onQuestionExit?.(question.id);
    this.errors = [];
    await this.advanceFrom(node);
  }

  /** Skip the current question (only permitted when it is optional). */
  async skip(): Promise<void> {
    const node = this.requireQuestionNode();
    const question = this.questionFor(node);
    if (question.optional !== true) {
      throw new Error(`Question "${question.id}" is required and cannot be skipped.`);
    }
    this.dispatch("ANSWER");
    this.dispatch("VALIDATE_OK");
    this.record(question.id, null, true);
    this.track("skipped", question.id);
    this.hooks.onQuestionExit?.(question.id);
    this.errors = [];
    await this.advanceFrom(node);
  }

  /** Step back to the previous question, preserving prior answers. */
  back(): void {
    if (this.status !== "question" || this.history.length <= 1) return;
    this.history.pop();
    const prev = this.history[this.history.length - 1];
    if (prev === undefined) return;
    this.currentNodeId = prev;
    this.dispatch("BACK");
    this.errors = [];
    this.track("back");
    void this.persist();
    this.notify();
  }

  /** Pause an in-progress conversation. */
  pause(): void {
    if (this.status !== "question") return;
    this.dispatch("PAUSE");
    this.track("paused");
    void this.persist();
    this.notify();
  }

  /** Resume from paused (or recover from an error) back to the current question. */
  resume(): void {
    if (this.status !== "paused" && this.status !== "error") return;
    this.dispatch("RESUME");
    this.errorText = null;
    this.track("resumed");
    this.notify();
  }

  /** Discard all progress and clear persistence. Call `load()` to start again. */
  async reset(): Promise<void> {
    if (this.canDispatch("RESET")) {
      this.dispatch("RESET");
    } else {
      this.status = "idle";
    }
    this.answers = {};
    this.history = [];
    this.currentNodeId = null;
    this.errors = [];
    this.outcome = null;
    this.errorText = null;
    if (this.persistence) await this.persistence.clear(this.sessionId);
    this.sessionId = this.requestedSessionId ?? this.generateId();
    this.notify();
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: EngineListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Immutable snapshot of the current state. */
  getState(): EngineState {
    const currentNode = this.currentNodeId ? this.flow.nodes[this.currentNodeId] : undefined;
    const currentQuestion =
      currentNode && currentNode.kind === "question"
        ? (this.questions[currentNode.questionId] ?? null)
        : null;

    const progress = computeProgress(
      this.flow,
      this.currentNodeId ?? this.flow.entry,
      this.history,
      this.answers,
    );

    return {
      status: this.status,
      sessionId: this.sessionId,
      currentNodeId: this.currentNodeId,
      currentQuestion,
      answers: { ...this.answers },
      errors: [...this.errors],
      history: [...this.history],
      canGoBack: this.status === "question" && this.history.length > 1,
      progress,
      outcome: this.outcome,
      error: this.errorText,
    };
  }

  /* ---------------------------------------------------------------------- */
  /*  Internal orchestration                                                */
  /* ---------------------------------------------------------------------- */

  private startFresh(): void {
    this.sessionId = this.requestedSessionId ?? this.generateId();
    this.currentNodeId = this.flow.entry;
    this.history = [this.flow.entry];
    this.answers = {};
    this.dispatch("LOADED");
    this.track("conversation_started");
    this.emitQuestionViewed();
    void this.persist();
    this.notify();
  }

  private restore(saved: PersistedSession): void {
    this.sessionId = saved.sessionId;
    this.currentNodeId = saved.currentNodeId;
    this.answers = { ...saved.answers };
    this.history = [...saved.history];

    if (saved.status === "completed") {
      // Land directly in the terminal state; do not re-enter the question loop.
      this.status = "completed";
      const node = this.flow.nodes[saved.currentNodeId];
      this.outcome = node && node.kind === "terminal" ? (node.outcome ?? null) : null;
      this.notify();
      return;
    }

    this.dispatch("RESTORE");
    this.dispatch("RESTORED");
    this.emitQuestionViewed();
    this.notify();
  }

  private async advanceFrom(node: QuestionNode): Promise<void> {
    // Precondition: status is "transitioning".
    const nextId = resolveNextNodeId(node, this.answers);
    if (nextId === null) {
      this.fail(`No matching transition from node "${node.id}".`);
      return;
    }
    const nextNode = this.flow.nodes[nextId];
    if (nextNode === undefined) {
      this.fail(`Transition to unknown node "${nextId}".`);
      return;
    }

    if (nextNode.kind === "terminal") {
      this.currentNodeId = nextId;
      this.outcome = nextNode.outcome ?? null;
      this.dispatch("REACH_TERMINAL");
      try {
        if (this.onSubmit) {
          const result = await this.onSubmit(this.session());
          if (typeof result === "string") this.outcome = result;
        }
        this.dispatch("SUBMIT_OK");
        this.track("conversation_completed", undefined, { outcome: this.outcome ?? undefined });
        await this.persist();
        this.hooks.onComplete?.(this.getState());
        this.notify();
      } catch (e) {
        this.errorText = errorMessage(e);
        this.dispatch("SUBMIT_FAIL");
        this.track("error", undefined, { message: this.errorText });
        this.notify();
      }
      return;
    }

    this.currentNodeId = nextId;
    this.history.push(nextId);
    this.dispatch("ADVANCE");
    this.errors = [];
    this.emitQuestionViewed();
    await this.persist();
    this.notify();
  }

  /* ---------------------------------------------------------------------- */
  /*  Primitives                                                            */
  /* ---------------------------------------------------------------------- */

  private dispatch(action: EngineAction): void {
    const from = this.status;
    const to = nextStatus(from, action);
    this.status = to;
    this.hooks.onTransition?.(from, to);
  }

  private canDispatch(action: EngineAction): boolean {
    try {
      nextStatus(this.status, action);
      return true;
    } catch {
      return false;
    }
  }

  private fail(message: string): void {
    this.errorText = message;
    if (this.canDispatch("FAIL")) {
      this.dispatch("FAIL");
    } else {
      this.status = "error";
    }
    this.track("error", undefined, { message });
    this.notify();
  }

  private record(questionId: string, value: AnswerValue, skipped: boolean): void {
    this.answers[questionId] = { questionId, value, answeredAt: this.now(), skipped };
  }

  private requireQuestionNode(): QuestionNode {
    if (this.status !== "question") {
      throw new Error(`Cannot answer while status is "${this.status}".`);
    }
    if (this.currentNodeId === null) {
      throw new Error("No current node.");
    }
    const node = this.flow.nodes[this.currentNodeId];
    if (node === undefined || node.kind !== "question") {
      throw new Error(`Current node "${this.currentNodeId}" is not a question node.`);
    }
    return node;
  }

  private questionFor(node: QuestionNode): QuestionDefinition {
    const question = this.questions[node.questionId];
    if (question === undefined) {
      throw new Error(`Unknown question "${node.questionId}".`);
    }
    return question;
  }

  private emitQuestionViewed(): void {
    if (this.currentNodeId === null) return;
    const node = this.flow.nodes[this.currentNodeId];
    if (node && node.kind === "question") {
      this.track("question_viewed", node.questionId);
      this.hooks.onQuestionEnter?.(node.questionId);
    }
  }

  private track(
    type: AnalyticsEventType,
    questionId?: string,
    properties?: Readonly<Record<string, unknown>>,
  ): void {
    if (this.analytics === undefined) return;
    const event: AnalyticsEvent = {
      type,
      sessionId: this.sessionId,
      at: this.now(),
      ...(questionId !== undefined ? { questionId } : {}),
      ...(properties !== undefined ? { properties } : {}),
    };
    this.analytics.track(event);
  }

  private session(): PersistedSession {
    return {
      sessionId: this.sessionId,
      flowId: this.flow.id,
      flowVersion: this.flow.version,
      currentNodeId: this.currentNodeId ?? this.flow.entry,
      answers: { ...this.answers },
      history: [...this.history],
      status: this.status,
      updatedAt: this.now(),
    };
  }

  private async persist(): Promise<void> {
    if (this.persistence === undefined) return;
    await this.persistence.save(this.session());
  }

  private notify(): void {
    const state = this.getState();
    this.hooks.onStateChange?.(state);
    for (const listener of this.listeners) listener(state);
  }
}
