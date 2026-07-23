/**
 * App-side upload provider (placeholder).
 *
 * Simulates a resumable upload with progress so the Upload UI can be built and
 * tested without any real storage. The engine only ever sees "give me a
 * reference for this file". Swapping in a real S3/presigned-URL provider is an
 * adapter change with no engine or component change.
 */

import type {
  UploadInput,
  UploadProgress,
  UploadProvider,
  UploadReference,
} from "@billbeak/conversation-engine";

export interface PlaceholderUploadOptions {
  /** Total simulated duration in ms. */
  readonly durationMs?: number;
  /** Force a failure to exercise the retry path. */
  readonly failOnce?: boolean;
}

export class PlaceholderUploadProvider implements UploadProvider {
  private readonly durationMs: number;
  private shouldFail: boolean;
  private counter = 0;

  constructor(options: PlaceholderUploadOptions = {}) {
    this.durationMs = options.durationMs ?? 1100;
    this.shouldFail = options.failOnce ?? false;
  }

  async upload(input: UploadInput, onProgress?: UploadProgress): Promise<UploadReference> {
    const steps = 20;
    const stepMs = this.durationMs / steps;
    for (let i = 1; i <= steps; i += 1) {
      await delay(stepMs);
      onProgress?.(i / steps);
      if (this.shouldFail && i === Math.floor(steps / 2)) {
        this.shouldFail = false; // fail only once, so retry succeeds
        throw new Error("Upload interrupted. Please try again.");
      }
    }
    this.counter += 1;
    return {
      id: `upload_${this.counter}_${Date.now().toString(36)}`,
      filename: input.file.name,
      contentType: input.file.type || "application/octet-stream",
      size: input.file.size,
      status: "pending",
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
