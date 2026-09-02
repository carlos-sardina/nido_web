"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/app/components/ui/utils";
import { NavChevron } from "@/components/nido/ClickHint";

export function TextLink({
  tone = "brand",
  affordance = "action",
  className,
  children,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "brand" | "muted" | "danger";
  /** action = underline · nav = chevron (opens another screen) */
  affordance?: "action" | "nav";
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-0.5 min-h-11 px-2 text-sm font-semibold rounded-lg",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        tone === "brand" && "text-primary hover:text-primary-hover",
        tone === "muted" && "text-muted-foreground hover:text-foreground",
        tone === "danger" && "text-danger hover:opacity-80",
        affordance === "action" && "underline underline-offset-2",
        className,
      )}
      {...props}
    >
      {children}
      {affordance === "nav" ? <NavChevron size={14} /> : null}
    </button>
  );
}
