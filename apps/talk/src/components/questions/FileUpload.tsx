/**
 * File upload renderer. Uploads directly to the backend via the uploader
 * (real progress, cancel, retry), then submits the returned reference to the
 * engine. Enforces the configured accept + size before uploading.
 */

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import type { UploadReference } from "@billbeak/conversation-engine";
import { useUploader } from "@/providers/EngineProvider.tsx";
import { FileIcon } from "@/icons/index.tsx";
import { Button } from "@/components/primitives/Button.tsx";
import { FieldErrors } from "./FieldErrors.tsx";
import type { QuestionRendererProps } from "./types.ts";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Phase = "idle" | "uploading" | "error";

export function FileUpload({ question, errors, onSubmit, onSkip }: QuestionRendererProps) {
  const upload = useUploader();
  const config = question.config ?? {};
  const accept = typeof config["accept"] === "string" ? (config["accept"] as string) : undefined;
  const maxMB = typeof config["maxSizeMB"] === "number" ? (config["maxSizeMB"] as number) : 10;

  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const busy = phase === "uploading";

  const validateFile = (f: File): string | null => {
    if (f.size > maxMB * 1024 * 1024) return `File is too large (max ${maxMB} MB).`;
    if (accept) {
      const allowed = accept.split(",").map((a) => a.trim().toLowerCase());
      if (allowed.length && !allowed.some((ext) => f.name.toLowerCase().endsWith(ext))) {
        return `Unsupported file type. Allowed: ${accept}.`;
      }
    }
    return null;
  };

  const choose = (f: File) => {
    const problem = validateFile(f);
    setLocalError(problem);
    setPhase("idle");
    setFile(problem ? null : f);
  };

  const start = async () => {
    if (!file) return;
    setPhase("uploading");
    setProgress(0);
    setLocalError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const reference: UploadReference = await upload(file, question.id, {
        onProgress: setProgress,
        signal: controller.signal,
      });
      onSubmit(reference); // engine stores the reference and advances
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setPhase("idle");
        return;
      }
      setPhase("error");
      setLocalError((e as Error).message);
    } finally {
      abortRef.current = null;
    }
  };

  const cancel = () => abortRef.current?.abort();

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) choose(dropped);
  };

  const combinedErrors = localError
    ? [{ rule: "upload", message: localError }, ...errors]
    : errors;

  return (
    <>
      {file === null ? (
        <div
          className="bb-upload"
          data-dragging={dragging}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
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
              {busy ? ` · Uploading ${Math.round(progress * 100)}%` : ""}
            </div>
            {busy && (
              <div className="bb-upload__bar">
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
          </div>
          {busy ? (
            <button type="button" className="bb-btn bb-btn--ghost" onClick={cancel}>
              Cancel
            </button>
          ) : (
            <button type="button" className="bb-btn bb-btn--ghost" onClick={() => setFile(null)}>
              Remove
            </button>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="bb-visually-hidden"
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          if (chosen) choose(chosen);
        }}
      />

      <FieldErrors errors={combinedErrors} />

      <div className="bb-question__footer">
        {file && !busy && (
          <Button variant="primary" onClick={start}>
            {phase === "error" ? "Try again" : "Upload & continue"}
          </Button>
        )}
        {question.optional === true && !busy && (
          <Button variant="ghost" onClick={onSkip}>
            Skip
          </Button>
        )}
      </div>
    </>
  );
}
