/**
 * EngineProvider — bridges React, the engine and the backend.
 *
 * On mount it loads the composed configuration from the backend, constructs the
 * engine (local runtime), the BackendSync (durable system of record) and the
 * uploader, then exposes them via context. Components read immutable EngineState
 * snapshots and dispatch engine actions; they never mutate state.
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
import { loadAppConfig } from "@/config/loadConfig.ts";
import type { LoadedAppConfig } from "@/config/types.ts";
import { createEngine } from "@/engine/createEngine.ts";
import { BackendSync } from "@/engine/backend/sync.ts";
import type { SyncSnapshot } from "@/engine/backend/sync.ts";
import { createUploader } from "@/engine/adapters/upload.ts";
import type { Uploader } from "@/engine/adapters/upload.ts";
import { getOrCreateSessionId, newSessionId } from "@/lib/session.ts";

interface EngineStore {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => EngineState;
}

function createStore(engine: ConversationEngine): EngineStore {
  let snapshot = engine.getState();
  const listeners = new Set<() => void>();
  // Subscribe to the engine IMMEDIATELY (not when React attaches). load() flips
  // idle → question before React mounts; without an early subscription that
  // change would be missed and the cached snapshot would stay stale forever.
  engine.subscribe((state) => {
    snapshot = state;
    for (const listener of listeners) listener();
  });
  return {
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    getSnapshot: () => snapshot,
  };
}

type Phase = "loading" | "ready" | "error";

interface Bundle {
  engine: ConversationEngine;
  store: EngineStore;
  sync: BackendSync;
  config: LoadedAppConfig;
  uploader: Uploader;
}

interface EngineContextValue {
  phase: Phase;
  bundle: Bundle | null;
  reload: () => void;
  restart: () => void;
}

const EngineContext = createContext<EngineContextValue | null>(null);

export function EngineProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState(getOrCreateSessionId);
  const [phase, setPhase] = useState<Phase>("loading");
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setBundle(null);

    loadAppConfig()
      .then((config) => {
        if (cancelled) return;
        const navMap = Object.fromEntries(
          Object.entries(config.navigator.branches).map(([value, branch]) => [value, branch.journey]),
        );
        const sync = new BackendSync(
          `billbeak:talk:sync:${sessionId}`,
          navMap,
          config.navigator.questionId ?? "sh_navigator",
          "lets-talk",
        );
        const engine = createEngine(config, sessionId, sync);
        const store = createStore(engine);
        const uploader = createUploader(sync);
        setBundle({ engine, store, sync, config, uploader });
        if (engine.getState().status === "idle") void engine.load();
        setPhase("ready");
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const restart = useCallback(() => {
    bundle?.sync.dispose();
    void bundle?.engine.reset();
    setSessionId(newSessionId());
  }, [bundle]);

  const value = useMemo<EngineContextValue>(
    () => ({ phase, bundle, reload, restart }),
    [phase, bundle, reload, restart],
  );

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

function useCtx(): EngineContextValue {
  const ctx = useContext(EngineContext);
  if (ctx === null) throw new Error("Engine hooks must be used within EngineProvider.");
  return ctx;
}

export function useEngineStatus(): { phase: Phase; reload: () => void } {
  const { phase, reload } = useCtx();
  return { phase, reload };
}

function useBundle(): Bundle {
  const { bundle } = useCtx();
  if (bundle === null) throw new Error("Engine is not ready yet.");
  return bundle;
}

export function useEngineState(): EngineState {
  const { store } = useBundle();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useEngine(): { engine: ConversationEngine; restart: () => void } {
  const { engine } = useBundle();
  const { restart } = useCtx();
  return { engine, restart };
}

export function useAppConfig(): LoadedAppConfig {
  return useBundle().config;
}

export function useUploader(): Uploader {
  return useBundle().uploader;
}

export function useSyncSnapshot(): SyncSnapshot {
  const { sync } = useBundle();
  return useSyncExternalStore(
    (cb) => sync.subscribe(() => cb()),
    () => sync.snapshot(),
    () => sync.snapshot(),
  );
}
