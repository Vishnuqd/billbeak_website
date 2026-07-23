/**
 * Long-text renderer. Enter inserts a newline; ⌘/Ctrl+Enter submits. Auto-grows
 * to fit content.
 */

import { useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { FieldErrors } from "./FieldErrors.tsx";
import { QuestionFooter } from "./QuestionFooter.tsx";
import type { QuestionRendererProps } from "./types.ts";

function toText(value: QuestionRendererProps["initialValue"]): string {
  return typeof value === "string" ? value : "";
}

export function TextAreaField({
  question,
  initialValue,
  busy,
  errors,
  onSubmit,
  onSkip,
}: QuestionRendererProps) {
  const [value, setValue] = useState<string>(() => toText(initialValue));
  const ref = useRef<HTMLTextAreaElement>(null);

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    grow(e.target);
  };

  const submit = () => {
    if (!busy) onSubmit(value.trim());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <>
      <div className="bb-field">
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <textarea
          ref={ref}
          className="bb-textarea"
          rows={2}
          aria-label={question.prompt}
          aria-invalid={errors.length > 0}
          aria-describedby={errors.length > 0 ? "bb-errors" : undefined}
          placeholder="Type here…"
          value={value}
          disabled={busy}
          autoFocus
          onChange={onChange}
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
