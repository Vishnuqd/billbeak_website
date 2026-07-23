import { test } from "node:test";
import assert from "node:assert/strict";
import { runValidations } from "./run.ts";
import { builtInValidators } from "./validators.ts";
import { defaultQuestionTypes } from "../questions/registry.ts";
import type { QuestionDefinition } from "../types/question.ts";

const noAnswers = {};

function validate(question: QuestionDefinition, value: unknown) {
  const descriptor = defaultQuestionTypes[question.type];
  return runValidations(question, descriptor, value as never, noAnswers, builtInValidators);
}

test("required is auto-applied when not optional", () => {
  const q: QuestionDefinition = { id: "q", type: "text", prompt: "?" };
  assert.equal(validate(q, "").length, 1);
  assert.equal(validate(q, "hello").length, 0);
});

test("optional questions are not required", () => {
  const q: QuestionDefinition = { id: "q", type: "text", prompt: "?", optional: true };
  assert.equal(validate(q, "").length, 0);
});

test("email type applies default email validator", () => {
  const q: QuestionDefinition = { id: "q", type: "email", prompt: "?" };
  assert.equal(validate(q, "not-an-email").length, 1);
  assert.equal(validate(q, "a@b.co").length, 0);
});

test("min / max on numbers", () => {
  const q: QuestionDefinition = {
    id: "q",
    type: "number",
    prompt: "?",
    validations: [
      { rule: "min", params: { value: 1 } },
      { rule: "max", params: { value: 14 } },
    ],
  };
  assert.equal(validate(q, 0).length, 1);
  assert.equal(validate(q, 20).length, 1);
  assert.equal(validate(q, 5).length, 0);
});

test("minSelected on multi-choice", () => {
  const q: QuestionDefinition = {
    id: "q",
    type: "multi_choice",
    prompt: "?",
    validations: [{ rule: "minSelected", params: { value: 2 } }],
  };
  assert.equal(validate(q, ["a"]).length, 1);
  assert.equal(validate(q, ["a", "b"]).length, 0);
});

test("custom message overrides the default", () => {
  const q: QuestionDefinition = {
    id: "q",
    type: "text",
    prompt: "?",
    validations: [{ rule: "minLength", params: { value: 3 }, message: "Need 3+ chars" }],
  };
  const errors = validate(q, "ab");
  assert.equal(errors[0]?.message, "Need 3+ chars");
});

test("unknown validator throws (fails loudly)", () => {
  const q: QuestionDefinition = {
    id: "q",
    type: "text",
    prompt: "?",
    validations: [{ rule: "does_not_exist" }],
  };
  assert.throws(() => validate(q, "x"));
});
