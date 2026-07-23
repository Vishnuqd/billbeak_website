/**
 * Validation model.
 *
 * Validators are registered by name and referenced from question configuration.
 * The engine ships built-ins (validation/validators.ts) but never hardcodes
 * which rules a given question uses — that is configuration.
 */

import type { AnswerValue, AnswersMap } from "./answer.ts";

/** A reference from a question to a named validator, with parameters. */
export interface ValidationRuleRef {
  readonly rule: string;
  readonly params?: Readonly<Record<string, unknown>>;
  /** Optional override for the default error message. */
  readonly message?: string;
}

/** A validation failure surfaced to the UI. */
export interface ValidationError {
  readonly rule: string;
  readonly message: string;
}

export interface ValidatorContext {
  /** All answers so far — enables cross-field validation. */
  readonly answers: AnswersMap;
  readonly params: Readonly<Record<string, unknown>>;
}

/** Returns `true` when the value is valid for this rule. */
export type ValidatorFn = (value: AnswerValue, ctx: ValidatorContext) => boolean;

export type ValidatorRegistry = Readonly<Record<string, ValidatorFn>>;
