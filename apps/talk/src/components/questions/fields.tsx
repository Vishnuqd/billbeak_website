/**
 * Field components used inside a `group` question: a phone input with a country
 * selector, and a compact file sub-field that uploads to the backend.
 */

import { useMemo, useRef, useState } from "react";
import type { UploadReference } from "@billbeak/conversation-engine";
import { useUploader } from "@/providers/EngineProvider.tsx";
import { FileIcon } from "@/icons/index.tsx";

const COUNTRIES = [
  { code: "IN", dial: "+91", label: "India" },
  { code: "US", dial: "+1", label: "United States" },
  { code: "GB", dial: "+44", label: "United Kingdom" },
  { code: "AE", dial: "+971", label: "UAE" },
  { code: "SG", dial: "+65", label: "Singapore" },
  { code: "AU", dial: "+61", label: "Australia" },
  { code: "CA", dial: "+1", label: "Canada" },
  { code: "DE", dial: "+49", label: "Germany" },
] as const;

interface PhoneFieldProps {
  value: string;
  onChange: (value: string) => void;
  defaultCountry?: string;
  editable?: boolean;
  ariaLabel?: string;
}

export function PhoneField({ value, onChange, defaultCountry = "IN", editable = true, ariaLabel }: PhoneFieldProps) {
  const initial = useMemo(() => {
    const match = COUNTRIES.find((c) => value.startsWith(c.dial));
    if (match) return { dial: match.dial, number: value.slice(match.dial.length).trim() };
    const def = COUNTRIES.find((c) => c.code === defaultCountry) ?? COUNTRIES[0];
    return { dial: def.dial, number: value };
  }, [value, defaultCountry]);

  const [dial, setDial] = useState<string>(initial.dial);
  const [number, setNumber] = useState<string>(initial.number);

  const emit = (nextDial: string, nextNumber: string) => {
    setDial(nextDial);
    setNumber(nextNumber);
    onChange(nextNumber.trim() ? `${nextDial} ${nextNumber.trim()}` : "");
  };

  return (
    <div className="bb-phone">
      <select
        className="bb-phone__cc"
        value={dial}
        disabled={!editable}
        aria-label="Country code"
        onChange={(e) => emit(e.target.value, number)}
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.dial}>
            {c.code} {c.dial}
          </option>
        ))}
      </select>
      <input
        className="bb-input bb-phone__num"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        aria-label={ariaLabel ?? "Phone number"}
        placeholder="98765 43210"
        value={number}
        onChange={(e) => emit(dial, e.target.value)}
      />
    </div>
  );
}

interface FileSubFieldProps {
  questionId: string;
  value: UploadReference | undefined;
  onChange: (value: UploadReference | undefined) => void;
  accept?: string;
  label?: string;
}

export function FileSubField({ questionId, value, onChange, accept, label }: FileSubFieldProps) {
  const upload = useUploader();
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = async (file: File) => {
    setUploading(true);
    setProgress(0);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const reference = await upload(file, questionId, { onProgress: setProgress, signal: controller.signal });
      onChange(reference);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setUploading(false);
      abortRef.current = null;
    }
  };

  if (value) {
    return (
      <div className="bb-upload__file">
        <FileIcon />
        <div className="bb-upload__meta">
          <div className="bb-upload__name">{value.filename}</div>
          <div className="bb-upload__size">Uploaded</div>
        </div>
        <button type="button" className="bb-btn bb-btn--ghost" onClick={() => onChange(undefined)}>
          Remove
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="bb-upload bb-upload--compact"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        <FileIcon />
        <span className="bb-upload__hint">
          {uploading ? `Uploading ${Math.round(progress * 100)}%` : (label ?? "Choose a file")}
        </span>
      </button>
      {uploading && (
        <div className="bb-upload__bar">
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {error && <span className="bb-error">{error}</span>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="bb-visually-hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void start(f);
        }}
      />
    </div>
  );
}
