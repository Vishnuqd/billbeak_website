/**
 * Question model.
 *
 * A `QuestionDefinition` is pure configuration. A `QuestionTypeDescriptor`
 * teaches the engine the *behaviour* of a type (how to tell if empty, whether it
 * routes through the upload provider) — but NEVER how to render it. Rendering
 * lives entirely in the UI layer.
 */

import type { AnswerValue } from "./answer.ts";
import type { ValidationRuleRef } from "./validation.ts";

/** Open string so custom/future types need no engine change. */
export type QuestionTypeKey = string;

export interface ChoiceOption {
  readonly value: string;
  readonly label: string;
}

export interface QuestionDefinition {
  readonly id: string;
  readonly type: QuestionTypeKey;
  readonly prompt: string;
  readonly help?: string;
  /** When true, the question may be skipped and `required` is not auto-applied. */
  readonly optional?: boolean;
  /** For choice-based types. */
  readonly options?: readonly ChoiceOption[];
  /** Rules referenced by name from the validator registry. */
  readonly validations?: readonly ValidationRuleRef[];
  /** Arbitrary type-specific configuration (min, max, accept, placeholder…). */
  readonly config?: Readonly<Record<string, unknown>>;
}

/** Behavioural descriptor for one question type. */
export interface QuestionTypeDescriptor {
  readonly key: QuestionTypeKey;
  /** When true, a raw file value is sent through the {@link UploadProvider}. */
  readonly requiresUpload?: boolean;
  /** Type-aware emptiness check, used for skip logic and `required`. */
  readonly isEmpty: (value: AnswerValue) => boolean;
  /** Validators always applied to this type (e.g. `email` on an email field). */
  readonly defaultValidations?: readonly ValidationRuleRef[];
}

export type QuestionTypeRegistry = Readonly<Record<QuestionTypeKey, QuestionTypeDescriptor>>;
