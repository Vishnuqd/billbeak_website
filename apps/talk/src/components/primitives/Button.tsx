import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: "primary" | "ghost";
  readonly children: ReactNode;
}

export function Button({ variant = "primary", className, children, ...rest }: ButtonProps) {
  const cls = ["bb-btn", `bb-btn--${variant}`, className].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}
