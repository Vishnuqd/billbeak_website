# billbeak.com/talk — Application

The `/talk` application: the front door into the Billbeak ecosystem. It is a
**pure consumer** of `@billbeak/conversation-engine` — the way Stripe Checkout
consumes the Stripe SDK. The engine decides *what happens next*; this app decides
*what it looks like*. No business logic and no journey rules live here — those
are configuration handed to the engine.

- **Stack:** Vite + React 18 + TypeScript (strict). Hand-written CSS with design
  tokens — no UI framework, no Bootstrap, no Tailwind.
- **Design:** dark-first, editorial, calm. Centered ≤680px column, large type,
  generous space, 250ms GPU transitions, `prefers-reduced-motion` respected.
- **Verify:** `npm run typecheck` · `npm run build` · `npm run dev`.

---

## 1. Application architecture

```
main.tsx
 └─ App.tsx
     └─ ErrorBoundary                     ← catches render errors → calm fallback
         └─ ThemeProvider                 ← dark-first, data-theme on <html>
             └─ EngineProvider            ← builds the engine, exposes it as a store
                 └─ Router                ← URL entry (/talk) → page
                     └─ TalkPage          ← maps EngineStatus → screen
                         ├─ LoadingState        (idle/loading/restoring/submitting)
                         ├─ ConversationLayout  (question/validating/uploading/transitioning)
                         │   ├─ TopBar          (back · theme · close)
                         │   ├─ QuestionView    (renders current question)
                         │   │   └─ <Renderer/> (by question.type, via registry)
                         │   └─ footer: ProgressBar + KeyboardHints
                         ├─ CompletionState     (completed)
                         ├─ ErrorState          (error)
                         └─ PausedState         (paused)
```

### Folder structure

```
src/
├─ main.tsx · App.tsx            Entry + provider/boundary composition
├─ config/
│  └─ flows/                     PLACEHOLDER flow + the flow registry (data)
├─ engine/
│  ├─ createEngine.ts            The one place adapters are injected
│  └─ adapters/                  App analytics + placeholder upload provider
├─ providers/
│  ├─ EngineProvider.tsx         React ⇄ engine bridge (external store)
│  └─ ThemeProvider.tsx          Dark-first theme + toggle
├─ hooks/                        useOnline, useGlobalKeys
├─ routes/Router.tsx             Minimal URL router
├─ pages/                        TalkPage (status→screen), NotFoundPage
├─ layouts/ConversationLayout.tsx  Top bar · content · footer
├─ components/
│  ├─ shell/                     TopBar, ProgressBar, KeyboardHints, ThemeToggle, OfflineBanner
│  ├─ questions/                 QuestionView + renderers + registry + shared pieces
│  ├─ states/                    Loading / Completion / Error / Paused
│  ├─ primitives/                Button
│  └─ ErrorBoundary.tsx
├─ icons/                        Inline SVGs (CSP-safe, currentColor)
├─ lib/session.ts               Session id (refresh/resume)
└─ theme/                        tokens.css · global.css · app.css
```

**Rule:** business logic never lives in components. Components read an immutable
`EngineState` snapshot and dispatch engine actions. That is the whole contract.

---

## 2. How the engine integrates

The engine is headless and store-shaped (`subscribe` + `getState`). Two seams:

**Construction** — `engine/createEngine.ts` is the *only* place concrete adapters
are chosen (localStorage persistence, app analytics, a placeholder upload
provider, and the `onSubmit` that will later POST the completed conversation to
the API). Swapping any adapter changes nothing else.

**Binding** — `providers/EngineProvider.tsx` wraps the engine in a React-18
external store and exposes it via context:

```tsx
const state = useEngineState();          // immutable snapshot, re-renders on change
const { engine, restart } = useEngine(); // dispatch actions + start over
// e.g. engine.submit(value) · engine.back() · engine.skip() · engine.resume()
```

Two deliberate correctness details:

- **Stable snapshots.** `engine.getState()` returns a fresh object each call, which
  would make `useSyncExternalStore` loop forever. The provider caches the latest
  snapshot and only updates it inside the subscription, giving React the
  referential stability it requires.
- **Idempotent load.** `load()` runs only when status is `idle`, so React
  StrictMode's double-invoked effects (and any re-render) can't trigger an
  illegal transition.

---

## 3. Rendering pipeline

```
EngineState.status ──▶ TalkPage picks a screen
        │
        └─(question)─▶ ConversationLayout
                          └─ QuestionView (keyed by currentNodeId → fresh mount + enter animation)
                               ├─ header: eyebrow · prompt · help
                               └─ getRenderer(question.type) → renderer in a <Suspense>
                                    · reads initialValue (prefill on back)
                                    · reads busy / uploading / errors from the snapshot
                                    · calls onSubmit(value) / onSkip() → engine
```

- **Question types → renderers** are resolved by `components/questions/registry.ts`
  (`single_choice · multi_choice · text · email · phone · date · country · website
  · linkedin · number · textarea · file`), with a text-field fallback for
  unknown/custom types.
- **Progress** comes straight from `state.progress` (the engine projects it over
  the reachable branch); the bar just renders it.
- **Motion:** each question is keyed by node id, so it mounts fresh and plays the
  250ms enter animation (`@keyframes bb-enter`). Disabled under reduced motion.

