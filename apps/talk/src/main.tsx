import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/theme/tokens.css";
import "@/theme/global.css";
import "@/theme/app.css";
import { App } from "@/App.tsx";

const container = document.getElementById("root");
if (container === null) {
  throw new Error('Root element "#root" not found.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
