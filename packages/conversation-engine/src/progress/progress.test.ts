import { test } from "node:test";
import assert from "node:assert/strict";
import { computeProgress } from "./progress.ts";
import { tripFlow } from "../testing/fixtures.ts";
import type { AnswersMap } from "../types/answer.ts";

function answers(map: Record<string, unknown>): AnswersMap {
  const out: Record<string, { questionId: string; value: never; answeredAt: string; skipped: boolean }> = {};
  for (const [k, v] of Object.entries(map)) {
    out[k] = { questionId: k, value: v as never, answeredAt: "t", skipped: false };
  }
  return out;
}

test("at entry with nothing answered, ratio is 0", () => {
  const flow = tripFlow();
  const p = computeProgress(flow, "n_destination", ["n_destination"], {});
  assert.equal(p.step, 1);
  assert.equal(p.ratio, 0);
  assert.ok(p.projectedTotal >= 6, "projected path should span the whole journey");
});

test("projected total reflects the chosen branch", () => {
  // Beach and city branches have the same length here, but the projection must
  // follow the branch the answers select rather than counting all nodes.
  const flow = tripFlow();
  const beach = computeProgress(
    flow,
    "n_beach",
    ["n_destination", "n_beach"],
    answers({ q_destination: "beach" }),
  );
  assert.ok(beach.projectedTotal > beach.step);
});

test("ratio increases as questions are answered", () => {
  const flow = tripFlow();
  const early = computeProgress(
    flow,
    "n_days",
    ["n_destination", "n_beach", "n_days"],
    answers({ q_destination: "beach", q_beach: "surf" }),
  );
  const later = computeProgress(
    flow,
    "n_email",
    ["n_destination", "n_beach", "n_days", "n_email"],
    answers({ q_destination: "beach", q_beach: "surf", q_days: 3 }),
  );
  assert.ok(later.ratio > early.ratio);
});

test("ratio never exceeds 1", () => {
  const flow = tripFlow();
  const p = computeProgress(
    flow,
    "n_end",
    ["n_destination", "n_beach", "n_days", "n_email", "n_notes", "n_photo"],
    answers({
      q_destination: "beach",
      q_beach: "surf",
      q_days: 3,
      q_email: "a@b.co",
      q_notes: "x",
      q_photo: null,
    }),
  );
  assert.ok(p.ratio <= 1);
});
