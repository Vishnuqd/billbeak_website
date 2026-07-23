/**
 * Reference analytics adapters.
 *
 * The engine emits {@link AnalyticsEvent}s; these adapters decide where they go.
 * A GA/Mixpanel/Segment/PostHog adapter is just another `track` implementation —
 * the engine never changes. `MultiplexAnalyticsAdapter` fans one event out to
 * many sinks.
 */

import type { AnalyticsAdapter, AnalyticsEvent } from "../types/adapters.ts";

/** Discards everything. Safe default when analytics is not configured. */
export class NoopAnalyticsAdapter implements AnalyticsAdapter {
  track(): void {
    /* intentionally empty */
  }
}

/** Wraps a plain function — the simplest possible sink. */
export class FunctionAnalyticsAdapter implements AnalyticsAdapter {
  private readonly fn: (event: AnalyticsEvent) => void;
  constructor(fn: (event: AnalyticsEvent) => void) {
    this.fn = fn;
  }
  track(event: AnalyticsEvent): void {
    this.fn(event);
  }
}

/** Records events in memory — useful for tests and debugging. */
export class RecordingAnalyticsAdapter implements AnalyticsAdapter {
  readonly events: AnalyticsEvent[] = [];
  track(event: AnalyticsEvent): void {
    this.events.push(event);
  }
  typesSeen(): string[] {
    return this.events.map((e) => e.type);
  }
}

/** Fans each event out to every wrapped adapter. */
export class MultiplexAnalyticsAdapter implements AnalyticsAdapter {
  private readonly sinks: readonly AnalyticsAdapter[];
  constructor(...sinks: readonly AnalyticsAdapter[]) {
    this.sinks = sinks;
  }
  track(event: AnalyticsEvent): void {
    for (const sink of this.sinks) sink.track(event);
  }
}
