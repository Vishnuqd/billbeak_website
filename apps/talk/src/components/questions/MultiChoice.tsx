/**
 * Multi-choice renderer. Accessible group of toggle buttons (role="checkbox").
 * Space/click toggles; ↑/↓ move focus; a Continue action commits the selection.
 */

import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Check } from "@/icons/index.tsx";
import { FieldErrors } from "./FieldErrors.tsx";
import { QuestionFooter } from "./QuestionFooter.tsx";
import type { QuestionRendererProps } from "./types.ts";

function initialSelection(value: QuestionRendererProps["initialValue"]): string[] {
  return Array.isArray(value) ? [...value] : [];
}

export function MultiChoice({
  question,
  initialValue,
  busy,
  errors,
  onSubmit,
  onSkip,
}: QuestionRendererProps) {
  const options = question.options ?? [];
  const [selected, setSelected] = useState<string[]>(() => initialSelection(initialValue));
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const toggle = (value: string) => {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const n = options.length;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      buttons.current[(index + 1) % n]?.focus();
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      buttons.current[(index - 1 + n) % n]?.focus();
    }
  };

  return (
    <>
      <div className="bb-options" role="group" aria-label={question.prompt}>
        {options.map((option, index) => {
          const checked = selected.includes(option.value);
          return (
            <button
              key={option.value}
              ref={(el) => {
                buttons.current[index] = el;
              }}
              type="button"
              role="checkbox"
              aria-checked={checked}
              className="bb-option"
              disabled={busy}
              onClick={() => toggle(option.value)}
              onKeyDown={(e) => onKeyDown(e, index)}
            >
              <span className="bb-option__label">{option.label}</span>
              <Check className="bb-option__check" />
            </button>
          );
        })}
      </div>

      <FieldErrors errors={errors} />

      <QuestionFooter
        onContinue={() => onSubmit(selected)}
        busy={busy}
        canSkip={question.optional === true}
        onSkip={onSkip}
      />
    </>
  );
}
