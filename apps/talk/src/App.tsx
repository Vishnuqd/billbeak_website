import { ErrorBoundary } from "@/components/ErrorBoundary.tsx";
import { ThemeProvider } from "@/providers/ThemeProvider.tsx";
import { EngineProvider } from "@/providers/EngineProvider.tsx";
import { Router } from "@/routes/Router.tsx";

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <EngineProvider>
          <div className="bb-app">
            <Router />
          </div>
        </EngineProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
