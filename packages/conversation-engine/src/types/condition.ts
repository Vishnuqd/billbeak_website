/**
 * Declarative branching conditions.
 *
 * Conditions are DATA, not code. A flow author expresses "go here when the
 * answer to X is Y" as a JSON-serialisable {@link Condition}. The engine's
 * evaluator (see conditions/evaluate.ts) is the only code that interprets them,
 * so branching logic can be authored, versioned, and shipped without a rebuild.
 */

export type ConditionScalar = string | number | boolean;

/** A reference to a previously-answered question, by its id. */
export type ConditionPath = string;

export type Condition =
  | { readonly op: "always" }
  | { readonly op: "never" }
  /** The question has been answered (and not skipped-to-null). */
  | { readonly op: "exists"; readonly path: ConditionPath }
  /** The answer is empty / unset. */
  | { readonly op: "empty"; readonly path: ConditionPath }
  | { readonly op: "eq"; readonly path: ConditionPath; readonly value: ConditionScalar }
  | { readonly op: "neq"; readonly path: ConditionPath; readonly value: ConditionScalar }
  | { readonly op: "in"; readonly path: ConditionPath; readonly value: readonly ConditionScalar[] }
  | { readonly op: "nin"; readonly path: ConditionPath; readonly value: readonly ConditionScalar[] }
  /** For array answers (multi-select): the array includes this value. */
  | { readonly op: "includes"; readonly path: ConditionPath; readonly value: ConditionScalar }
  | { readonly op: "gt"; readonly path: ConditionPath; readonly value: number }
  | { readonly op: "gte"; readonly path: ConditionPath; readonly value: number }
  | { readonly op: "lt"; readonly path: ConditionPath; readonly value: number }
  | { readonly op: "lte"; readonly path: ConditionPath; readonly value: number }
  | { readonly op: "and"; readonly conditions: readonly Condition[] }
  | { readonly op: "or"; readonly conditions: readonly Condition[] }
  | { readonly op: "not"; readonly condition: Condition };
