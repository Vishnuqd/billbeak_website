/** Contextual keyboard hints. Hidden on touch (see app.css). */

interface KeyboardHintsProps {
  readonly showChoiceHints: boolean;
  readonly canGoBack: boolean;
}

export function KeyboardHints({ showChoiceHints, canGoBack }: KeyboardHintsProps) {
  return (
    <div className="bb-hints" aria-hidden>
      {showChoiceHints && (
        <span className="bb-hints__item">
          <span className="bb-kbd">↑</span>
          <span className="bb-kbd">↓</span>
          to navigate
        </span>
      )}
      <span className="bb-hints__item">
        <span className="bb-kbd">↵</span>
        {showChoiceHints ? "to select" : "to continue"}
      </span>
      {canGoBack && (
        <span className="bb-hints__item">
          <span className="bb-kbd">esc</span>
          to go back
        </span>
      )}
    </div>
  );
}
