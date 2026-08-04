/**
 * TalkPage — top-level screen router driven by the config-load phase and then by
 * the engine's state machine. Handles the welcome gate, offline banner, and the
 * rich confirmation screen.
 */

import { useState } from "react";
import type { ReactElement } from "react";
import {
  useAppConfig,
  useEngine,
  useEngineState,
  useEngineStatus,
} from "@/providers/EngineProvider.tsx";
import { useOnline } from "@/hooks/useOnline.ts";
import { useGlobalKeys } from "@/hooks/useGlobalKeys.ts";
import { ConversationLayout } from "@/layouts/ConversationLayout.tsx";
import { LoadingState } from "@/components/states/LoadingState.tsx";
import { ErrorState } from "@/components/states/ErrorState.tsx";
import { PausedState } from "@/components/states/PausedState.tsx";
import { WelcomeScreen } from "@/components/states/WelcomeScreen.tsx";
import { ConfirmationScreen } from "@/components/states/ConfirmationScreen.tsx";
import { OfflineBanner } from "@/components/shell/OfflineBanner.tsx";

export function TalkPage() {
  const { phase, reload } = useEngineStatus();

  if (phase === "loading") return <LoadingState />;
  if (phase === "error") {
    return (
      <ErrorState
        message="We couldn't reach Billbeak just now. Check your connection and try again."
        onRetry={reload}
        onRestart={reload}
      />
    );
  }
  return <Conversation />;
}

function Conversation(): ReactElement {
  const state = useEngineState();
  const { engine, restart } = useEngine();
  const config = useAppConfig();
  const online = useOnline();
  const [begun, setBegun] = useState(false);

  const atStart = state.currentNodeId === config.flow.entry && !state.answers["sh_name"];
  const showWelcome = atStart && !begun;

  useGlobalKeys({
    enabled: state.status === "question" && !showWelcome,
    onBack: state.canGoBack ? () => engine.back() : undefined,
  });

  const onClose = () => {
    window.location.href = "/";
  };

  let screen: ReactElement;
  if (showWelcome) {
    screen = <WelcomeScreen intro={config.intro} onBegin={() => setBegun(true)} />;
  } else {
    switch (state.status) {
      case "idle":
      case "loading":
      case "restoring":
      case "submitting":
        screen = <LoadingState />;
        break;
      case "completed":
        screen = <ConfirmationScreen onRestart={restart} />;
        break;
      case "error":
        screen = (
          <ErrorState message={state.error} onRetry={() => engine.resume()} onRestart={restart} />
        );
        break;
      case "paused":
        screen = <PausedState onResume={() => engine.resume()} />;
        break;
      case "question":
      case "validating":
      case "uploading":
      case "transitioning":
        screen = <ConversationLayout state={state} engine={engine} onClose={onClose} />;
        break;
    }
  }

  return (
    <>
      {!online && <OfflineBanner />}
      {screen}
    </>
  );
}
