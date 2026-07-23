import { Button } from "@/components/primitives/Button.tsx";

export function PausedState({ onResume }: { onResume: () => void }) {
  return (
    <div className="bb-state">
      <div className="bb-state__inner">
        <h1 className="bb-state__title">Paused.</h1>
        <p className="bb-state__body">Take your time. Your place is held whenever you&rsquo;re ready.</p>
        <div className="bb-state__actions">
          <Button variant="primary" onClick={onResume}>
            Resume
          </Button>
        </div>
      </div>
    </div>
  );
}
