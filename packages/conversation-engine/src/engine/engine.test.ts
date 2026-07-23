import { test } from "node:test";
import assert from "node:assert/strict";

import { ConversationEngine } from "./engine.ts";
import { MemoryPersistenceAdapter } from "../persistence/memory.ts";
import { RecordingAnalyticsAdapter } from "../analytics/adapters.ts";
import { MemoryUploadProvider, FailingUploadProvider } from "../uploads/memory.ts";
import { tripFlow, tripQuestions } from "../testing/fixtures.ts";
import { isUploadReference } from "../types/answer.ts";
import type { EngineConfig } from "../types/config.ts";
import type { EngineStatus } from "../types/state.ts";

function makeEngine(overrides: Partial<EngineConfig> = {}): {
  engine: ConversationEngine;
  analytics: RecordingAnalyticsAdapter;
} {
  const analytics = new RecordingAnalyticsAdapter();
  const engine = new ConversationEngine({
    flow: tripFlow(),
    questions: tripQuestions,
    persistence: new MemoryPersistenceAdapter(),
    analytics,
    uploads: new MemoryUploadProvider(),
    sessionId: "sess-1",
    now: () => "2026-07-23T00:00:00.000Z",
    generateId: () => "generated-id",
    ...overrides,
  });
  return { engine, analytics };
}

function currentQuestionId(engine: ConversationEngine): string | null {
  return engine.getState().currentQuestion?.id ?? null;
}

test("load starts at the entry question", async () => {
  const { engine } = makeEngine();
  await engine.load();
  const state = engine.getState();
  assert.equal(state.status, "question");
  assert.equal(state.currentQuestion?.id, "q_destination");
  assert.equal(state.canGoBack, false);
});

test("branching: city goes to activities, beach goes to beach activity", async () => {
  const { engine: city } = makeEngine();
  await city.load();
  await city.submit("city");
  assert.equal(currentQuestionId(city), "q_activities");

  const { engine: beach } = makeEngine();
  await beach.load();
  await beach.submit("beach");
  assert.equal(currentQuestionId(beach), "q_beach");

  const { engine: mtn } = makeEngine();
  await mtn.load();
  await mtn.submit("mountains");
  assert.equal(currentQuestionId(mtn), "q_mountains");
});

test("validation blocks advance and returns to the same question", async () => {
  const { engine } = makeEngine();
  await engine.load();
  await engine.submit("city");
  await engine.submit([]); // minSelected:1 fails
  const state = engine.getState();
  assert.equal(state.status, "question");
  assert.equal(state.currentQuestion?.id, "q_activities");
  // Empty array fails both auto-`required` and `minSelected`.
  assert.ok(state.errors.length >= 1);

  await engine.submit(["food"]);
  assert.equal(currentQuestionId(engine), "q_days");
});

test("back navigation preserves prior answers", async () => {
  const { engine } = makeEngine();
  await engine.load();
  await engine.submit("beach");
  assert.equal(currentQuestionId(engine), "q_beach");

  engine.back();
  const state = engine.getState();
  assert.equal(state.currentQuestion?.id, "q_destination");
  assert.equal(state.answers["q_destination"]?.value, "beach", "answer preserved for prefill");
});

test("skip is allowed on optional questions, rejected on required", async () => {
  const { engine } = makeEngine();
  await engine.load();
  await assert.rejects(() => engine.skip(), /required and cannot be skipped/);

  await engine.submit("beach");
  await engine.submit("surf");
  await engine.submit(3);
  await engine.submit("a@b.co");
  assert.equal(currentQuestionId(engine), "q_notes");
  await engine.skip(); // q_notes is optional
  assert.equal(currentQuestionId(engine), "q_photo");
  assert.equal(engine.getState().answers["q_notes"]?.skipped, true);
});

test("full happy path completes with the 'planned' outcome", async () => {
  const submitted: string[] = [];
  const { engine } = makeEngine({
    onSubmit: (session) => {
      submitted.push(session.currentNodeId);
      return Promise.resolve();
    },
  });
  await engine.load();
  await engine.submit("beach");
  await engine.submit("surf");
  await engine.submit(3);
  await engine.submit("a@b.co");
  await engine.skip(); // notes
  await engine.skip(); // photo
  const state = engine.getState();
  assert.equal(state.status, "completed");
  assert.equal(state.outcome, "planned");
  assert.equal(submitted.length, 1);
});

