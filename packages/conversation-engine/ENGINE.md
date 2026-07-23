# Conversation Engine

`@billbeak/conversation-engine` — a **headless, framework-agnostic** engine for
config-driven conversational workflows.

It knows nothing about any product. There is no "employer", "student",
"university", "candidate", or "Talent Passport" anywhere in this package. A
journey is **data**: a flow graph + a bag of questions + a set of adapters. Point
the engine at different data and it powers a different conversation with zero
code change — the same way Stripe Checkout is one engine over many merchants, or
React is one runtime over many component trees.

> **Design principle:** the engine decides *what happens next*; the UI decides
> *what it looks like*; configuration decides *what is asked*. These three never
> leak into each other.

- **Runtime dependencies:** none.
- **Tests:** `node --test` (native TypeScript, no bundler). `npm test`.
- **Typecheck:** `npm run typecheck` (strict, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, no `any`).

---

## 1. Architecture

```
                  ┌───────────────────────── your UI (any framework) ─────────────────────────┐
                  │  reads immutable EngineState snapshots · calls submit/skip/back/pause      │
                  └───────────────▲───────────────────────────────────────────┬───────────────┘
                                  │ subscribe(listener)                        │ actions
                                  │                                            ▼
        ┌─────────────────────────────────────  ConversationEngine  ──────────────────────────────────────┐
        │                                                                                                  │
        │   Finite State Machine (machine/)      Graph interpreter (engine/resolveNext)                    │
        │   Validation runner (validation/)      Condition evaluator (conditions/)                         │
        │   Progress projector (progress/)       Question-type registry (questions/)                       │
        │                                                                                                  │
        └───────┬───────────────────┬────────────────────┬──────────────────────┬────────────────────────┘
                │ PersistenceAdapter │ AnalyticsAdapter   │ UploadProvider       │ SubmitHandler + Hooks
                ▼                    ▼                    ▼                      ▼
        localStorage / IndexedDB   GA / Mixpanel /      S3 / GCS /            your backend / animations
        / server / memory          Segment / PostHog     Cloudinary
```

Everything below the engine is an **adapter interface**. The engine imports none
of the concrete implementations — swap the adapter, keep the engine.

### Folder structure

```
src/
├─ types/            All public types. No logic. The contract.
│  ├─ flow.ts          FlowDefinition, QuestionNode, TerminalNode, Transition
│  ├─ question.ts      QuestionDefinition, QuestionTypeDescriptor/Registry
│  ├─ condition.ts     Declarative branching conditions (data)
│  ├─ answer.ts        AnswerValue union, Answer, UploadReference, FileLike
│  ├─ validation.ts    ValidationRuleRef, ValidatorFn, ValidatorRegistry
│  ├─ state.ts         EngineStatus, EngineState, ProgressInfo, PersistedSession
│  ├─ adapters.ts      PersistenceAdapter, AnalyticsAdapter, UploadProvider
│  ├─ hooks.ts         EngineHooks (animation/lifecycle seam)
│  └─ config.ts        EngineConfig, SubmitHandler
├─ machine/          The finite state machine (the ONLY place status changes)
│  └─ transitions.ts   TRANSITION_TABLE, canTransition, nextStatus
├─ conditions/       Pure evaluator for declarative branching
│  └─ evaluate.ts
├─ validation/       Built-in validators + generic runner
│  ├─ validators.ts
│  └─ run.ts
├─ questions/        Default question-type behaviours (NOT rendering)
│  └─ registry.ts
├─ progress/         Branch-aware progress projection
│  └─ progress.ts
├─ engine/           The orchestrator + graph walking + static flow validation
│  ├─ engine.ts        ConversationEngine (public API)
│  ├─ resolveNext.ts   next-node resolution
│  └─ validateFlow.ts  construction-time config validation
├─ persistence/     Reference adapters: memory, localStorage
├─ analytics/       Reference adapters: noop, function, recording, multiplex
├─ uploads/         Reference adapters: memory, failing (for tests)
├─ testing/         A GENERIC fixture flow (trip planner) — not a product
└─ index.ts         Public barrel
```

**Separation is enforced, not aspirational:** `engine/` never imports a concrete
adapter; `conditions/` and `validation/` are pure; rendering lives in no file
here at all.

---

## 2. Flow / State machine

### The finite state machine

Status never changes via ad-hoc `if`s. The engine asks `machine/transitions.ts`,
which owns the entire legal transition set. An illegal transition throws — so bad
sequencing fails loudly in tests instead of silently corrupting state.

```
 idle ─LOAD▶ loading ─LOADED▶ question ◀───────────────────────┐
                │                 │                             │
             RESTORE           ANSWER                        ADVANCE
                ▼                 ▼                             │
            restoring         validating ─VALIDATE_OK▶ transitioning
                │            │    │      │                      │
            RESTORED  VALIDATE_FAIL│  UPLOAD_START         REACH_TERMINAL
                ▼            │    │      ▼                       ▼
             question ◀──────┘    │   uploading             submitting
                                  │    │     │                  │      │
                                  │ UPLOAD_DONE│           SUBMIT_OK  SUBMIT_FAIL
                                  │    │  UPLOAD_FAIL           ▼        ▼
                                  │    ▼      │             completed  error
                                  └▶ transitioning ◀────────┘
```

