/**
 * Top-level error boundary. Catches render-time exceptions and shows a calm,
 * friendly fallback instead of a white screen or a stack trace. In dev the error
 * is logged to the console for debugging.
 */

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/primitives/Button.tsx";

interface Props {
  readonly children: ReactNode;
}
interface State {
  readonly hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("[ErrorBoundary]", error, info.componentStack);
    }
    // Production: forward to an error-reporting sink here.
  }

  private readonly reload = () => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="bb-state" role="alert">
          <div className="bb-state__inner">
            <h1 className="bb-state__title">This page needs a refresh.</h1>
            <p className="bb-state__body">
              Something unexpected happened. Reloading usually sorts it out.
            </p>
            <div className="bb-state__actions">
              <Button variant="primary" onClick={this.reload}>
                Reload
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
