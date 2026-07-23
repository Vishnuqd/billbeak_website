/**
 * Built-in validators.
 *
 * Each returns `true` when valid. All are pure and generic — none knows about
 * any specific question. Host apps add custom rules via `EngineConfig.validators`,
 * which are merged over these (custom wins on name clash).
 */

import type { AnswerValue } from "../types/answer.ts";
import type { ValidatorRegistry } from "../types/validation.ts";

function numParam(params: Readonly<Record<string, unknown>>, key: string): number | null {
  const v = params[key];
  return typeof v === "number" ? v : null;
}

function isEmptyValue(value: AnswerValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function asLength(value: AnswerValue): number | null {
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.length;
  return null;
}

function asNumber(value: AnswerValue): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

// Deliberately permissive patterns: the engine validates *shape*, not existence.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i;
const PHONE_RE = /^\+?[0-9][0-9\s\-()]{6,}$/;

export const builtInValidators: ValidatorRegistry = {
  required: (value) => !isEmptyValue(value),

  minLength: (value, ctx) => {
    if (isEmptyValue(value)) return true; // emptiness is `required`'s job
    const len = asLength(value);
    const min = numParam(ctx.params, "value");
    return len === null || min === null ? false : len >= min;
  },

  maxLength: (value, ctx) => {
    const len = asLength(value);
    const max = numParam(ctx.params, "value");
    return len === null || max === null ? true : len <= max;
  },

  min: (value, ctx) => {
    if (isEmptyValue(value)) return true;
    const n = asNumber(value);
    const min = numParam(ctx.params, "value");
    return n === null || min === null ? false : n >= min;
  },

  max: (value, ctx) => {
    if (isEmptyValue(value)) return true;
    const n = asNumber(value);
    const max = numParam(ctx.params, "value");
    return n === null || max === null ? false : n <= max;
  },

  minSelected: (value, ctx) => {
    const min = numParam(ctx.params, "value");
    if (min === null) return false;
    return Array.isArray(value) ? value.length >= min : min <= 0;
  },

  maxSelected: (value, ctx) => {
    const max = numParam(ctx.params, "value");
    if (max === null) return true;
    return Array.isArray(value) ? value.length <= max : true;
  },

  pattern: (value, ctx) => {
    if (isEmptyValue(value)) return true;
    if (typeof value !== "string") return false;
    const raw = ctx.params["value"];
    if (typeof raw !== "string") return false;
    return new RegExp(raw).test(value);
  },

  email: (value) => {
    if (isEmptyValue(value)) return true;
    return typeof value === "string" && EMAIL_RE.test(value.trim());
  },

  url: (value) => {
    if (isEmptyValue(value)) return true;
    return typeof value === "string" && URL_RE.test(value.trim());
  },

  phone: (value) => {
    if (isEmptyValue(value)) return true;
    return typeof value === "string" && PHONE_RE.test(value.trim());
  },
};

/** Default human-readable messages, overridable per rule via `ValidationRuleRef.message`. */
export const defaultMessages: Readonly<Record<string, string>> = {
  required: "This field is required.",
  minLength: "Too short.",
  maxLength: "Too long.",
  min: "Value is too small.",
  max: "Value is too large.",
  minSelected: "Please select more options.",
  maxSelected: "Please select fewer options.",
  pattern: "Invalid format.",
  email: "Enter a valid email address.",
  url: "Enter a valid URL.",
  phone: "Enter a valid phone number.",
};