Cross-cutting actions: `BACK` (question→question), `PAUSE` (question→paused),
`RESUME` (paused/error→question), `RESET` (→idle), `FAIL` (→error).

| Status | Meaning |
|---|---|
| `idle` | Constructed, not loaded. |
| `loading` / `restoring` | Fetching or rehydrating a session. |
| `question` | Awaiting an answer — the only interactive state. |
| `validating` | Running validators on a submitted value. |
| `uploading` | Streaming a file through the upload provider. |
| `transitioning` | Resolving the next node from the flow graph. |
| `submitting` | Terminal reached; running the `SubmitHandler`. |
| `completed` | Done. `outcome` is set. |
| `paused` | Suspended; resumable. |
| `error` | A step failed; `error` message is set; recoverable via `resume`/`reset`. |

### The answer lifecycle (what one `submit()` does)

1. `validate` → on failure, back to `question` with `errors` (analytics: `validation_failed`).
2. If the question type `requiresUpload` and the value is a raw file → `uploading`
   → provider returns an `UploadReference` (analytics: `upload_started/completed/failed`).
3. Record the answer (analytics: `question_answered`).
4. `transitioning` → resolve the next edge whose condition matches (first match
   wins; absent `when` = default).
5. Next node is a **question** → advance and emit `question_viewed`; next node is
   **terminal** → run `SubmitHandler`, set `outcome`, `completed`.

---

## 3. Public API of the engine

```ts
import { ConversationEngine } from "@billbeak/conversation-engine";

const engine = new ConversationEngine(config); // see EngineConfig below

// lifecycle
await engine.load();                 // start fresh, or restore a saved session
await engine.submit(value);          // answer current question → validate → advance
await engine.skip();                 // skip an optional question
engine.back();                       // step back, preserving prior answers
engine.pause();                      // suspend (persists)
engine.resume();                     // leave paused/error → question
await engine.reset();                // discard progress + clear persistence

// reading state
const state = engine.getState();     // immutable EngineState snapshot
const unsubscribe = engine.subscribe((state) => render(state));
```

`EngineState` (what the UI renders):

```ts
interface EngineState {
  status: EngineStatus;
  sessionId: string;
  currentNodeId: string | null;
  currentQuestion: QuestionDefinition | null; // render THIS
  answers: AnswersMap;                          // for prefill on back
  errors: readonly ValidationError[];           // inline validation
  history: readonly string[];
  canGoBack: boolean;
  progress: { step: number; projectedTotal: number; ratio: number };
  outcome: string | null;                       // set when completed
  error: string | null;                         // set when status === "error"
}
```

`EngineConfig` (everything injected — note nothing product-specific):

```ts
interface EngineConfig {
  flow: FlowDefinition;                          // the graph
  questions: Record<string, QuestionDefinition>; // referenced by nodes
  questionTypes?: QuestionTypeRegistry;          // extend/override built-ins
  validators?: ValidatorRegistry;                // merged over built-ins
  sessionId?: string;                            // provide to resume
  persistence?: PersistenceAdapter;
  analytics?: AnalyticsAdapter;
  uploads?: UploadProvider;
  hooks?: EngineHooks;                           // animation/lifecycle
  onSubmit?: (session) => Promise<string | void>;// persist to your backend
  now?: () => string;                            // injectable clock (tests)
  generateId?: () => string;                     // injectable ids (tests)
}
```

---

## 4. How to create a new **flow** (journey)

A flow is a directed graph. Nodes are `question` or `terminal`. Add a flow by
authoring data — no engine change.

```ts
const flow: FlowDefinition = {
  id: "my_flow",
  version: 1,
  entry: "n_start",                 // must be a question node
  nodes: {
    n_start: {
      id: "n_start", kind: "question", questionId: "q_role",
      transitions: [
        { to: "n_biz",  when: { op: "eq", path: "q_role", value: "employer" } },
        { to: "n_indiv" },          // no `when` = default (last, catch-all)
      ],
    },
    n_biz:   { id: "n_biz",   kind: "question", questionId: "q_company", transitions: [{ to: "n_done" }] },
    n_indiv: { id: "n_indiv", kind: "question", questionId: "q_name",    transitions: [{ to: "n_done" }] },
    n_done:  { id: "n_done",  kind: "terminal", outcome: "captured" },
  },
};
```

Rules the engine enforces at construction (`validateFlowConfig`):
- `entry` exists and is a **question** node.
- every question node references a known question and has ≥1 transition.
- every transition targets an existing node.
- **totality:** provide a default (unconditional) transition so a path always
  resolves; an unmatched node raises an error state.

New audiences (Investor, Government, Media, Partner…) are new flow files. That
is the whole extensibility story for journeys.

---

## 5. How to create new **questions**

Questions are configuration referenced by id:

