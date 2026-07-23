/**
 * Test fixtures — a GENERIC flow with NO product knowledge.
 *
 * This is a "weekend trip planner": it exists purely to exercise the engine
 * (branching, optional skip, validation, numeric conditions, upload, multiple
 * terminals). It is intentionally unrelated to any real product, proving the
 * engine is a blank substrate configured entirely by data.
 */

import type { FlowDefinition } from "../types/flow.ts";
import type { QuestionDefinition } from "../types/question.ts";

export const tripQuestions: Readonly<Record<string, QuestionDefinition>> = {
  q_destination: {
    id: "q_destination",
    type: "single_choice",
    prompt: "Where to?",
    options: [
      { value: "beach", label: "Beach" },
      { value: "mountains", label: "Mountains" },
      { value: "city", label: "City" },
    ],
  },
  q_beach: {
    id: "q_beach",
    type: "single_choice",
    prompt: "Beach activity?",
    options: [
      { value: "snorkel", label: "Snorkel" },
      { value: "surf", label: "Surf" },
    ],
  },
  q_mountains: {
    id: "q_mountains",
    type: "single_choice",
    prompt: "Mountain activity?",
    options: [
      { value: "hike", label: "Hike" },
      { value: "ski", label: "Ski" },
    ],
  },
  q_activities: {
    id: "q_activities",
    type: "multi_choice",
    prompt: "City activities?",
    options: [
      { value: "food", label: "Food" },
      { value: "museums", label: "Museums" },
      { value: "nightlife", label: "Nightlife" },
    ],
    validations: [{ rule: "minSelected", params: { value: 1 } }],
  },
  q_days: {
    id: "q_days",
    type: "number",
    prompt: "How many days?",
    validations: [
      { rule: "min", params: { value: 1 } },
      { rule: "max", params: { value: 14 } },
    ],
  },
  q_email: {
    id: "q_email",
    type: "email",
    prompt: "Your email?",
  },
  q_notes: {
    id: "q_notes",
    type: "textarea",
    prompt: "Any notes?",
    optional: true,
  },
  q_photo: {
    id: "q_photo",
    type: "file",
    prompt: "A photo for inspiration?",
    optional: true,
  },
};

/** Builds a fresh flow object each call so tests never share mutable state. */
export function tripFlow(): FlowDefinition {
  return {
    id: "trip_planner",
    version: 1,
    entry: "n_destination",
    nodes: {
      n_destination: {
        id: "n_destination",
        kind: "question",
        questionId: "q_destination",
        transitions: [
          { to: "n_beach", when: { op: "eq", path: "q_destination", value: "beach" } },
          { to: "n_mountains", when: { op: "eq", path: "q_destination", value: "mountains" } },
          { to: "n_activities" },
        ],
      },
      n_beach: {
        id: "n_beach",
        kind: "question",
        questionId: "q_beach",
        transitions: [{ to: "n_days" }],
      },
      n_mountains: {
        id: "n_mountains",
        kind: "question",
        questionId: "q_mountains",
        transitions: [{ to: "n_days" }],
      },
      n_activities: {
        id: "n_activities",
        kind: "question",
        questionId: "q_activities",
        transitions: [{ to: "n_days" }],
      },
      n_days: {
        id: "n_days",
        kind: "question",
        questionId: "q_days",
        transitions: [{ to: "n_email" }],
      },
      n_email: {
        id: "n_email",
        kind: "question",
        questionId: "q_email",
        transitions: [{ to: "n_notes" }],
      },
      n_notes: {
        id: "n_notes",
        kind: "question",
        questionId: "q_notes",
        transitions: [{ to: "n_photo" }],
      },
      n_photo: {
        id: "n_photo",
        kind: "question",
        questionId: "q_photo",
        transitions: [
          { to: "n_end_long", when: { op: "gt", path: "q_days", value: 7 } },
          { to: "n_end" },
        ],
      },
      n_end: { id: "n_end", kind: "terminal", outcome: "planned" },
      n_end_long: { id: "n_end_long", kind: "terminal", outcome: "extended" },
    },
  };
}
