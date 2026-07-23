/**
 * Engine configuration — everything the engine needs, injected at construction.
 *
 * Note the shape: a flow, a bag of questions, and a set of adapters. Nothing
 * here is product-specific. Point it at a different flow + questions and it
 * powers a different journey with zero code change.
 */

import type { AnalyticsAdapter, PersistenceAdapter, UploadProvider } from "./adapters.ts";
import type { FlowDefinition } from "./flow.ts";
import type { EngineHooks } from "./hooks.ts";
import type { QuestionDefinition, QuestionTypeRegistry } from "./question.ts";
import type { PersistedSession } from "./state.ts";
import type { ValidatorRegistry } from "./validation.ts";

/**
 * Called when a conversation reaches a terminal node. Return an outcome label to
 * override the terminal's own. This is where the host persists to its backend.
 */
export type SubmitHandler = (session: PersistedSession) => Promise<string | void>;

export interface EngineConfig {
  readonly flow: FlowDefinition;
  /** Question definitions keyed by id, referenced by flow nodes. */
  readonly questions: Readonly<Record<string, QuestionDefinition>>;
  /** Overrides/extends the built-in question types. */
  readonly questionTypes?: QuestionTypeRegistry;
  /** Merged over the built-in validators (custom rules win on name clash). */
  readonly validators?: ValidatorRegistry;
  /** Provide to resume an existing session; omit to mint a new one. */
  readonly sessionId?: string;
  readonly persistence?: PersistenceAdapter;
  readonly analytics?: AnalyticsAdapter;
  readonly uploads?: UploadProvider;
  readonly hooks?: EngineHooks;
  readonly onSubmit?: SubmitHandler;
  /** Injectable clock (ISO string) for deterministic tests. */
  readonly now?: () => string;
  /** Injectable id generator for deterministic tests. */
  readonly generateId?: () => string;
}
