import { Button } from "@/components/primitives/Button.tsx";
import { Check } from "@/icons/index.tsx";

interface CompletionStateProps {
  readonly onRestart: () => void;
  readonly onClose: () => void;
}

export function CompletionState({ onRestart, onClose }: CompletionStateProps) {
  return (
    <div className="bb-state">
      <div className="bb-state__inner">
        <Check className="bb-state__mark" />
        <h1 className="bb-state__title">Thank you.</h1>
        <p className="bb-state__body">
          We&rsquo;ve received your responses. This is a placeholder completion screen — the real
          journeys will route you to what comes next.
        </p>
        <div className="bb-state__actions">
          <Button variant="primary" onClick={onClose}>
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
