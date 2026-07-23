/**
 * Reference upload provider.
 *
 * Produces a deterministic {@link UploadReference} without touching any real
 * storage. A real S3 / GCS / Cloudinary provider implements the same interface;
 * the engine only ever sees "give me a reference for this file".
 */

import type { UploadInput, UploadProgress, UploadProvider } from "../types/adapters.ts";
import type { UploadReference } from "../types/answer.ts";

export class MemoryUploadProvider implements UploadProvider {
  private counter = 0;

  async upload(input: UploadInput, onProgress?: UploadProgress): Promise<UploadReference> {
    onProgress?.(0);
    this.counter += 1;
    const reference: UploadReference = {
      id: `upload_${this.counter}`,
      filename: input.file.name,
      contentType: input.file.type,
      size: input.file.size,
      status: "pending",
    };
    onProgress?.(1);
    return Promise.resolve(reference);
  }
}

/** An upload provider that always rejects — used to exercise the failure path. */
export class FailingUploadProvider implements UploadProvider {
  private readonly reason: string;
  constructor(reason = "upload failed") {
    this.reason = reason;
  }
  upload(): Promise<UploadReference> {
    return Promise.reject(new Error(this.reason));
  }
}
