/**
 * Condition evaluator — the pure interpreter for declarative branching.
 *
 * No side effects, no engine state, no product knowledge. Given a condition and
 * the current answers, return a boolean. This function is what makes "questions
 * are data" true for the branching layer.
 */

import type { AnswerValue, AnswersMap } from "../types/answer.ts";
import type { Condition, ConditionScalar } from "../types/condition.ts";

function readValue(answers: AnswersMap, path: string): AnswerValue | undefined {
  const answer = answers[path];
  return answer ? answer.value : undefined;
}

function isEmpty(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function toNumber(value: AnswerValue | undefined): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function scalarEquals(value: AnswerValue | undefined, target: ConditionScalar): boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value === target;
  }
  return false;
}

function compareNumeric(
  value: AnswerValue | undefined,
  target: number,
  cmp: (a: number, b: number) => boolean,
): boolean {
  const n = toNumber(value);
  return n !== null && cmp(n, target);
}

export function evaluateCondition(condition: Condition, answers: AnswersMap): boolean {
  switch (condition.op) {
    case "always":
      return true;
    case "never":
      return false;
    case "exists": {
      const v = readValue(answers, condition.path);
      return v !== undefined && !isEmpty(v);
    }
    case "empty":
      return isEmpty(readValue(answers, condition.path));
    case "eq":
      return scalarEquals(readValue(answers, condition.path), condition.value);
    case "neq":
      return !scalarEquals(readValue(answers, condition.path), condition.value);
    case "in":
      return condition.value.some((candidate) =>
        scalarEquals(readValue(answers, condition.path), candidate),
      );
    case "nin":
      return !condition.value.some((candidate) =>
        scalarEquals(readValue(answers, condition.path), candidate),
      );
    case "includes": {
      const v = readValue(answers, condition.path);
      return Array.isArray(v) && v.includes(condition.value as string);
    }
    case "gt":
      return compareNumeric(readValue(answers, condition.path), condition.value, (a, b) => a > b);
    case "gte":
      return compareNumeric(readValue(answers, condition.path), condition.value, (a, b) => a >= b);
    case "lt":
      return compareNumeric(readValue(answers, condition.path), condition.value, (a, b) => a < b);
    case "lte":
      return compareNumeric(readValue(answers, condition.path), condition.value, (a, b) => a <= b);
    case "and":
      return condition.conditions.every((c) => evaluateCondition(c, answers));
    case "or":
      return condition.conditions.some((c) => evaluateCondition(c, answers));
    case "not":
      return !evaluateCondition(condition.condition, answers);
  }
}
