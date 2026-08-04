/**
 * Single-line input renderer covering text, email, phone, date, country,
 * website, linkedin and number. HTML input attributes are derived from the
 * question type; Enter submits.
 */

import { useState } from "react";
import type { HTMLInputTypeAttribute, KeyboardEvent } from "react";
import { interpolate } from "@/lib/interpolate.ts";
import { FieldErrors } from "./FieldErrors.tsx";
import { QuestionFooter } from "./QuestionFooter.tsx";
import type { QuestionRendererProps } from "./types.ts";

interface InputAttrs {
  readonly type: HTMLInputTypeAttribute;
  readonly inputMode?: "text" | "email" | "tel" | "numeric" | "url";
  readonly autoComplete?: string;
  readonly placeholder?: string;
}

function attrsForType(type: string): InputAttrs {
  switch (type) {
    case "email":
      return { type: "email", inputMode: "email", autoComplete: "email", placeholder: "you@example.com" };
    case "phone":
      return { type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: "+1 555 000 0000" };
    case "number":
      return { type: "text", inputMode: "numeric", placeholder: "0" };
    case "date":
      return { type: "date" };
    case "website":
      return { type: "url", inputMode: "url", placeholder: "https://" };
    case "linkedin":
      return { type: "url", inputMode: "url", placeholder: "https://linkedin.com/in/…" };
    default:
      return { type: "text" };
  }
}

function toText(value: QuestionRendererProps["initialValue"]): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function TextField({
  question,
  initialValue,
  tokens,
  busy,
  errors,
  onSubmit,
  onSkip,
}: QuestionRendererProps) {
  const suggested = question.config?.["suggestedAnswer"];
  const [value, setValue] = useState<string>(() => {
    if (initialValue !== undefined) return toText(initialValue);
    return typeof suggested === "string" ? interpolate(suggested, tokens) : "";
  });
  const attrs = attrsForType(question.type);

  const submit = () => {
    if (!busy) onSubmit(value.trim());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <>
      <div className="bb-field">
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input
          className="bb-input"
          type={attrs.type}
          inputMode={attrs.inputMode}
          autoComplete={attrs.autoComplete}
          placeholder={attrs.placeholder}
          aria-label={question.prompt}
          aria-invalid={errors.length > 0}
          aria-describedby={errors.length > 0 ? "bb-errors" : undefined}
          value={value}
          disabled={busy}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>

      <FieldErrors errors={errors} />

      <QuestionFooter
        onContinue={submit}
        busy={busy}
        canSkip={question.optional === true}
        onSkip={onSkip}
      />
    </>
  );
}
