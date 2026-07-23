import { useTheme } from "@/providers/ThemeProvider.tsx";
import { Moon, Sun } from "@/icons/index.tsx";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      className="bb-iconbtn bb-themetoggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}
