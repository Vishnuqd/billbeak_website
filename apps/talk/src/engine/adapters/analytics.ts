/**
 * App-side analytics adapter.
 *
 * The engine emits AnalyticsEvents; this decides where they go. For the shell we
 * log in dev and no-op in prod. A real GA/Mixpanel/Segment/PostHog adapter is a
 * drop-in replacement implementing the same `track` method — the engine and the
 * rest of the app never change.
 */

import type { AnalyticsAdapter, AnalyticsEvent } from "@billbeak/conversation-engine";

export class AppAnalyticsAdapter implements AnalyticsAdapter {
  track(event: AnalyticsEvent): void {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[analytics] ${event.type}`, event);
    }
    // Production sink wiring (e.g. window.analytics?.track(...)) goes here later.
  }
}
