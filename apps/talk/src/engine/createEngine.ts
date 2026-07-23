/**
 * Engine factory.
 *
 * Constructs a ConversationEngine wired with the app's adapters. This is the ONE
 * place the app injects concrete persistence / analytics / upload / submit
 * behaviour. Everything above this file treats the engine as an opaque store.
 */

import {
  ConversationEngine,
  LocalStoragePersistenceAdapter,
  type PersistedSession,
} from "@billbeak/conversation-engine";
import { getFlow } from "@/config/flows/index.ts";
import { AppAnalyticsAdapter } from "./adapters/analytics.ts";
import { PlaceholderUploadProvider } from "./adapters/upload.ts";

export interface CreateEngineArgs {
  readonly flowKey?: string;
  readonly sessionId: string;
}

export function createEngine({ flowKey, sessionId }: CreateEngineArgs): ConversationEngine {
  const { flow, questions } = getFlow(flowKey);

  return new ConversationEngine({
    flow,
    questions,
    sessionId,
    persistence: new LocalStoragePersistenceAdapter("billbeak:talk:session:"),
    analytics: new AppAnalyticsAdapter(),
    uploads: new PlaceholderUploadProvider(),
    onSubmit: async (session: PersistedSession) => {
      // Placeholder. The real app POSTs the completed conversation to the API
      // (which creates the Lead / opens the Journey). Left intentionally inert
      // so the shell can be validated without a backend.
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug("[submit] conversation completed", session);
      }
    },
  });
}
