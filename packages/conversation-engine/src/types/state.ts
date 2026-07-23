/**
 * Engine state model — the finite set of statuses and the immutable snapshot
 * the UI subscribes to.
 */

import type { AnswersMap } from "./answer.ts";
import type { QuestionDefinition } from "./question.ts";
import type { ValidationError } from "./validation.ts";

/** The finite set of engine states. See machine/transitions.ts for the FSM. */
export type EngineStatus =
  | "idle"
  | "loading"
  | "restoring"
  | "question"
  | "validating"
  | "transitioning"
  | "uploading"
  | "submitting"
  | "completed"
  | "error"
  | "paused";

export interface ProgressInfo {
  /** 1-based position of the current step among visited steps. */
  readonly step: number;
  /** Projected total steps along the currently-reachable path. */
  readonly projectedTotal: number;
  /** Fraction of the projected path completed, 0..1. */
  readonly ratio: number;
}

/** The serialisable session, used by persistence adapters for save/restore. */
export interface PersistedSession {
  readonly sessionId: string;
  readonly flowId: string;
  readonly flowVersion: number;
  readonly currentNodeId: string;
  readonly answers: AnswersMap;
  readonly history: readonly string[];
  readonly status: EngineStatus;
  readonly updatedAt: string;
}

/** Immutable snapshot delivered to subscribers on every state change. */
export interface EngineState {
  readonly status: EngineStatus;
  readonly sessionId: string;
  readonly currentNodeId: string | null;
  readonly currentQuestion: QuestionDefinition | null;
  readonly answers: AnswersMap;
  readonly errors: readonly ValidationError[];
  readonly history: readonly string[];
  readonly canGoBack: boolean;
  readonly progress: ProgressInfo;
  /** Terminal outcome label once completed, else null. */
  readonly outcome: string | null;
  /** Human-readable error message when status is "error", else null. */
  readonly error: string | null;
}