### Keyboard & accessibility
- **Single choice:** `↑/↓/←/→` move the highlight, `Enter`/`Space`/click commit,
  digits `1–9` jump-select. `role="radiogroup"` with roving tabindex.
- **Multi choice:** `role="group"` of `role="checkbox"` toggles; `↑/↓` move focus;
  Continue commits.
- **Text/long-text:** `Enter` submits (⌘/Ctrl+`Enter` for textarea). Inputs carry
  `aria-invalid` / `aria-describedby` wired to the error region (`role="alert"`).
- **Global:** `Esc` goes back. `Tab`/`Shift-Tab` use native focus order.

### Error / offline / resilience
- Render errors → `ErrorBoundary` (calm reload screen, never a stack trace).
- Engine errors (e.g. upload failure) → `ErrorState` with retry, or the field-level
  upload error with a "Try again" action.
- Offline → non-blocking banner; progress is saved locally so nothing is lost.
- Refresh/resume → session id in localStorage; the engine restores from
  persistence on load.

---

## 4. How routes work

The island is served under `/talk` (Vite `base: "/talk/"`). `routes/Router.tsx`
is intentionally tiny and dependency-free: it maps the URL entry point to a page
(`/talk` → `TalkPage`, else `NotFoundPage`). **In-app navigation is driven by the
engine's state machine, not the URL** — the "screens" are `EngineStatus` values,
so there is no route table to keep in sync with the conversation. Deep-link/resume
by session id can be added here later without touching the conversation UI.

---

## 5. How themes work

Dark-first. An inline script in `index.html` sets `data-theme` on `<html>` before
first paint (no flash), reading the stored choice or the system preference.
`ThemeProvider` keeps React in sync, persists changes, and exposes `useTheme()`
for the toggle. All colors are CSS variables in `theme/tokens.css`; `:root` is the
dark palette and `[data-theme="light"]` overrides it. Components reference tokens
only — no hard-coded colors.

---

## 6. How future flows plug in

This shell ships one **placeholder** flow (`config/flows/placeholder.flow.ts`) to
validate the experience end-to-end. Real journeys are added as *data*, with **zero
application code changes**:

1. **Author a flow file** — `config/flows/employer.flow.ts` exporting a
   `FlowDefinition` + its `QuestionDefinition`s (see ENGINE.md §4–5).
2. **Register it** — one line in `config/flows/index.ts`:
   ```ts
   employer: { flow: employerFlow, questions: employerQuestions },
   ```
3. **Select it** — set `DEFAULT_FLOW_KEY`, or choose the key per entry point
   (a "which door?" root flow can branch into the others). Later, `getFlow` can
   fetch definitions from the API instead of importing them — the call site is
   unchanged.

Only when a journey introduces a **brand-new question type** do you add an app
renderer (a component + one line in `components/questions/registry.ts`) — and even
then, nothing else changes. Everything else — branching, validation, progress,
persistence, analytics, uploads, completion — is already handled by the engine
and this shell.

**Not built here (by design):** the employer/university/student/corporate/careers
journeys and any Talent Passport logic. Those are the next prompt's job.

---

## Scripts

```
npm run dev         # Vite dev server (http://localhost:5173/talk/)
npm run typecheck   # strict tsc, no emit
npm run build       # typecheck + production build to dist/
npm run preview     # serve the production build
```

Production build is code-split (the upload renderer is a lazy chunk) and emits a
self-contained static bundle deployable to the same S3/CDN as the marketing site
under `/talk/`.

---

## Backend integration

The placeholder adapters are gone — the app is fully wired to the FastAPI backend.

- **Generated client.** `src/api/schema.d.ts` is generated from the backend's OpenAPI
  (`npm run generate:api`) and consumed via `openapi-fetch` (`src/api/client.ts`).
  No hand-written per-endpoint fetch wrappers.
- **Config from backend.** `EngineProvider` loads the composed flow + questions from
  `GET /configuration` — the old local placeholder flow was removed. A new journey
  needs no frontend change.
- **Durable persistence.** `engine/backend/sync.ts` mirrors the conversation to the API
  as system of record: creates the Journey when the navigator is answered, POSTs each
  answer, and POSTs completion — through a serial, **offline-tolerant queue** that
  flushes on reconnect. localStorage still gives instant refresh/back-forward resume.
- **Uploads.** `engine/adapters/upload.ts` uploads directly to `POST /journeys/{id}/uploads`
  via XHR with real progress, cancel and retry; the returned reference is stored by the engine.
- **Renderers added.** `group` (contact / organisation / profile / chips+text), phone with
  country selector, editable suggested answers, `{firstName}` interpolation, the welcome
  screen (intro.json) and the rich confirmation screen (what-happens-next + live timeline +
  how-heard). Theme switched to the warm Billbeak palette (cream / brown / rust).

### Run the full product
```bash
# 1. backend (see services/api/README.md)
cd services/api && ./.venv/bin/uvicorn app.main:app --port 8000

# 2. frontend
cd apps/talk && npm install && npm run dev      # http://localhost:5173/talk/
# point elsewhere with VITE_API_URL (see .env.example); CORS already allows :5173 and :4173
```
