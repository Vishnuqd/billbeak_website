/**
 * Question-renderer registry — maps a question TYPE to its React renderer.
 *
 * This is the app-side counterpart to the engine's question-type registry. To
 * support a new type, write a renderer and add one line here. `QuestionView`
 * looks the renderer up by `question.type` and falls back to a text field for
 * unknown/custom types so the app degrades gracefully rather than crashing.
 */

import { lazy } from "react";
import type { QuestionRenderer } from "./types.ts";
import { SingleChoice } from "./SingleChoice.tsx";
import { MultiChoice } from "./MultiChoice.tsx";
import { TextField } from "./TextField.tsx";
import { TextAreaField } from "./TextAreaField.tsx";
import { GroupRenderer } from "./GroupRenderer.tsx";

// Code-split the upload renderer: it carries drag-and-drop logic and is only
// reached by flows that ask for a file. Loaded on demand behind a Suspense
// boundary in QuestionView.
const FileUpload = lazy(() =>
  import("./FileUpload.tsx").then((m) => ({ default: m.FileUpload })),
);

const registry: Readonly<Record<string, QuestionRenderer>> = {
  single_choice: SingleChoice,
  multi_choice: MultiChoice,
  text: TextField,
  email: TextField,
  phone: TextField,
  date: TextField,
  country: TextField,
  website: TextField,
  linkedin: TextField,
  number: TextField,
  textarea: TextAreaField,
  file: FileUpload,
  group: GroupRenderer,
};

export function getRenderer(type: string): QuestionRenderer {
  return registry[type] ?? TextField;
}
