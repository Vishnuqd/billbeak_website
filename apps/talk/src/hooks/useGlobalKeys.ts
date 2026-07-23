/**
 * Global keyboard shortcuts for the conversation shell.
 *
 * Escape → go back (when possible). Per-question keys (arrows, digits, Enter to
 * submit) are handled inside the individual question renderers so focus and
 * selection semantics stay correct and accessible.
 */

import { useEffect } from "react";

interface GlobalKeyHandlers {
  readonly onBack?: (() => void) | undefined;
  readonly enabled: boolean;
}

export function useGlobalKeys({ onBack, enabled }: GlobalKeyHandlers): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onBack) {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onBack, enabled]);
}
