"use client";

import { createContext, useRef, type ReactNode, type RefObject } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/app/components/ui/utils";
import { Heading, Text } from "@/components/nido/Typography";

export const FlowScrollRefContext =
  createContext<RefObject<HTMLDivElement | null> | null>(null);

export function FlowScreen({
  children,
  header,
  footer,
  className,
  lockViewport = false,
  constrained = false,
}: {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  lockViewport?: boolean;
  constrained?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const columnClass = cn("w-full", constrained && "mx-auto max-w-md");

  return (
    <div
      className={cn(
        "relative flex flex-col bg-card font-sans",
        lockViewport
          ? "h-[var(--app-height,100dvh)] min-h-0 overflow-x-hidden overflow-y-hidden"
          : "min-h-dvh overflow-x-clip",
        className,
      )}
    >
      {lockViewport ? (
        <FlowScrollRefContext.Provider value={scrollRef}>
            {header ? (
              <div className={cn("relative z-10 shrink-0 bg-card px-6 pt-4", columnClass)}>
                {header}
              </div>
            ) : null}
          <div
            ref={scrollRef}
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain px-6 pb-[max(2rem,env(safe-area-inset-bottom))]",
              !header && "pt-4",
              columnClass,
            )}
          >
            {children}
            {footer}
          </div>
        </FlowScrollRefContext.Provider>
      ) : (
        <div className={cn("flex min-h-dvh flex-col px-6 pt-4 pb-8", columnClass)}>
          {header}
          {children}
          {footer}
        </div>
      )}
    </div>
  );
}

export function ScreenFooter({ children }: { children: ReactNode }) {
  return <div className="mt-8">{children}</div>;
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
  brand,
  description,
  emoji,
  align = "left",
  titleSize = "h1",
  className,
}: {
  title: ReactNode;
  brand?: ReactNode;
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
      {brand && (
        <Text size="body-sm" tone="muted" className="mt-2 font-normal leading-relaxed">
          {brand}
        </Text>
      )}
      {description && (
        <Text size="body-sm" tone="muted" className="mt-2 leading-relaxed">
          {description}
        </Text>
      )}
    </div>
  );
}
