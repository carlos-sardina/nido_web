"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/app/components/ui/utils";
import { Heading, Text } from "@/components/nido/Typography";

export function FlowScreen({
  children,
  footer,
  className,
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative min-h-dvh flex flex-col overflow-x-hidden overflow-y-hidden bg-card font-sans",
        className,
      )}
    >
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden">
        <div
          className={cn(
            "mx-auto w-full max-w-md px-6 pt-4 pb-8 flex flex-col",
            footer ? "min-h-full" : "min-h-dvh",
          )}
        >
          {children}
        </div>
      </div>
      {footer}
    </div>
  );
}

export function ScreenFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex-shrink-0 border-t border-border bg-card">
      <div className="mx-auto w-full max-w-md px-6 pb-6 pt-3">
        {children}
      </div>
    </div>
  );
}

export function BackLink({
  onClick,
  label = "Atrás",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-4 inline-flex items-center gap-1 min-h-11 -ml-2 px-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronLeft size={16} aria-hidden="true" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

export function ScreenIntro({
  title,
  description,
  emoji,
  align = "left",
  titleSize = "h1",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  emoji?: string;
  align?: "left" | "center";
  titleSize?: "display" | "h1" | "h2";
  className?: string;
}) {
  return (
    <div className={cn(align === "center" ? "text-center" : "text-left", className)}>
      {emoji && (
        <p className="text-h1 mb-2" aria-hidden="true">
          {emoji}
        </p>
      )}
      <Heading size={titleSize}>{title}</Heading>
      {description && (
        <Text size="body-sm" tone="muted" className="mt-2 leading-relaxed">
          {description}
        </Text>
      )}
    </div>
  );
}