```ts
const questions = {
  q_role: {
    id: "q_role", type: "single_choice", prompt: "Who are you?",
    options: [{ value: "employer", label: "Employer" }, { value: "individual", label: "Individual" }],
  },
  q_email: { id: "q_email", type: "email", prompt: "Email?" },       // email validator auto-applied
  q_bio:   { id: "q_bio", type: "textarea", prompt: "Bio?", optional: true,
             validations: [{ rule: "maxLength", params: { value: 500 } }] },
};
```

`optional: true` makes a question skippable and suppresses the auto `required`.

---

## 6. How to register a new **question type**

Types describe *behaviour*, never rendering. Merge yours in via
`config.questionTypes` (it overlays the built-ins):

```ts
const questionTypes = {
  rating: {
    key: "rating",
    isEmpty: (v) => v === null,                       // used by required/skip
    defaultValidations: [{ rule: "min", params: { value: 1 } }],
  },
  // set requiresUpload: true to route raw files through the UploadProvider
};
new ConversationEngine({ ...config, questionTypes });
```

The UI supplies the matching renderer for `type: "rating"`. The engine stays
oblivious. Built-ins: `single_choice`, `multi_choice`, `text`, `textarea`,
`email`, `phone`, `date`, `country`, `website`, `linkedin`, `number`, `file`.

---

## 7. How to register a new **validator**

Validators are named functions returning `true` when valid. Custom rules merge
over built-ins (custom wins on name clash):

```ts
const validators = {
  corporate_email: (value) =>
    typeof value === "string" && !/@(gmail|yahoo|outlook)\./i.test(value),
};
new ConversationEngine({ ...config, validators });
// referenced from a question: validations: [{ rule: "corporate_email", message: "Use your work email." }]
```

Built-ins: `required`, `minLength`, `maxLength`, `min`, `max`, `minSelected`,
`maxSelected`, `pattern`, `email`, `url`, `phone`. `required` is auto-applied to
any non-optional question; a type's `defaultValidations` are always applied.

---

## 8. How to register **branching conditions**

Conditions are JSON data evaluated by `conditions/evaluate.ts`. Available ops:
`always`, `never`, `exists`, `empty`, `eq`, `neq`, `in`, `nin`, `includes`
(array membership, for multi-select), `gt`, `gte`, `lt`, `lte`, and the
combinators `and`, `or`, `not`. Compose freely:

```ts
when: {
  op: "and",
  conditions: [
    { op: "eq", path: "q_role", value: "employer" },
    { op: "includes", path: "q_needs", value: "verification" },
    { op: "gte", path: "q_team_size", value: 50 },
  ],
}
```

`path` is a question id. No code is written to branch — branching is authored.

---

## 9. How to register **adapters**

All three are plain interfaces (`types/adapters.ts`). Implement and inject.

**Persistence** (`load/save/clear`): controls autosave + refresh/cross-device
resume. Reference impls: `MemoryPersistenceAdapter`, `LocalStoragePersistenceAdapter`.
IndexedDB or a server adapter implement the same three methods — no engine change.

```ts
new ConversationEngine({ ...config, sessionId: "abc", persistence: new LocalStoragePersistenceAdapter() });
```

**Analytics** (`track(event)`): the engine emits; it never calls a vendor SDK.
Wrap GA/Mixpanel/Segment/PostHog in a `track` method. Fan out with
`MultiplexAnalyticsAdapter(a, b, c)`.

**Uploads** (`upload(input) → UploadReference`): the engine knows only "give me a
reference for this file" — never S3/GCS/Cloudinary. On a `requiresUpload` type,
submitting a raw `FileLike` triggers the provider and stores the returned
reference as the answer.

**Hooks** (`types/hooks.ts`): `onStateChange`, `onTransition`,
`onQuestionEnter`, `onQuestionExit`, `onComplete` — the seam for animation
orchestration and side effects.

**SubmitHandler** (`onSubmit`): called when a terminal is reached; persist to your
backend here and optionally return an outcome label.

---

## 10. Keyboard navigation, accessibility, animation

These are **UI concerns that consume engine state** — the engine deliberately
does not touch the DOM. It gives the UI everything needed to implement them:

- **Keyboard nav:** `currentQuestion.options` are ordered with stable `value`s;
  the UI binds keys and calls `submit(value)` / `back()`.
- **Accessibility:** `errors` carry rule + message for `aria-describedby`;
  `progress` drives an `aria-valuenow`; `status` tells the UI when to move focus.
- **Animation:** `onQuestionEnter` / `onQuestionExit` / `onTransition` fire at the
  exact moments to drive enter/exit transitions.

---

## Quick start

```ts
import {
  ConversationEngine,
  MemoryPersistenceAdapter,
  RecordingAnalyticsAdapter,
  MemoryUploadProvider,
} from "@billbeak/conversation-engine";

const engine = new ConversationEngine({
  flow,
  questions,
  persistence: new MemoryPersistenceAdapter(),
  analytics: new RecordingAnalyticsAdapter(),
  uploads: new MemoryUploadProvider(),
  onSubmit: async (session) => { await api.saveLead(session); },
});

engine.subscribe((state) => render(state));
await engine.load();
// render() calls engine.submit(value) / engine.skip() / engine.back() from the UI
```
