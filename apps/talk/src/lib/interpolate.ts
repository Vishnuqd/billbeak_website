/**
 * {token} interpolation. The spec personalises prompts ("Sruthi, what brings
 * you to Billbeak today?"). Tokens are captured from answers whose question
 * declares `config.capturesToken` (e.g. sh_name -> firstName).
 */

import type { AnswersMap, QuestionDefinition } from "@billbeak/conversation-engine";

export type TokenMap = Record<string, string>;

export function buildTokens(
  answers: AnswersMap,
  questions: Record<string, QuestionDefinition>,
): TokenMap {
  const tokens: TokenMap = {};
  for (const [questionId, answer] of Object.entries(answers)) {
    const token = questions[questionId]?.config?.["capturesToken"];
    if (typeof token === "string" && typeof answer.value === "string") {
      tokens[token] = answer.value.trim();
    }
  }
  return tokens;
}

export function interpolate(text: string | undefined, tokens: TokenMap): string {
  if (!text) return "";
  return text.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = tokens[key];
    // Drop a leading "{name}, " gracefully when the token is missing.
    return value !== undefined ? value : match;
  });
}
