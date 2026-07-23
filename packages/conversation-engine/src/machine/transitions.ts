/**
 * The finite state machine.
 *
 * This is the ONLY place that decides which status may follow which. The engine
 * never uses ad-hoc `if` chains to change status — it asks this table. An
 * attempt to take an undefined transition is a programming error and throws,
 * which surfaces illegal sequencing immediately in tests.
 *
 *   idle ──LOAD──▶ loading ──LOADED──▶ question ◀─────────────┐
 *                     │                    │                   │
 *                  RESTORE              ANSWER              ADVANCE
 *                     ▼                    ▼                   │
 *                 restoring           validating ──VALIDATE_OK──▶ transitioning
 *                     │              │    │    │                   │
 *                 RESTORED   VALIDATE_FAIL │ UPLOAD_START     REACH_TERMINAL
 *                     ▼              │    │    ▼                   ▼
 *                  question ◀────────┘    │  uploading         submitting
 *                                         │    │  │                │  │
 *                                         │ UPLOAD_DONE      SUBMIT_OK SUBMIT_FAIL
 *                                         │    │  UPLOAD_FAIL      ▼      ▼
 *                                         │    ▼      │        completed error
 *                                         └▶ transitioning ◀──┘
 *
 * Cross-cutting: BACK (question→question), PAUSE (question→paused),
 * RESUME (paused/error→question), RESET (→idle), FAIL (→error).
 */

import type { EngineStatus } from "../types/state.ts";

export type EngineAction =
  | "LOAD"
  | "LOADED"
  | "RESTORE"
  | "RESTORED"
  | "ANSWER"
  | "VALIDATE_OK"
  | "VALIDATE_FAIL"
  | "UPLOAD_START"
  | "UPLOAD_DONE"
  | "UPLOAD_FAIL"
  | "ADVANCE"
  | "REACH_TERMINAL"
  | "SUBMIT_OK"
  | "SUBMIT_FAIL"
  | "BACK"
  | "PAUSE"
  | "RESUME"
  | "RESET"
  | "FAIL";

/** Full transition table. Every legal `(status, action) → status` lives here. */
export const TRANSITION_TABLE: Readonly<
  Record<EngineStatus, Partial<Record<EngineAction, EngineStatus>>>
> = {
  idle: { LOAD: "loading" },
  loading: { LOADED: "question", RESTORE: "restoring", FAIL: "error" },
  restoring: { RESTORED: "question", FAIL: "error" },
  question: { ANSWER: "validating", BACK: "question", PAUSE: "paused", RESET: "idle", FAIL: "error" },
  validating: {
    VALIDATE_OK: "transitioning",
    VALIDATE_FAIL: "question",
    UPLOAD_START: "uploading",
    FAIL: "error",
  },
  uploading: { UPLOAD_DONE: "transitioning", UPLOAD_FAIL: "question", FAIL: "error" },
  transitioning: { ADVANCE: "question", REACH_TERMINAL: "submitting", FAIL: "error" },
  submitting: { SUBMIT_OK: "completed", SUBMIT_FAIL: "error" },
  paused: { RESUME: "question", RESET: "idle" },
  completed: { RESET: "idle" },
  error: { RESET: "idle", RESUME: "question" },
};

/** Is `action` legal from `from`? */
export function canTransition(from: EngineStatus, action: EngineAction): boolean {
  return TRANSITION_TABLE[from][action] !== undefined;
}

/** The status reached by taking `action` from `from`. Throws if illegal. */
export function nextStatus(from: EngineStatus, action: EngineAction): EngineStatus {
  const to = TRANSITION_TABLE[from][action];
  if (to === undefined) {
    throw new Error(`Illegal state transition: "${from}" cannot handle action "${action}".`);
  }
  return to;
}
