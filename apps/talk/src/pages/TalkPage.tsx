/**
 * TalkPage — maps EngineStatus to a screen. This is the app's "router" in
 * spirit: the engine's state machine, not the URL, decides what the visitor
 * sees. The URL router only handles entry/deeplink (see routes/Router).
 */

import { useEngine, useEngineState } from "@/providers/EngineProvider.tsx";
import { useOnline } from "@/hooks/useOnline.ts";
import { useGlobalKeys } from "@/hooks/useGlobalKeys.ts";
import { ConversationLayout } from "@/layouts/ConversationLayout.tsx";
import { LoadingState } from "@/components/states/LoadingState.tsx";
import { CompletionState } from "@/components/states/CompletionState.tsx";
import { ErrorState } from "@/components/states/ErrorState.tsx";
import { PausedState } from "@/components/states/PausedState.tsx";
import { OfflineBanner } from "@/components/shell/OfflineBanner.tsx";
import type { ReactElement } from "react";

const HOME_URL = "/";

export function TalkPage() {
  const state = useEngineState();
  const { engine, restart } = useEngine();
  const online = useOnline();

  const onClose = () => {
    window.location.href = HOME_URL;
  };

  useGlobalKeys({
    enabled: state.status === "question",
    onBack: state.canGoBack ? () => engine.back() : undefined,
  });

  let screen: ReactElement;
  switch (state.status) {
    case "idle":
    case "loading":
    case "restoring":
    case "submitting":
      screen = <LoadingState />;
      break;
    case "completed":
      screen = <CompletionState onRestart={restart} onClose={onClose} />;
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

  return (
    <>
      {!online && <OfflineBanner />}
      {screen}
    </>
  );
}
