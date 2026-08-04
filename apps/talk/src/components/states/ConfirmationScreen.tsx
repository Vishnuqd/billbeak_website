/**
 * Rich confirmation screen — replaces the generic thank-you. Renders the
 * journey's confirmation.json: title, body, "what happens next", a live timeline
 * preview (fetched from the backend), the CTA + recommended action, and the
 * post-submit "how did you hear about us?" question.
 */

import { useEffect, useState } from "react";
import { api } from "@/api/client.ts";
import type { ConfirmationConfig } from "@/config/types.ts";
import { loadConfirmation } from "@/config/loadConfig.ts";
import { useAppConfig, useSyncSnapshot } from "@/providers/EngineProvider.tsx";
import { Button } from "@/components/primitives/Button.tsx";
import { Check } from "@/icons/index.tsx";

interface TimelineItem {
  type: string;
  label: string;
}

function humanize(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ConfirmationScreen({ onRestart }: { onRestart: () => void }) {
  const config = useAppConfig();
  const sync = useSyncSnapshot();
  const [confirmation, setConfirmation] = useState<ConfirmationConfig | null>(sync.confirmation);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [howHeard, setHowHeard] = useState<string | null>(null);

  const journeyKey = sync.journeyKey;
  const journeyId = sync.journeyId;

  // Confirmation config: from sync (complete response) or fetched.
  useEffect(() => {
    if (confirmation || !journeyKey) return;
    void loadConfirmation(journeyKey).then((c) => c && setConfirmation(c));
  }, [confirmation, journeyKey]);

  useEffect(() => {
    if (sync.confirmation) setConfirmation(sync.confirmation);
  }, [sync.confirmation]);

  // Live timeline (falls back to the config's preview keys when unavailable).
  useEffect(() => {
    if (!journeyId) return;
    void api
      .GET("/journeys/{journey_id}/timeline", { params: { path: { journey_id: journeyId } } })
      .then(({ data }) => {
        if (data) {
          const milestones = data
            .filter((e) => e.type !== "question_answered")
            .map((e) => ({ type: e.type, label: e.label }));
          if (milestones.length) setTimeline(milestones);
        }
      });
  }, [journeyId]);

  const preview: TimelineItem[] =
    timeline.length > 0
      ? timeline
      : (confirmation?.timelinePreview ?? []).map((t) => ({ type: t, label: humanize(t) }));

  const howHeardQuestion = config.questions["sh_how_heard"];

  const goHome = () => {
    window.location.href = "/";
  };

  return (
    <div className="bb-state">
      <div className="bb-state__inner bb-confirm">
        <Check className="bb-state__mark" />
        <h1 className="bb-state__title">{confirmation?.title ?? "Thank you."}</h1>
        <p className="bb-state__body">
          {confirmation?.body ?? "We've received your enquiry and will be in touch."}
        </p>

        {confirmation && confirmation.whatHappensNext.length > 0 && (
          <div className="bb-next">
            <h2 className="bb-next__title">What happens next</h2>
            <ol className="bb-next__list">
              {confirmation.whatHappensNext.map((s) => (
                <li key={s.step} className="bb-next__item">
                  <span className="bb-next__num">{s.step}</span>
                  <span>
                    <strong>{s.label}</strong>
                    <span className="bb-next__detail">{s.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {preview.length > 0 && (
          <div className="bb-timeline">
            {preview.map((e, i) => (
              <span key={e.type + i} className="bb-timeline__dot" data-live={timeline.length > 0}>
                {e.label}
              </span>
            ))}
          </div>
        )}

        {howHeardQuestion && (
          <div className="bb-howheard">
            <p className="bb-howheard__prompt">{howHeardQuestion.prompt}</p>
            {howHeard === null ? (
              <div className="bb-chips bb-chips--center">
                {(howHeardQuestion.options ?? []).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className="bb-chip"
                    onClick={() => setHowHeard(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="bb-howheard__thanks">Thanks — noted.</p>
            )}
          </div>
        )}

        <div className="bb-state__actions">
          {confirmation?.primaryCta && (
            <Button variant="primary" onClick={() => (window.location.href = confirmation.primaryCta.href)}>
              {confirmation.primaryCta.label}
            </Button>
          )}
          <Button variant="ghost" onClick={goHome}>
            Back to Billbeak
          </Button>
          <Button variant="ghost" onClick={onRestart}>
            Start over
          </Button>
        </div>
      </div>
    </div>
  );
}
