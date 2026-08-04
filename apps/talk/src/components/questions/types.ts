/**
 * The contract every question renderer implements. This is the app-side mirror
 * of the engine's question-type registry: the engine knows a type's *behaviour*,
 * the app knows its *rendering*. To support a new type, add a renderer and
 * register it — no engine change, no changes to QuestionView.
 */

import type { ComponentType } from "react";
import type { AnswerValue, QuestionDefinition, ValidationError } from "@billbeak/conversation-engine";
import type { TokenMap } from "@/lib/interpolate.ts";

export interface QuestionRendererProps {
  readonly question: QuestionDefinition;
  /** Prior answer, if any — used to prefill on back-navigation. */
  readonly initialValue: AnswerValue | undefined;
  /** Interpolation tokens (e.g. firstName) for suggested-answer prefill. */
  readonly tokens: TokenMap;
  /** True while the engine is validating/uploading/transitioning — lock inputs. */
  readonly busy: boolean;
  /** True specifically while the engine is uploading this answer. */
  readonly uploading: boolean;
  readonly errors: readonly ValidationError[];
  readonly onSubmit: (value: AnswerValue) => void;
  readonly onSkip: () => void;
}

/**
 * A renderer is any component taking these props — a plain function component or
 * a `React.lazy` one (so heavy/rare renderers can be code-split).
 */
export type QuestionRenderer = ComponentType<QuestionRendererProps>;
