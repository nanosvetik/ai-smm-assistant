import type { ButtonHTMLAttributes } from "react";
import "./Button.css";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "quiet";
}

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return <button className={`btn btn-${variant} ${className ?? ""}`} {...props} />;
}
