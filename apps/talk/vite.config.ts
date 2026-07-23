import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const fromHere = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The app is served under billbeak.com/talk, so assets resolve against /talk/.
export default defineConfig({
  base: "/talk/",
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
