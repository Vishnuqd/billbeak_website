/**
 * Group renderer — one flexible renderer for every composite screen the config
 * declares: Contact Group, Organisation Group, Candidate/Join Profile Group, and
 * the Corporate chips+textarea. It reads `config.fields`, validates per-field
 * (reusing the ENGINE's own validators, so no logic is duplicated), enforces
 * `requireAtLeast`, and submits a `{field: value}` object.
 */

import { useState } from "react";
import {
  builtInValidators,
  defaultQuestionTypes,
  runValidations,
} from "@billbeak/conversation-engine";
import type {
  AnswerValue,
  QuestionDefinition,
  UploadReference,
  ValidationError,
} from "@billbeak/conversation-engine";
import type { GroupFieldConfig } from "@/config/types.ts";
import { interpolate } from "@/lib/interpolate.ts";
import { Button } from "@/components/primitives/Button.tsx";
import { ArrowRight } from "@/icons/index.tsx";
import { FieldErrors } from "./FieldErrors.tsx";
import { PhoneField, FileSubField } from "./fields.tsx";
import type { QuestionRendererProps } from "./types.ts";

const FIELD_TYPE_MAP: Record<string, string> = {
  text: "text",
  longtext: "textarea",
  email: "email",
  tel: "phone",
  url: "website",
  single_select: "single_choice",
  multiselect: "multi_choice",
  file: "file",
};

type GroupValue = Record<string, unknown>;

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function validateField(field: GroupFieldConfig, value: unknown, answers: never): ValidationError[] {
  if (field.type === "consent") {
    return field.required && !value
      ? [{ rule: "required", message: "Please tick to continue." }]
      : [];
  }
  const engineType = FIELD_TYPE_MAP[field.type] ?? "text";
  const pseudo: QuestionDefinition = {
    id: field.name,
    type: engineType,
    prompt: field.label ?? field.name,
    optional: !field.required,
    ...(field.validators ? { validations: field.validators } : {}),
  };
  return runValidations(
    pseudo,
    defaultQuestionTypes[engineType],
    value as AnswerValue,
    answers,
    builtInValidators,
  );
}

export function GroupRenderer({
  question,
  initialValue,
  tokens,
  busy,
  errors,
  onSubmit,
  onSkip,
}: QuestionRendererProps) {
  const config = question.config ?? {};
  const fields = (config["fields"] as GroupFieldConfig[] | undefined) ?? [];
  const requireAtLeast = config["requireAtLeast"] as
    | { fields: string[]; count: number; message?: string }
    | undefined;
  const disclaimer = config["disclaimer"] as string | undefined;
  const consentCopy = config["consentCopy"] as string | undefined;
  const submitLabel = (config["submitLabel"] as string | undefined) ?? "Continue";

  const [values, setValues] = useState<GroupValue>(() => {
    const base: GroupValue =
      initialValue && typeof initialValue === "object" ? { ...(initialValue as unknown as GroupValue) } : {};
    for (const f of fields) {
      if (base[f.name] === undefined && typeof f.suggested === "string") {
        base[f.name] = interpolate(f.suggested, tokens);
      }
    }
    return base;
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, ValidationError[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = (name: string, value: unknown) => setValues((v) => ({ ...v, [name]: value }));

  const submit = () => {
    const nextErrors: Record<string, ValidationError[]> = {};
    for (const f of fields) {
      const errs = validateField(f, values[f.name], undefined as never);
      if (errs.length) nextErrors[f.name] = errs;
    }
    let form: string | null = null;
    if (requireAtLeast) {
      const present = requireAtLeast.fields.filter((n) => !isEmpty(values[n])).length;
      if (present < requireAtLeast.count) form = requireAtLeast.message ?? "Provide at least one.";
    }
    setFieldErrors(nextErrors);
    setFormError(form);
    if (Object.keys(nextErrors).length === 0 && !form) {
      onSubmit(values as unknown as AnswerValue);
    }
  };

  return (
    <div className="bb-group">
      {fields.map((field) => (
        <div className="bb-group__field" key={field.name}>
          {field.label && field.type !== "consent" && (
            <label className="bb-group__label">{field.label}</label>
          )}
          {renderField(field, values[field.name], (v) => set(field.name, v), consentCopy)}
          <FieldErrors errors={fieldErrors[field.name] ?? []} />
        </div>
      ))}

      {disclaimer && <p className="bb-group__disclaimer">{disclaimer}</p>}
      {formError && <FieldErrors errors={[{ rule: "requireAtLeast", message: formError }]} />}
      <FieldErrors errors={errors} />

      <div className="bb-question__footer">
        <Button variant="primary" onClick={submit} disabled={busy}>
          {busy ? <span className="bb-spinner" /> : (<>{submitLabel}<ArrowRight /></>)}
        </Button>
        {question.optional === true && (
          <Button variant="ghost" onClick={onSkip} disabled={busy}>
            Skip
          </Button>
        )}
      </div>
    </div>
  );
}

function renderField(
  field: GroupFieldConfig,
  value: unknown,
  onChange: (value: unknown) => void,
  consentCopy?: string,
) {
  switch (field.type) {
    case "tel":
      return (
        <PhoneField
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          defaultCountry={field.countryCode?.default ?? "IN"}
          editable={field.countryCode?.editable ?? true}
          ariaLabel={field.label}
        />
      );
    case "file":
      return (
        <FileSubField
          questionId={field.name}
          value={value as UploadReference | undefined}
          onChange={onChange}
          {...(field.label ? { label: field.label } : {})}
        />
      );
    case "single_select":
      return (
        <div className="bb-segment" role="radiogroup" aria-label={field.label}>
          {(field.options ?? []).map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={value === opt.value}
              className="bb-segment__item"
              data-selected={value === opt.value}
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      );
    case "multiselect": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="bb-chips" role="group" aria-label={field.label}>
          {(field.options ?? []).map((opt) => {
            const on = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="checkbox"
                aria-checked={on}
                className="bb-chip"
                data-selected={on}
                onClick={() =>
                  onChange(on ? selected.filter((v) => v !== opt.value) : [...selected, opt.value])
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      );
    }
    case "longtext":
      return (
        <textarea
          className="bb-textarea"
          rows={2}
          aria-label={field.label}
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "consent":
      return (
        <label className="bb-consent">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          <span>{consentCopy}</span>
        </label>
      );
    default:
      return (
        <input
          className="bb-input"
          type={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
          inputMode={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
          aria-label={field.label}
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
