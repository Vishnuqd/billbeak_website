/**
 * The conversation chrome: back/close top bar, a centered content column capped
 * near 680px, and a footer with progress + keyboard hints. Purely presentational
 * — it reads the snapshot and dispatches engine actions.
 */

import type { ConversationEngine, EngineState } from "@billbeak/conversation-engine";
import { TopBar } from "@/components/shell/TopBar.tsx";
import { ProgressBar } from "@/components/shell/ProgressBar.tsx";
import { KeyboardHints } from "@/components/shell/KeyboardHints.tsx";
import { QuestionView } from "@/components/questions/QuestionView.tsx";

interface ConversationLayoutProps {
  readonly state: EngineState;
  readonly engine: ConversationEngine;
  readonly onClose: () => void;
}

export function ConversationLayout({ state, engine, onClose }: ConversationLayoutProps) {
  const showChoiceHints = state.currentQuestion?.type === "single_choice";

  return (
    <div className="bb-layout">
      <TopBar canGoBack={state.canGoBack} onBack={() => engine.back()} onClose={onClose} />

      <main className="bb-main">
        <div className="bb-content">
          {/* Keyed by node id so each question mounts fresh and re-animates. */}
          <QuestionView key={state.currentNodeId ?? "q"} state={state} engine={engine} />
        </div>
      </main>

      <footer className="bb-footer">
        <ProgressBar progress={state.progress} />
        <KeyboardHints showChoiceHints={showChoiceHints} canGoBack={state.canGoBack} />
      </footer>
    </div>
  );
}
