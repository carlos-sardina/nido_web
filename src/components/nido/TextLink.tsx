"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/app/components/ui/utils";

export function TextLink({
  tone = "brand",
  className,
  children,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "brand" | "muted";
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center min-h-11 px-2 text-sm font-semibold rounded-lg",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        tone === "brand" ? "text-primary hover:text-primary-hover" : "text-muted-foreground hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
