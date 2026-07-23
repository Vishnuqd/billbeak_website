/**
 * Lifecycle hooks — the seam for animation and side effects.
 *
 * The UI can either subscribe to state changes (see `ConversationEngine.subscribe`)
 * or attach these fine-grained hooks. Animation orchestration (enter/exit
 * transitions) hangs off `onQuestionEnter` / `onQuestionExit` / `onTransition`.
 */

import type { EngineState, EngineStatus } from "./state.ts";

export interface EngineHooks {
  readonly onStateChange?: (state: EngineState) => void;
  readonly onTransition?: (from: EngineStatus, to: EngineStatus) => void;
  readonly onQuestionEnter?: (questionId: string) => void;
  readonly onQuestionExit?: (questionId: string) => void;
  readonly onComplete?: (state: EngineState) => void;
}
