/**
 * localStorage persistence adapter — browser refresh recovery.
 *
 * Demonstrates that swapping storage is an adapter change, not an engine change.
 * An IndexedDB or server-backed adapter implements the same interface and drops
 * in identically. Guards for non-browser environments so importing is always safe.
 */

import type { PersistenceAdapter } from "../types/adapters.ts";
import type { PersistedSession } from "../types/state.ts";

interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function resolveStore(explicit?: KeyValueStore): KeyValueStore | null {
  if (explicit) return explicit;
  const g = globalThis as { localStorage?: KeyValueStore };
  return g.localStorage ?? null;
}

export class LocalStoragePersistenceAdapter implements PersistenceAdapter {
  private readonly store: KeyValueStore | null;
  private readonly prefix: string;

  constructor(prefix = "ce:session:", store?: KeyValueStore) {
    this.prefix = prefix;
    this.store = resolveStore(store);
  }

  private key(sessionId: string): string {
    return `${this.prefix}${sessionId}`;
  }

  load(sessionId: string): Promise<PersistedSession | null> {
    if (!this.store) return Promise.resolve(null);
    const raw = this.store.getItem(this.key(sessionId));
    if (raw === null) return Promise.resolve(null);
    try {
      return Promise.resolve(JSON.parse(raw) as PersistedSession);
    } catch {
      return Promise.resolve(null);
    }
  }

  save(session: PersistedSession): Promise<void> {
    if (this.store) this.store.setItem(this.key(session.sessionId), JSON.stringify(session));
    return Promise.resolve();
  }

  clear(sessionId: string): Promise<void> {
    if (this.store) this.store.removeItem(this.key(sessionId));
    return Promise.resolve();
  }
}
