/**
 * Adapter contracts.
 *
 * The engine talks to the outside world ONLY through these interfaces. It never
 * imports localStorage, S3, Segment, or any concrete implementation. Swap the
 * adapter, keep the engine.
 */

import type { FileLike, UploadReference } from "./answer.ts";
import type { PersistedSession } from "./state.ts";

/* -------------------------------------------------------------------------- */
/*  Persistence                                                               */
/* -------------------------------------------------------------------------- */

/** Save/restore a session. Implementations: memory, localStorage, IndexedDB, server. */
export interface PersistenceAdapter {
  load(sessionId: string): Promise<PersistedSession | null>;
  save(session: PersistedSession): Promise<void>;
  clear(sessionId: string): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/*  Analytics                                                                 */
/* -------------------------------------------------------------------------- */

export type AnalyticsEventType =
  | "conversation_started"
  | "question_viewed"
  | "question_answered"
  | "validation_failed"
  | "back"
  | "skipped"
  | "upload_started"
  | "upload_completed"
  | "upload_failed"
  | "paused"
  | "resumed"
  | "conversation_completed"
  | "error";

export interface AnalyticsEvent {
  readonly type: AnalyticsEventType;
  readonly sessionId: string;
  readonly questionId?: string;
  readonly properties?: Readonly<Record<string, unknown>>;
  /** ISO-8601 timestamp. */
  readonly at: string;
}

/** The engine emits events; it never calls GA/Mixpanel/PostHog directly. */
export interface AnalyticsAdapter {
  track(event: AnalyticsEvent): void;
}

/* -------------------------------------------------------------------------- */
/*  Uploads                                                                   */
/* -------------------------------------------------------------------------- */

export interface UploadInput {
  readonly file: FileLike;
  readonly questionId: string;
  readonly sessionId: string;
}

export type UploadProgress = (fraction: number) => void;

/** The engine knows only "upload this, give me a reference". Never AWS/S3/GCS. */
export interface UploadProvider {
  upload(input: UploadInput, onProgress?: UploadProgress): Promise<UploadReference>;
}
