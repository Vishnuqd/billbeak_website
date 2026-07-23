import { ArrowLeft, Close } from "@/icons/index.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";

interface TopBarProps {
  readonly canGoBack: boolean;
  readonly onBack: () => void;
  readonly onClose: () => void;
}

export function TopBar({ canGoBack, onBack, onClose }: TopBarProps) {
  return (
    <header className="bb-topbar">
      <div className="bb-topbar__slot">
        {canGoBack ? (
          <button type="button" className="bb-iconbtn" onClick={onBack}>
            <ArrowLeft />
            <span>Back</span>
          </button>
        ) : (
          <span className="bb-wordmark">Billbeak</span>
        )}
      </div>

      <div className="bb-topbar__slot bb-topbar__slot--right">
        <ThemeToggle />
        <button type="button" className="bb-iconbtn" onClick={onClose} aria-label="Close">
          <Close />
        </button>
      </div>
    </header>
  );
}
