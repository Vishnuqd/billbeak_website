/**
 * Engine factory — builds the engine from the BACKEND configuration and wires
 * the real adapters. The engine still runs the conversation locally (branching,
 * validation, instant resume); BackendSync mirrors everything to the API as the
 * system of record.
 */

import {
  ConversationEngine,
  LocalStoragePersistenceAdapter,
} from "@billbeak/conversation-engine";
import type { LoadedAppConfig } from "@/config/types.ts";
import { AppAnalyticsAdapter } from "./adapters/analytics.ts";
import { BackendUploadProvider } from "./adapters/upload.ts";
import type { BackendSync } from "./backend/sync.ts";

export function createEngine(
  appConfig: LoadedAppConfig,
  sessionId: string,
  sync: BackendSync,
): ConversationEngine {
  const engine = new ConversationEngine({
    flow: appConfig.flow,
    questions: appConfig.questions,
    sessionId,
    // Local snapshot for instant refresh/back-forward resume.
    persistence: new LocalStoragePersistenceAdapter("billbeak:talk:session:"),
    analytics: new AppAnalyticsAdapter(),
    // Safety-net provider; components upload directly for progress/cancel.
    uploads: new BackendUploadProvider(sync),
    hooks: {
      onQuestionExit: (questionId) => sync.handleQuestionExit(questionId),
    },
    onSubmit: (session) => {
      // Durable completion happens in the background (offline-tolerant).
      sync.requestComplete();
      const node = appConfig.flow.nodes[session.currentNodeId];
      const outcome = node && node.kind === "terminal" ? node.outcome : undefined;
      return Promise.resolve(outcome ?? undefined);
    },
  });
  sync.attach(engine);
  return engine;
}
