/**
 * Backend upload — replaces the placeholder provider.
 *
 * Uploads go straight to the backend (`POST /journeys/{id}/uploads`) via XHR so
 * we get real progress, cancel (AbortSignal) and retry. Components upload the
 * file and submit the returned reference to the engine (which then just stores
 * it). `BackendUploadProvider` is the engine-level safety net for any raw file
 * that reaches the engine's upload routing.
 */

import type {
  UploadInput,
  UploadProgress,
  UploadProvider,
  UploadReference,
} from "@billbeak/conversation-engine";
import { API_BASE_URL } from "@/api/client.ts";
import type { BackendSync } from "@/engine/backend/sync.ts";

export interface UploadHandlers {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

interface RawUploadOut {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  scanStatus: string;
  url: string | null;
}

export function uploadToBackend(
  journeyId: string,
  file: File,
  questionId: string | null,
  handlers: UploadHandlers = {},
): Promise<UploadReference> {
  return new Promise<UploadReference>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    if (questionId) form.append("questionId", questionId);

    xhr.open("POST", `${API_BASE_URL}/journeys/${journeyId}/uploads`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && handlers.onProgress) handlers.onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const body = JSON.parse(xhr.responseText) as RawUploadOut;
        resolve({
          id: body.id,
          filename: body.filename,
          contentType: body.contentType,
          size: body.sizeBytes,
          status: (body.scanStatus as UploadReference["status"]) ?? "pending",
          ...(body.url ? { url: body.url } : {}),
        });
      } else {
        let message = "Upload failed. Please try again.";
        try {
          message = (JSON.parse(xhr.responseText).error?.message as string) ?? message;
        } catch {
          /* keep default */
        }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));

    if (handlers.signal) {
      if (handlers.signal.aborted) {
        xhr.abort();
        return;
      }
      handlers.signal.addEventListener("abort", () => xhr.abort());
    }
    xhr.send(form);
  });
}

/** The uploader components call directly (progress + cancel + retry). */
export type Uploader = (
  file: File,
  questionId: string | null,
  handlers?: UploadHandlers,
) => Promise<UploadReference>;

export function createUploader(sync: BackendSync): Uploader {
  return async (file, questionId, handlers) => {
    const journeyId = await sync.ensureJourneyId();
    if (!journeyId) {
      throw new Error("You appear to be offline. Reconnect to upload your file.");
    }
    return uploadToBackend(journeyId, file, questionId, handlers ?? {});
  };
}

/** Engine-level provider (safety net). Real uploads go through the components. */
export class BackendUploadProvider implements UploadProvider {
  constructor(private readonly sync: BackendSync) {}

  async upload(input: UploadInput, onProgress?: UploadProgress): Promise<UploadReference> {
    const journeyId = await this.sync.ensureJourneyId();
    if (!journeyId) throw new Error("Cannot upload while offline.");
    const handlers: UploadHandlers = onProgress ? { onProgress } : {};
    return uploadToBackend(journeyId, input.file as unknown as File, input.questionId, handlers);
  }
}
