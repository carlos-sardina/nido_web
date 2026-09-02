"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/app/components/ui/utils";
import { P } from "@/lib/palette";

/** Chevron for rows and cards that open another screen. */
export function NavChevron({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <ChevronRight
      size={size}
      className={cn("flex-shrink-0", className)}
      style={{ color: P.muted }}
      aria-hidden="true"
    />
  );
}

/** Label + chevron used inside a larger clickable card. */
export function SeeMoreHint({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-[10px] font-semibold", className)}
      style={{ color: P.brnDk }}
    >
      {children}
      <ChevronRight size={12} aria-hidden="true" />
    </span>
  );
}

/** Standalone “Ver X” section link. */
export function SeeMoreLink({
  children,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center min-h-9 -my-2 rounded",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      <SeeMoreHint>{children}</SeeMoreHint>
    </button>
  );
}

/** Radio/check mark for selectable options. */
export function SelectHint({ selected }: { selected: boolean }) {
  if (selected) {
    return (
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: P.brnDk }}
        aria-hidden="true"
      >
        <Check size={12} color="#FFFCFA" strokeWidth={2.5} />
      </span>
    );
  }

  return (
    <span
      className="w-5 h-5 rounded-full flex-shrink-0 border-2"
      style={{ borderColor: P.sub }}
      aria-hidden="true"
    />
  );
}
