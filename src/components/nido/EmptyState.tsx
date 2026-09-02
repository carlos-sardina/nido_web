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
  actionDisabled = false,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionLoading = false,
  error,
  plain = false,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionLoading?: boolean;
  error?: string | null;
  plain?: boolean;
}) {
  const hasPrimary = Boolean(actionLabel && onAction);
  const hasSecondary = Boolean(secondaryActionLabel && onSecondaryAction);

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
      {hasPrimary || hasSecondary ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {hasPrimary ? (
            <Button
              variant="secondary"
              size="compact"
              className="w-auto shrink-0 px-4 whitespace-nowrap"
              onClick={onAction}
              disabled={actionDisabled}
            >
              {actionLabel}
            </Button>
          ) : null}
          {hasSecondary ? (
            <Button
              variant={hasPrimary ? "ghost" : "secondary"}
              size="compact"
              className="w-auto shrink-0 px-4 whitespace-nowrap"
              onClick={onSecondaryAction}
              loading={secondaryActionLoading}
            >
              {secondaryActionLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <Text size="caption" tone="danger" className="mt-2">
          {error}
        </Text>
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

