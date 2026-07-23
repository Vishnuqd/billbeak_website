import type { ProgressInfo } from "@billbeak/conversation-engine";

/** Slim, calm progress indicator. Percentage is derived by the engine. */
export function ProgressBar({ progress }: { progress: ProgressInfo }) {
  const percent = Math.round(progress.ratio * 100);
  return (
    <div className="bb-progress">
      <div
        className="bb-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Progress"
      >
        <div className="bb-progress__fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="bb-progress__label">
        {progress.step} / {progress.projectedTotal}
      </span>
    </div>
  );
}
