/**
 * Single-choice renderer. Accessible radiogroup with full keyboard control:
 * ↑/↓ (and ←/→) move the highlight, Enter/Space or a click commits, and digit
 * keys 1–9 jump-select. Selecting a choice auto-advances (Linear/Raycast feel).
 */

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Check } from "@/icons/index.tsx";
import { FieldErrors } from "./FieldErrors.tsx";
import { QuestionFooter } from "./QuestionFooter.tsx";
import type { QuestionRendererProps } from "./types.ts";

export function SingleChoice({
  question,
  initialValue,
  busy,
  errors,
  onSubmit,
  onSkip,
}: QuestionRendererProps) {
  const options = question.options ?? [];
  const initialIndex = Math.max(
    0,
    options.findIndex((o) => o.value === initialValue),
  );
  const [highlight, setHighlight] = useState(initialIndex);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    buttons.current[highlight]?.focus();
    // Focus only when the highlight changes; mount focuses the initial option.
  }, [highlight]);

  const commit = (index: number) => {
    const option = options[index];
    if (option && !busy) onSubmit(option.value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (busy || options.length === 0) return;
    const n = options.length;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      setHighlight((i) => (i + 1) % n);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      setHighlight((i) => (i - 1 + n) % n);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(highlight);
    } else if (/^[1-9]$/.test(e.key)) {
      const index = Number(e.key) - 1;
      if (index < n) {
        e.preventDefault();
        setHighlight(index);
        commit(index);
      }
    }
  };

  return (
    <>
      <div
        className="bb-options"
        role="radiogroup"
        aria-label={question.prompt}
        onKeyDown={onKeyDown}
      >
        {options.map((option, index) => (
          <button
            key={option.value}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={index === highlight}
            tabIndex={index === highlight ? 0 : -1}
            data-highlighted={index === highlight}
            className="bb-option"
            disabled={busy}
            onClick={() => commit(index)}
            onFocus={() => setHighlight(index)}
          >
            {index < 9 && <span className="bb-option__key">{index + 1}</span>}
            <span className="bb-option__label">{option.label}</span>
            <Check className="bb-option__check" />
          </button>
        ))}
      </div>

      <FieldErrors errors={errors} />

      {question.optional === true && (
        <QuestionFooter canSkip onSkip={onSkip} busy={busy} />
      )}
    </>
  );
}
