import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const fromHere = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Base path is deploy-dependent:
//  • local dev / S3 subpath  → "/talk/" (default)
//  • Cloudflare Pages (served at a domain root, e.g. talk.billbeak.com) → set VITE_BASE=/
export default defineConfig({
  base: process.env.VITE_BASE ?? "/talk/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": `${dir}src`,
      // Consume the engine directly from source. The engine is framework-agnostic
      // TypeScript; Vite transpiles it as part of the app bundle.
      "@billbeak/conversation-engine": fromHere(
        "../../packages/conversation-engine/src/index.ts",
      ),
    },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true,
  },
});
