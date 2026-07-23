/**
 * Default question-type registry.
 *
 * These descriptors teach the engine each type's *behaviour* (emptiness, whether
 * it uploads, sensible default validators) — never its rendering. The set is
 * open: host apps merge in custom or future types via `EngineConfig.questionTypes`
 * without touching the engine.
 */

import type { AnswerValue } from "../types/answer.ts";
import type { QuestionTypeDescriptor, QuestionTypeRegistry } from "../types/question.ts";

const emptyString = (v: AnswerValue): boolean =>
  v === null || (typeof v === "string" && v.trim().length === 0);

const emptyArray = (v: AnswerValue): boolean =>
  v === null || (Array.isArray(v) && v.length === 0);

const emptyObjectOrNull = (v: AnswerValue): boolean => v === null;

function descriptor(
  key: string,
  isEmpty: (v: AnswerValue) => boolean,
  defaults?: QuestionTypeDescriptor["defaultValidations"],
  requiresUpload = false,
): QuestionTypeDescriptor {
  return requiresUpload
    ? { key, isEmpty, requiresUpload, ...(defaults ? { defaultValidations: defaults } : {}) }
    : { key, isEmpty, ...(defaults ? { defaultValidations: defaults } : {}) };
}

export const defaultQuestionTypes: QuestionTypeRegistry = {
  single_choice: descriptor("single_choice", emptyString),
  multi_choice: descriptor("multi_choice", emptyArray),
  text: descriptor("text", emptyString),
  textarea: descriptor("textarea", emptyString),
  email: descriptor("email", emptyString, [{ rule: "email" }]),
  phone: descriptor("phone", emptyString, [{ rule: "phone" }]),
  date: descriptor("date", emptyString),
  country: descriptor("country", emptyString),
  website: descriptor("website", emptyString, [{ rule: "url" }]),
  linkedin: descriptor("linkedin", emptyString, [{ rule: "url" }]),
  number: descriptor("number", (v) => v === null || v === ""),
  file: descriptor("file", emptyObjectOrNull, undefined, true),
};
