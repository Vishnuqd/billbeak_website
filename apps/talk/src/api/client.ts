/**
 * Typed API client — generated, not hand-written.
 *
 * `schema.d.ts` is generated from the backend's OpenAPI spec (`npm run generate:api`).
 * `openapi-fetch` turns it into a fully typed client: every path, param, body and
 * response is checked against the backend contract. No per-endpoint fetch wrappers.
 */

import createClient from "openapi-fetch";
import type { paths } from "./schema";

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export const api = createClient<paths>({ baseUrl: API_BASE_URL });

export type { paths };
