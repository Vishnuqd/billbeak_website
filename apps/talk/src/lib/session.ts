/**
 * Session id management for refresh/resume.
 *
 * The engine persists a conversation keyed by session id; the app must remember
 * *which* id to resume. We keep the "current" id in localStorage so a refresh
 * rehydrates the same conversation, and mint a new one on "start over".
 */

const CURRENT_KEY = "billbeak:talk:current-session";

function randomId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function getOrCreateSessionId(): string {
  try {
    const existing = localStorage.getItem(CURRENT_KEY);
    if (existing) return existing;
    const id = randomId();
    localStorage.setItem(CURRENT_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

export function newSessionId(): string {
  const id = randomId();
  try {
    localStorage.setItem(CURRENT_KEY, id);
  } catch {
    /* storage unavailable — session simply won't survive refresh */
  }
  return id;
}
