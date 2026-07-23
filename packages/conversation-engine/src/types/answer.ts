/**
 * Answer value model.
 *
 * The engine stores answers as a discriminated-free union of primitive shapes.
 * It intentionally has NO knowledge of what any answer *means* — only its shape.
 */

/** A reference to an uploaded artifact, produced by an {@link UploadProvider}. */
export interface UploadReference {
  readonly id: string;
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
  readonly url?: string;
  readonly status: "pending" | "clean" | "infected" | "failed";
}

/**
 * The minimal shape the engine needs from a file. The browser `File` object is
 * assignable to this, but the engine never depends on the DOM `File` type.
 */
export interface FileLike {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

/**
 * Every possible answer value. New question types must express their value as
 * one of these shapes (or extend this union) — the engine treats them uniformly.
 */
export type AnswerValue =
  | string
  | number
  | boolean
  | readonly string[]
  | UploadReference
  | FileLike
  | null;

/** One recorded answer within a conversation. */
export interface Answer {
  readonly questionId: string;
  readonly value: AnswerValue;
  /** ISO-8601 timestamp. */
  readonly answeredAt: string;
  /** True when the question was explicitly skipped (only allowed if optional). */
  readonly skipped: boolean;
}

/** All answers in a session, keyed by question id. */
export type AnswersMap = Readonly<Record<string, Answer>>;

/** Type guard: is this value an already-uploaded reference (vs. a raw file)? */
export function isUploadReference(value: AnswerValue): value is UploadReference {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "id" in value
  );
}

/** Type guard: is this value a raw file awaiting upload? */
export function isFileLike(value: AnswerValue): value is FileLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "size" in value &&
    "name" in value &&
    !("status" in value)
  );
}
