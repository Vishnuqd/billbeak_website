/**
 * EngineProvider — the single bridge between React and the engine.
 *
 * It constructs the engine (via the app factory), exposes it through context for
 * dispatching actions, and wraps it in a React-18 external store so components
 * can read immutable EngineState snapshots with `useEngineState`.
 *
 * Crucially: components never mutate state. They read snapshots and call engine
 * methods (submit/skip/back/…). The engine is the single source of truth.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import type { ConversationEngine, EngineState } from "@billbeak/conversation-engine";
import { createEngine } from "@/engine/createEngine.ts";
import { getOrCreateSessionId, newSessionId } from "@/lib/session.ts";

interface EngineStore {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => EngineState;
}

/**
 * Wrap the engine's subscribe/getState in a stable external store. getState()
 * returns a fresh object each call, so we cache the latest snapshot and only
 * update it inside the subscription — giving useSyncExternalStore the
 * referential stability it requires.
 */
function createStore(engine: ConversationEngine): EngineStore {
  let snapshot = engine.getState();
  return {
    subscribe: (onChange) =>
      engine.subscribe((state) => {
        snapshot = state;
        onChange();
      }),
    getSnapshot: () => snapshot,
  };
}

interface EngineContextValue {
  readonly engine: ConversationEngine;
  readonly store: EngineStore;
  /** Discard the current conversation and begin a fresh one. */
  readonly restart: () => void;
}

const EngineContext = createContext<EngineContextValue | null>(null);

export function EngineProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState(getOrCreateSessionId);

  const engine = useMemo(() => createEngine({ sessionId }), [sessionId]);
  const store = useMemo(() => createStore(engine), [engine]);

  useEffect(() => {
    // Idempotent: load() drives idle → loading synchronously, so a second
    // invocation (React StrictMode in dev, or a re-render) is a safe no-op
    // rather than an illegal transition.
    if (engine.getState().status === "idle") {
      void engine.load();
    }
  }, [engine]);

  const restart = useCallback(() => {
    void engine.reset();
    setSessionId(newSessionId());
  }, [engine]);

  const value = useMemo<EngineContextValue>(
    () => ({ engine, store, restart }),
    [engine, store, restart],
  );

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

function useEngineContext(): EngineContextValue {
  const ctx = useContext(EngineContext);
  if (ctx === null) throw new Error("Engine hooks must be used within EngineProvider.");
  return ctx;
}

/** The live, immutable EngineState snapshot. Re-renders on every state change. */
export function useEngineState(): EngineState {
  const { store } = useEngineContext();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** The engine instance (for dispatching actions) plus restart. */
export function useEngine(): { engine: ConversationEngine; restart: () => void } {
  const { engine, restart } = useEngineContext();
  return { engine, restart };
}
