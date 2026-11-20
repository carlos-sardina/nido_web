"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { HOME_CARD_SHADOW } from "@/components/home/home-card";
import { P } from "@/lib/palette";

/**
 * Empty / invite module card inspired by Revolut home sections:
 * title + chevron, short hint, breathing room, full-width soft CTA.
 */
export function HomeInviteCard({
  title,
  hint,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  onOpen,
  icon,
}: {
  title: string;
  hint: string;
  actionLabel: string;
  onAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  /** If set, the title row opens the module instead of only the CTA. */
  onOpen?: () => void;
  icon?: ReactNode;
}) {
  const titleRow = (
    <>
      {icon ? (
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
          style={{ backgroundColor: P.sub }}
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <span className="text-sm font-semibold" style={{ color: P.text }}>
        {title}
      </span>
      {onOpen ? (
        <ChevronRight
          size={16}
          className="ml-auto shrink-0"
          style={{ color: P.muted }}
          aria-hidden="true"
        />
      ) : null}
    </>
  );

  return (
    <div
      className="rounded-[1.5rem] p-5"
      style={{ backgroundColor: P.card, boxShadow: HOME_CARD_SHADOW }}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {titleRow}
        </button>
      ) : (
        <div className="flex items-center gap-2">{titleRow}</div>
      )}

      <p className="mt-1.5 text-[12px] leading-snug" style={{ color: P.muted }}>
        {hint}
      </p>

      <div className="min-h-[3.25rem]" aria-hidden="true" />

      <button
        type="button"
        onClick={onAction}
        className="w-full rounded-full py-3.5 text-center text-sm font-semibold transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ backgroundColor: P.sub, color: P.text }}
      >
        {actionLabel}
      </button>

      {secondaryActionLabel && onSecondaryAction ? (
        <button
          type="button"
          onClick={onSecondaryAction}
          className="mt-2 w-full rounded-full py-3 text-center text-sm font-semibold transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ color: P.brnDk }}
        >
          {secondaryActionLabel}
        </button>
      ) : null}
    </div>
  );
}
