"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/app/components/ui/utils";
import { Heading, Text } from "@/components/nido/Typography";

const FlowLayoutContext = createContext(false);

export function FlowScreen({
  children,
  footer,
  className,
  lockViewport = false,
  constrained = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  lockViewport?: boolean;
  constrained?: boolean;
}) {
  return (
    <FlowLayoutContext.Provider value={constrained}>
      <div
        className={cn(
          "relative flex flex-col bg-card font-sans",
          lockViewport
            ? "h-[var(--app-height,100dvh)] min-h-0 overflow-x-hidden overflow-y-hidden"
            : "min-h-dvh overflow-x-clip",
          className,
        )}
      >
        <div
          className={cn(
            "flex flex-col",
            lockViewport && "min-h-0 flex-1 overflow-hidden",
          )}
        >
          <div
            className={cn(
              "flex w-full flex-col px-6 pt-4",
              constrained && "mx-auto max-w-md",
              lockViewport ? "min-h-0 flex-1 pb-0" : "min-h-dvh pb-8",
            )}
          >
            {children}
          </div>
        </div>
        {footer}
      </div>
    </FlowLayoutContext.Provider>
  );
}

export function ScreenFooter({
  children,
  constrained: constrainedProp,
}: {
  children: ReactNode;
  constrained?: boolean;
}) {
  const constrainedFromParent = useContext(FlowLayoutContext);
  const constrained = constrainedProp ?? constrainedFromParent;

  return (
    <div className="flex-shrink-0 border-t border-border bg-card">
      <div
        className={cn(
          "w-full px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]",
          constrained && "mx-auto max-w-md",
        )}
      >
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
