/**
 * In-memory persistence adapter. Zero dependencies; ideal for tests, SSR, and
 * as a reference implementation of the {@link PersistenceAdapter} contract.
 */

import type { PersistenceAdapter } from "../types/adapters.ts";
import type { PersistedSession } from "../types/state.ts";

export class MemoryPersistenceAdapter implements PersistenceAdapter {
  private readonly store = new Map<string, PersistedSession>();

  load(sessionId: string): Promise<PersistedSession | null> {
    return Promise.resolve(this.store.get(sessionId) ?? null);
  }

  save(session: PersistedSession): Promise<void> {
    this.store.set(session.sessionId, session);
    return Promise.resolve();
  }

  clear(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
    return Promise.resolve();
  }
}
