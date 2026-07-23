import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, nextStatus, TRANSITION_TABLE } from "./transitions.ts";

test("happy-path sequence is fully legal", () => {
  assert.equal(nextStatus("idle", "LOAD"), "loading");
  assert.equal(nextStatus("loading", "LOADED"), "question");
  assert.equal(nextStatus("question", "ANSWER"), "validating");
  assert.equal(nextStatus("validating", "VALIDATE_OK"), "transitioning");
  assert.equal(nextStatus("transitioning", "ADVANCE"), "question");
  assert.equal(nextStatus("transitioning", "REACH_TERMINAL"), "submitting");
  assert.equal(nextStatus("submitting", "SUBMIT_OK"), "completed");
});

test("upload branch is legal", () => {
  assert.equal(nextStatus("validating", "UPLOAD_START"), "uploading");
  assert.equal(nextStatus("uploading", "UPLOAD_DONE"), "transitioning");
  assert.equal(nextStatus("uploading", "UPLOAD_FAIL"), "question");
});

test("validation failure returns to question", () => {
  assert.equal(nextStatus("validating", "VALIDATE_FAIL"), "question");
});

test("cross-cutting actions", () => {
  assert.equal(nextStatus("question", "BACK"), "question");
  assert.equal(nextStatus("question", "PAUSE"), "paused");
  assert.equal(nextStatus("paused", "RESUME"), "question");
  assert.equal(nextStatus("error", "RESUME"), "question");
  assert.equal(nextStatus("completed", "RESET"), "idle");
});

test("illegal transitions throw", () => {
  assert.throws(() => nextStatus("idle", "ANSWER"));
  assert.throws(() => nextStatus("completed", "ANSWER"));
  assert.throws(() => nextStatus("question", "SUBMIT_OK"));
});

test("canTransition mirrors nextStatus without throwing", () => {
  assert.equal(canTransition("idle", "LOAD"), true);
  assert.equal(canTransition("idle", "ANSWER"), false);
});

test("every table target is itself a known status", () => {
  const statuses = new Set(Object.keys(TRANSITION_TABLE));
  for (const actions of Object.values(TRANSITION_TABLE)) {
    for (const target of Object.values(actions)) {
      assert.ok(statuses.has(target), `unknown target status "${target}"`);
    }
  }
});
