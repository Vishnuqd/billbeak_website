/**
 * QuestionView — renders the current question's header (with {token} personal-
 * isation) and delegates the input to the registered renderer. Thin and
 * presentational: reads the EngineState snapshot, dispatches engine actions.
 */

import { Suspense } from "react";
import type { AnswerValue, ConversationEngine, EngineState } from "@billbeak/conversation-engine";
import { useAppConfig } from "@/providers/EngineProvider.tsx";
import { buildTokens, interpolate } from "@/lib/interpolate.ts";
import { getRenderer } from "./registry.ts";

interface QuestionViewProps {
  readonly state: EngineState;
  readonly engine: ConversationEngine;
}

export function QuestionView({ state, engine }: QuestionViewProps) {
  const config = useAppConfig();
  const question = state.currentQuestion;
  if (question === null) return null;

  const tokens = buildTokens(state.answers, config.questions);
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
      <h1 className="bb-question__prompt">{interpolate(question.prompt, tokens)}</h1>
      {question.help && <p className="bb-question__help">{interpolate(question.help, tokens)}</p>}

      <div className="bb-question__body">
        <Suspense fallback={<div className="bb-spinner" />}>
          <Renderer
            question={question}
            initialValue={initialValue}
            tokens={tokens}
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
