import { Button } from "@/components/primitives/Button.tsx";

interface ErrorStateProps {
  readonly message?: string | null;
  readonly onRetry: () => void;
  readonly onRestart: () => void;
}

/** Friendly, recoverable error. Never surfaces a stack trace. */
export function ErrorState({ message, onRetry, onRestart }: ErrorStateProps) {
  return (
    <div className="bb-state" role="alert">
      <div className="bb-state__inner">
        <h1 className="bb-state__title">Something went wrong.</h1>
        <p className="bb-state__body">
          {message ?? "We hit a snag. Your progress is saved — let&rsquo;s try that again."}
        </p>
        <div className="bb-state__actions">
          <Button variant="primary" onClick={onRetry}>
            Try again
          </Button>
          <Button variant="ghost" onClick={onRestart}>
            Start over
          </Button>
        </div>
      </div>
    </div>
  );
}
