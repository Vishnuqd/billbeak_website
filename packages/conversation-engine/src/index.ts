/**
 * @billbeak/conversation-engine
 *
 * A headless, framework-agnostic conversational engine. It knows nothing about
 * any specific product — journeys, questions, validation, branching, and
 * completion are all supplied as configuration and adapters.
 *
 * See ENGINE.md for the full guide.
 */

// Public types (flows, questions, conditions, adapters, config, state).
export * from "./types/index.ts";

// The engine.
export { ConversationEngine } from "./engine/engine.ts";
export type { EngineListener } from "./engine/engine.ts";
export { resolveNextNodeId } from "./engine/resolveNext.ts";
export { validateFlowConfig } from "./engine/validateFlow.ts";

// State machine (exposed so hosts can reason about / visualise transitions).
export { TRANSITION_TABLE, canTransition, nextStatus } from "./machine/transitions.ts";
export type { EngineAction } from "./machine/transitions.ts";

// Conditions, validation, progress, question types.
export { evaluateCondition } from "./conditions/evaluate.ts";
export { builtInValidators, defaultMessages } from "./validation/validators.ts";
export { runValidations, effectiveRules } from "./validation/run.ts";
export { defaultQuestionTypes } from "./questions/registry.ts";
export { computeProgress } from "./progress/progress.ts";

// Reference adapters.
export { MemoryPersistenceAdapter } from "./persistence/memory.ts";
export { LocalStoragePersistenceAdapter } from "./persistence/localStorage.ts";
export {
  NoopAnalyticsAdapter,
  FunctionAnalyticsAdapter,
  RecordingAnalyticsAdapter,
  MultiplexAnalyticsAdapter,
} from "./analytics/adapters.ts";
export { MemoryUploadProvider, FailingUploadProvider } from "./uploads/memory.ts";
