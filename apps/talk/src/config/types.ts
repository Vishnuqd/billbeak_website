/**
 * App-side shapes for the backend configuration. These describe the JSON the
 * backend serves (from the frozen config/conversations/) — the frontend renders
 * it, it does not own it.
 */

import type { FlowDefinition, QuestionDefinition } from "@billbeak/conversation-engine";

export interface IntroConfig {
  headline: string;
  supportingCopy: string[];
  reassurances: string[];
  cta: { label: string; action: string };
  privacy: string;
}

export interface NavigatorBranch {
  journey: string;
  entry: string;
}

export interface NavigatorConfig {
  questionId?: string;
  branches: Record<string, NavigatorBranch>;
}

export interface JourneySummary {
  key: string;
  name: string;
  journeyType: string | null;
  priority: number | null;
  entryNode: string;
}

export interface LoadedAppConfig {
  version: string;
  intro: IntroConfig;
  navigator: NavigatorConfig;
  flow: FlowDefinition;
  questions: Record<string, QuestionDefinition>;
  journeys: JourneySummary[];
}

/** confirmation.json shape (from GET /configuration/{journey} or POST complete). */
export interface ConfirmationConfig {
  journeyKey: string;
  title: string;
  body: string;
  whatHappensNext: { step: number; label: string; detail: string }[];
  timelinePreview: string[];
  primaryCta: { label: string; href: string };
  recommendedNextAction?: { label: string; href: string };
  howHeard?: { questionId: string };
}

/** A field inside a `group` question (contact / org / profile / chips+text). */
export interface GroupFieldConfig {
  name: string;
  type: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  validators?: { rule: string; params?: Record<string, unknown>; message?: string }[];
  countryCode?: { auto?: boolean; editable?: boolean; default?: string };
  suggested?: string;
  display?: string;
  persistAs?: string;
}
