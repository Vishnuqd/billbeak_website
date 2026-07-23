/**
 * File upload renderer. Drag-and-drop or click to choose; the engine routes the
 * file through the injected UploadProvider. While the engine is uploading we show
 * a busy state; on failure the engine returns here with an error and Continue
 * becomes "Try again" (retry).
 */

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { FileIcon } from "@/icons/index.tsx";
import { FieldErrors } from "./FieldErrors.tsx";
import { QuestionFooter } from "./QuestionFooter.tsx";
import type { QuestionRendererProps } from "./types.ts";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readAccept(config: QuestionRendererProps["question"]["config"]): string | undefined {
  const accept = config?.["accept"];
  return typeof accept === "string" ? accept : undefined;
}

export function FileUpload({
  question,
  busy,
  uploading,
  errors,
  onSubmit,
  onSkip,
}: QuestionRendererProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = () => inputRef.current?.click();

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const submit = () => {
    if (file && !busy) onSubmit(file);
  };

  const hasError = errors.length > 0;

  return (
    <>
      {file === null ? (
        <div
          className="bb-upload"
          data-dragging={dragging}
          role="button"
          tabIndex={0}
          onClick={pick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              pick();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <FileIcon />
          <div className="bb-upload__hint">Drag a file here, or click to choose</div>
        </div>
      ) : (
        <div className="bb-upload__file">
          <FileIcon />
          <div className="bb-upload__meta">
            <div className="bb-upload__name">{file.name}</div>
            <div className="bb-upload__size">
              {formatBytes(file.size)}
              {uploading ? " · Uploading…" : ""}
            </div>
            {uploading && (
              <div className="bb-upload__bar">
                <span style={{ width: "60%" }} />
              </div>
            )}
          </div>
          {!uploading && (
            <button type="button" className="bb-btn bb-btn--ghost" onClick={() => setFile(null)}>
              Remove
            </button>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={readAccept(question.config)}
        className="bb-visually-hidden"
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          if (chosen) setFile(chosen);
        }}
      />

      <FieldErrors errors={errors} />

      <QuestionFooter
        onContinue={file ? submit : undefined}
        continueLabel={hasError ? "Try again" : "Continue"}
        continueDisabled={file === null}
        busy={busy}
        canSkip={question.optional === true}
        onSkip={onSkip}
      />
    </>
  );
}
