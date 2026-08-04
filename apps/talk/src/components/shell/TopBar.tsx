import { Close } from "@/icons/index.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";

interface TopBarProps {
  readonly onClose: () => void;
}

export function TopBar({ onClose }: TopBarProps) {
  return (
    <header className="bb-topbar">
      <div className="bb-topbar__slot">
        <img
          className="bb-logo"
          src={`${import.meta.env.BASE_URL}billbeak-logo.png`}
          alt="Billbeak"
          width={106}
          height={38}
        />
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
