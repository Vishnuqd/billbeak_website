/**
 * Flow registry.
 *
 * The single place that maps a flow key to its `{ flow, questions }` bundle.
 * Adding a future journey = add its file + one line here. Nothing else in the
 * app needs to know the journey exists. Later this loader can fetch flow
 * definitions from the API (edge-cached) instead of importing them statically —
 * the call site (`getFlow`) stays the same.
 */

import type { FlowDefinition, QuestionDefinition } from "@billbeak/conversation-engine";
import { placeholderFlow, placeholderQuestions } from "./placeholder.flow.ts";

export interface FlowBundle {
  readonly flow: FlowDefinition;
  readonly questions: Readonly<Record<string, QuestionDefinition>>;
}

const registry: Readonly<Record<string, FlowBundle>> = {
  placeholder: { flow: placeholderFlow, questions: placeholderQuestions },
  // employer:   { flow: employerFlow, questions: employerQuestions },   // ← later
  // university: { flow: universityFlow, questions: universityQuestions },// ← later
};

/** The flow a first-time visitor enters. Placeholder for now. */
export const DEFAULT_FLOW_KEY = "placeholder";

export function getFlow(key: string = DEFAULT_FLOW_KEY): FlowBundle {
  const bundle = registry[key];
  if (bundle === undefined) {
    throw new Error(`Unknown flow "${key}".`);
  }
  return bundle;
}
