/**
 * Load the composed conversation from the backend (GET /configuration).
 * Replaces the old local placeholder flow — the frontend now renders whatever
 * the backend serves, so a new journey needs no frontend change.
 */

import type { FlowDefinition, QuestionDefinition } from "@billbeak/conversation-engine";
import { api } from "@/api/client.ts";
import type {
  ConfirmationConfig,
  IntroConfig,
  LoadedAppConfig,
  NavigatorConfig,
  JourneySummary,
} from "./types.ts";

export async function loadAppConfig(): Promise<LoadedAppConfig> {
  const { data, error } = await api.GET("/configuration");
  if (error || !data) {
    throw new Error("Unable to load the conversation configuration.");
  }
  return {
    version: data.version,
    intro: data.intro as unknown as IntroConfig,
    navigator: data.navigator as unknown as NavigatorConfig,
    flow: data.flow as unknown as FlowDefinition,
    questions: data.questions as unknown as Record<string, QuestionDefinition>,
    journeys: data.journeys as unknown as JourneySummary[],
  };
}

export async function loadConfirmation(journeyKey: string): Promise<ConfirmationConfig | null> {
  const { data, error } = await api.GET("/configuration/{journey_key}", {
    params: { path: { journey_key: journeyKey } },
  });
  if (error || !data) return null;
  return data.confirmation as unknown as ConfirmationConfig;
}
