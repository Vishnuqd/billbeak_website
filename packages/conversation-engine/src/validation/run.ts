/**
 * Validation runner.
 *
 * Composes a question's declared rules (plus its type's default rules, plus an
 * auto-applied `required` when not optional) and runs them against a value. The
 * runner is generic; it has no per-question knowledge.
 */

import type { AnswersMap, AnswerValue } from "../types/answer.ts";
import type { QuestionDefinition, QuestionTypeDescriptor } from "../types/question.ts";
import type { ValidationError, ValidationRuleRef, ValidatorRegistry } from "../types/validation.ts";
import { defaultMessages } from "./validators.ts";

function messageFor(ref: ValidationRuleRef): string {
  return ref.message ?? defaultMessages[ref.rule] ?? `Failed validation: ${ref.rule}.`;
}

/**
 * Build the effective rule list for a question:
 *  1. an auto `required` when the question is not optional,
 *  2. the question type's default validations,
 *  3. the question's own declared validations.
 * Later duplicates are allowed (e.g. two pattern rules) and all run.
 */
export function effectiveRules(
  question: QuestionDefinition,
  typeDescriptor: QuestionTypeDescriptor | undefined,
): readonly ValidationRuleRef[] {
  const rules: ValidationRuleRef[] = [];
  if (question.optional !== true) {
    rules.push({ rule: "required" });
  }
  if (typeDescriptor?.defaultValidations) {
    rules.push(...typeDescriptor.defaultValidations);
  }
  if (question.validations) {
    rules.push(...question.validations);
  }
  return rules;
}

export function runValidations(
  question: QuestionDefinition,
  typeDescriptor: QuestionTypeDescriptor | undefined,
  value: AnswerValue,
  answers: AnswersMap,
  validators: ValidatorRegistry,
): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const ref of effectiveRules(question, typeDescriptor)) {
    const fn = validators[ref.rule];
    if (fn === undefined) {
      throw new Error(`Unknown validator "${ref.rule}" referenced by question "${question.id}".`);
    }
    const ok = fn(value, { answers, params: ref.params ?? {} });
    if (!ok) {
      errors.push({ rule: ref.rule, message: messageFor(ref) });
    }
  }
  return errors;
}
