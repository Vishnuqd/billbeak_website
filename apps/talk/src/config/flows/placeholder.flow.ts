/**
 * PLACEHOLDER flow — NOT a real Billbeak journey.
 *
 * This exists only to validate the application shell end-to-end: branching, a
 * choice question, a validated text input, an optional file upload, an optional
 * long-text question, and a completion screen. The real journeys (employer,
 * university, student, …) are authored later as their own flow files and dropped
 * into the registry — no application code changes. See APP.md §"Future flows".
 */

import type { FlowDefinition, QuestionDefinition } from "@billbeak/conversation-engine";

export const placeholderQuestions: Readonly<Record<string, QuestionDefinition>> = {
  q_reason: {
    id: "q_reason",
    type: "single_choice",
    prompt: "What brings you here?",
    help: "This is placeholder content used to validate the experience.",
    options: [
      { value: "explore", label: "Just exploring" },
      { value: "build", label: "Building something" },
      { value: "partner", label: "Exploring a partnership" },
    ],
  },
  q_contact: {
    id: "q_contact",
    type: "email",
    prompt: "Where can we reach you?",
    help: "We'll only use this to continue the conversation.",
  },
  q_document: {
    id: "q_document",
    type: "file",
    prompt: "Share a document, if you have one",
    help: "Optional. PDF, image, or document.",
    optional: true,
  },
  q_notes: {
    id: "q_notes",
    type: "textarea",
    prompt: "Anything you'd like to add?",
    help: "Optional.",
    optional: true,
    validations: [{ rule: "maxLength", params: { value: 600 } }],
  },
};

export const placeholderFlow: FlowDefinition = {
  id: "placeholder",
  version: 1,
  entry: "n_reason",
  nodes: {
    n_reason: {
      id: "n_reason",
      kind: "question",
      questionId: "q_reason",
      transitions: [
        // Partnership path demonstrates conditional branching.
        { to: "n_document", when: { op: "eq", path: "q_reason", value: "partner" } },
        { to: "n_contact" },
      ],
    },
    n_contact: {
      id: "n_contact",
      kind: "question",
      questionId: "q_contact",
      transitions: [{ to: "n_notes" }],
    },
    n_document: {
      id: "n_document",
      kind: "question",
      questionId: "q_document",
      transitions: [{ to: "n_contact" }],
    },
    n_notes: {
      id: "n_notes",
      kind: "question",
      questionId: "q_notes",
      transitions: [{ to: "n_done" }],
    },
    n_done: {
      id: "n_done",
      kind: "terminal",
      outcome: "received",
    },
  },
};
