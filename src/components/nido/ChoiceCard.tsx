"use client";

import type { ReactNode } from "react";
import { cn } from "@/app/components/ui/utils";
import { Text } from "@/components/nido/Typography";
import { P } from "@/lib/palette";

export function ChoiceCard({
  icon,
  title,
  description,
  selected = false,
  disabled = false,
  badge,
  onClick,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  badge?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-70",
        selected ? "border-primary bg-card" : "border-border bg-card",
      )}
    >
      {icon && (
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
          style={{ backgroundColor: P.sagePl }}
        >
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <Text as="span" size="label" className="block">
          {title}
        </Text>
        {description && (
          <Text as="span" size="caption" tone="muted" className="block mt-0.5 leading-relaxed">
            {description}
          </Text>
        )}
      </div>
      {badge}
    </button>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text
      as="p"
      size="caption"
      tone="muted"
      className="font-semibold uppercase tracking-widest mb-2"
    >
      {children}
    </Text>
  );
}
