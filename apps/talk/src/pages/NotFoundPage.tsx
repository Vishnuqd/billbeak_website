import { Button } from "@/components/primitives/Button.tsx";

export function NotFoundPage() {
  return (
    <div className="bb-state">
      <div className="bb-state__inner">
        <h1 className="bb-state__title">Nothing here.</h1>
        <p className="bb-state__body">That page doesn&rsquo;t exist. Let&rsquo;s get you back.</p>
        <div className="bb-state__actions">
          <Button variant="primary" onClick={() => (window.location.href = "/talk")}>
            Go to the start
          </Button>
        </div>
      </div>
    </div>
  );
}
