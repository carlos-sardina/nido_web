"use client";

import type { ReactNode } from "react";
import { cn } from "@/app/components/ui/utils";
import { NavChevron } from "@/components/nido/ClickHint";
import { P } from "@/lib/palette";

const EMERALD = "linear-gradient(135deg, #255D4D 0%, #2F7D66 100%)";
const SAGE = "linear-gradient(135deg, #E8F4EF 0%, #F4EFE6 58%, #FAF4EC 100%)";

export function EmeraldHero({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-[1.5rem] overflow-hidden", className)}
      style={{ background: EMERALD }}
    >
      <div className="relative p-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-12 right-8 h-24 w-24 rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
        />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}

export function HeroKicker({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-2">
      <p
        className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: "rgba(255,255,255,0.45)" }}
      >
        {children}
      </p>
      {trailing != null && trailing !== "" ? (
        <span className="text-[10px] font-medium flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>
          {trailing}
        </span>
      ) : null}
    </div>
  );
}

export function HeroAmount({
  value,
  caption,
}: {
  value: ReactNode;
  caption?: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[28px] font-bold font-sans text-white leading-none">{value}</span>
      {caption != null && caption !== "" ? (
        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
          {caption}
        </span>
      ) : null}
    </div>
  );
}

export function HeroChip({
  value,
  label,
}: {
  value: ReactNode;
  label: ReactNode;
}) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
      <p className="text-xs font-bold font-sans text-white">{value}</p>
      <p className="text-[9px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
        {label}
      </p>
    </div>
  );
}

export function SagePlaceCard({
  eyebrow,
  title,
  icon,
  onClick,
  disabled = false,
}: {
  eyebrow: string;
  title: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 rounded-[1.5rem] px-4 py-3.5 shadow-sm text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70 disabled:active:scale-100"
      style={{ background: SAGE }}
    >
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: P.sage }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: P.sage }}>
          {eyebrow}
        </p>
        <p className="text-sm font-semibold" style={{ color: P.text }}>
          {title}
        </p>
      </div>
      <NavChevron />
    </button>
  );
}
