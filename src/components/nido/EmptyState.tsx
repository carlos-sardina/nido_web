"use client";

import type { ReactNode } from "react";
import { P } from "@/lib/palette";
import { Button } from "./Button";
import { Text } from "./Typography";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  plain = false,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  plain?: boolean;
}) {
  return (
    <div
      className={plain ? "py-1" : "rounded-[1.5rem] p-5 shadow-sm"}
      style={plain ? undefined : { backgroundColor: P.card }}
    >
      <Text size="body-sm" className="font-semibold">
        {title}
      </Text>
      <Text size="caption" tone="muted" className="mt-1 leading-relaxed">
        {description}
      </Text>
      {actionLabel && onAction ? (
        <Button variant="secondary" size="compact" className="mt-4 w-auto px-4" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyInline({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-1 py-2">
      <Text size="body-sm" className="font-semibold">
        {title}
      </Text>
      <Text size="caption" tone="muted" className="mt-1 leading-relaxed">
        {description}
      </Text>
      {children}
    </div>
  );
}

