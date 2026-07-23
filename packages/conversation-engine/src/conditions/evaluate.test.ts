import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCondition } from "./evaluate.ts";
import type { AnswersMap } from "../types/answer.ts";

function answers(map: Record<string, unknown>): AnswersMap {
  const out: Record<string, { questionId: string; value: never; answeredAt: string; skipped: boolean }> = {};
  for (const [k, v] of Object.entries(map)) {
    out[k] = { questionId: k, value: v as never, answeredAt: "t", skipped: false };
  }
  return out;
}

test("always / never", () => {
  assert.equal(evaluateCondition({ op: "always" }, {}), true);
  assert.equal(evaluateCondition({ op: "never" }, {}), false);
});

test("eq / neq", () => {
  const a = answers({ color: "red" });
  assert.equal(evaluateCondition({ op: "eq", path: "color", value: "red" }, a), true);
  assert.equal(evaluateCondition({ op: "eq", path: "color", value: "blue" }, a), false);
  assert.equal(evaluateCondition({ op: "neq", path: "color", value: "blue" }, a), true);
});

test("in / nin", () => {
  const a = answers({ size: "m" });
  assert.equal(evaluateCondition({ op: "in", path: "size", value: ["s", "m"] }, a), true);
  assert.equal(evaluateCondition({ op: "nin", path: "size", value: ["s", "m"] }, a), false);
});

test("includes for multi-select arrays", () => {
  const a = answers({ tags: ["food", "museums"] });
  assert.equal(evaluateCondition({ op: "includes", path: "tags", value: "food" }, a), true);
  assert.equal(evaluateCondition({ op: "includes", path: "tags", value: "nightlife" }, a), false);
});

test("numeric comparisons (coerce string answers)", () => {
  const a = answers({ days: "10" });
  assert.equal(evaluateCondition({ op: "gt", path: "days", value: 7 }, a), true);
  assert.equal(evaluateCondition({ op: "lte", path: "days", value: 10 }, a), true);
  assert.equal(evaluateCondition({ op: "lt", path: "days", value: 10 }, a), false);
});

test("exists / empty", () => {
  const a = answers({ name: "  ", email: "x@y.z" });
  assert.equal(evaluateCondition({ op: "exists", path: "email" }, a), true);
  assert.equal(evaluateCondition({ op: "exists", path: "name" }, a), false, "blank string is not 'exists'");
  assert.equal(evaluateCondition({ op: "empty", path: "name" }, a), true);
  assert.equal(evaluateCondition({ op: "exists", path: "missing" }, a), false);
});

test("boolean and / or / not composition", () => {
  const a = answers({ role: "employer", size: "large" });
  const cond = {
    op: "and" as const,
    conditions: [
      { op: "eq" as const, path: "role", value: "employer" },
      { op: "or" as const, conditions: [
        { op: "eq" as const, path: "size", value: "large" },
        { op: "eq" as const, path: "size", value: "huge" },
      ] },
      { op: "not" as const, condition: { op: "eq" as const, path: "role", value: "student" } },
    ],
  };
  assert.equal(evaluateCondition(cond, a), true);
});
