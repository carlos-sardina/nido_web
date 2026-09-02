"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/app/components/ui/utils";

/** primary = main action · secondary = alternate/create-another · ghost = cancel/close · danger = destructive confirm */
export type NidoButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type NidoButtonSize = "default" | "compact";

export function Button({
  variant = "primary",
  size = "default",
  loading = false,
  className,
  disabled,
  type = "button",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: NidoButtonVariant;
  size?: NidoButtonSize;
  loading?: boolean;
  children: ReactNode;
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-2xl font-semibold transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "active:scale-[0.98] disabled:active:scale-100",
        "disabled:cursor-not-allowed disabled:pointer-events-none",
        size === "default" ? "h-14 px-6 text-sm" : "h-11 px-4 text-sm",
        variant === "primary" &&
          "bg-primary text-primary-foreground hover:bg-primary-hover disabled:bg-muted disabled:text-muted-foreground",
        variant === "secondary" &&
          "bg-secondary text-secondary-foreground hover:bg-muted",
        variant === "ghost" &&
          "bg-transparent text-muted-foreground border border-border hover:bg-muted",
        variant === "danger" &&
          "bg-danger text-white hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
