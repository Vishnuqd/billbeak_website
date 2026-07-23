import type { ValidationError } from "@billbeak/conversation-engine";

/** Inline validation feedback. Linked to inputs via aria-describedby="bb-errors". */
export function FieldErrors({ errors }: { errors: readonly ValidationError[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="bb-errors" id="bb-errors" role="alert" aria-live="assertive">
      {errors.map((error, i) => (
        <span className="bb-error" key={`${error.rule}-${i}`}>
          {error.message}
        </span>
      ))}
    </div>
  );
}