test("numeric branch routes to the 'extended' terminal when days > 7", async () => {
  const { engine } = makeEngine();
  await engine.load();
  await engine.submit("beach");
  await engine.submit("surf");
  await engine.submit(10);
  await engine.submit("a@b.co");
  await engine.skip();
  await engine.skip();
  assert.equal(engine.getState().outcome, "extended");
});

test("onSubmit may override the outcome label", async () => {
  const { engine } = makeEngine({ onSubmit: () => Promise.resolve("custom-outcome") });
  await engine.load();
  await engine.submit("city");
  await engine.submit(["food"]);
  await engine.submit(2);
  await engine.submit("a@b.co");
  await engine.skip();
  await engine.skip();
  assert.equal(engine.getState().outcome, "custom-outcome");
});

test("file question routes through the upload provider", async () => {
  const { engine } = makeEngine();
  await engine.load();
  await engine.submit("beach");
  await engine.submit("surf");
  await engine.submit(3);
  await engine.submit("a@b.co");
  await engine.skip(); // notes
  assert.equal(currentQuestionId(engine), "q_photo");
  await engine.submit({ name: "beach.png", size: 1234, type: "image/png" });
  const state = engine.getState();
  const stored = state.answers["q_photo"]?.value;
  assert.ok(stored && isUploadReference(stored), "answer stored as an UploadReference");
  assert.equal(state.status, "completed");
});

test("upload failure returns to the question with an error", async () => {
  const { engine } = makeEngine({ uploads: new FailingUploadProvider("boom") });
  await engine.load();
  await engine.submit("beach");
  await engine.submit("surf");
  await engine.submit(3);
  await engine.submit("a@b.co");
  await engine.skip();
  await engine.submit({ name: "x.png", size: 1, type: "image/png" });
  const state = engine.getState();
  assert.equal(state.status, "question");
  assert.equal(state.currentQuestion?.id, "q_photo");
  assert.equal(state.errors[0]?.rule, "upload");
});

test("restore resumes an in-progress session from persistence", async () => {
  const persistence = new MemoryPersistenceAdapter();
  const first = makeEngine({ persistence }).engine;
  await first.load();
  await first.submit("city");
  await first.submit(["food"]);
  assert.equal(currentQuestionId(first), "q_days");

  // A fresh engine with the same sessionId + store must resume, not restart.
  const second = makeEngine({ persistence }).engine;
  await second.load();
  const state = second.getState();
  assert.equal(state.currentQuestion?.id, "q_days");
  assert.equal(state.answers["q_destination"]?.value, "city");
});

test("state transitions follow the FSM for one submit", async () => {
  const transitions: Array<[EngineStatus, EngineStatus]> = [];
  const { engine } = makeEngine({
    hooks: { onTransition: (from, to) => transitions.push([from, to]) },
  });
  await engine.load();
  transitions.length = 0;
  await engine.submit("city");
  assert.deepEqual(transitions, [
    ["question", "validating"],
    ["validating", "transitioning"],
    ["transitioning", "question"],
  ]);
});

test("analytics receives the expected event stream", async () => {
  const { engine, analytics } = makeEngine();
  await engine.load();
  await engine.submit("city");
  const seen = analytics.typesSeen();
  assert.ok(seen.includes("conversation_started"));
  assert.ok(seen.includes("question_viewed"));
  assert.ok(seen.includes("question_answered"));
});

test("reset clears progress and persistence", async () => {
  const persistence = new MemoryPersistenceAdapter();
  const { engine } = makeEngine({ persistence });
  await engine.load();
  await engine.submit("city");
  await engine.reset();
  assert.equal(engine.getState().status, "idle");
  assert.equal(await persistence.load("sess-1"), null);
});

test("pause and resume", async () => {
  const { engine } = makeEngine();
  await engine.load();
  await engine.submit("city");
  engine.pause();
  assert.equal(engine.getState().status, "paused");
  engine.resume();
  assert.equal(engine.getState().status, "question");
  assert.equal(currentQuestionId(engine), "q_activities");
});

test("subscribe receives snapshots and unsubscribes cleanly", async () => {
  const { engine } = makeEngine();
  let count = 0;
  const unsub = engine.subscribe(() => {
    count += 1;
  });
  await engine.load();
  const afterLoad = count;
  assert.ok(afterLoad > 0);
  unsub();
  await engine.submit("city");
  assert.equal(count, afterLoad, "no notifications after unsubscribe");
});
