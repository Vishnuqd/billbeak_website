import { Button } from "@/components/primitives/Button.tsx";
import { ArrowRight } from "@/icons/index.tsx";

interface QuestionFooterProps {
  readonly onContinue?: () => void;
  readonly continueLabel?: string;
  readonly continueDisabled?: boolean;
  readonly busy?: boolean;
  readonly canSkip: boolean;
  readonly onSkip: () => void;
}

/** Shared action row: primary Continue (optional) + Skip (for optional questions). */
export function QuestionFooter({
  onContinue,
  continueLabel = "Continue",
  continueDisabled = false,
  busy = false,
  canSkip,
  onSkip,
}: QuestionFooterProps) {
  return (
    <div className="bb-question__footer">
      {onContinue && (
        <Button variant="primary" onClick={onContinue} disabled={continueDisabled || busy}>
          {busy ? (
            <span className="bb-spinner" aria-label="Working" />
          ) : (
            <>
              {continueLabel}
              <ArrowRight />
            </>
          )}
        </Button>
      )}
      {canSkip && (
        <Button variant="ghost" onClick={onSkip} disabled={busy}>
          Skip
        </Button>
      )}
    </div>
  );
}
