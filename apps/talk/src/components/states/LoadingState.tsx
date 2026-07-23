export function LoadingState() {
  return (
    <div className="bb-state" aria-busy="true" aria-live="polite">
      <div className="bb-state__inner">
        <div className="bb-spinner" style={{ margin: "0 auto" }} />
      </div>
    </div>
  );
}
