/**
 * QuestionView — renders the current question's header and delegates the input
 * to the registered renderer. It is a thin, presentational bridge: it reads the
 * EngineState snapshot and dispatches engine actions, never mutating state.
 *
 * The parent keys this by node id, so each question mounts fresh (resetting local
 * input state and replaying the enter animation).
 */

import { Suspense } from "react";
import type { AnswerValue, ConversationEngine, EngineState } from "@billbeak/conversation-engine";
import { getRenderer } from "./registry.ts";

interface QuestionViewProps {
  readonly state: EngineState;
  readonly engine: ConversationEngine;
}

export function QuestionView({ state, engine }: QuestionViewProps) {
  const question = state.currentQuestion;
  if (question === null) return null;

  const Renderer = getRenderer(question.type);
  const initialValue = state.answers[question.id]?.value;
  const busy = state.status !== "question";
  const uploading = state.status === "uploading";

  const onSubmit = (value: AnswerValue) => {
    void engine.submit(value);
  };
  const onSkip = () => {
    void engine.skip();
  };

  return (
    <section className="bb-question" aria-live="polite">
      <p className="bb-question__eyebrow">{String(state.progress.step).padStart(2, "0")}</p>
      <h1 className="bb-question__prompt">{question.prompt}</h1>
      {question.help && <p className="bb-question__help">{question.help}</p>}

      <div className="bb-question__body">
        <Suspense fallback={<div className="bb-spinner" />}>
          <Renderer
            question={question}
            initialValue={initialValue}
            busy={busy}
            uploading={uploading}
            errors={state.errors}
            onSubmit={onSubmit}
            onSkip={onSkip}
          />
        </Suspense>
      </div>
    </section>
  );
}
