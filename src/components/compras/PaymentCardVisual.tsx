"use client";

import { CreditCard } from "lucide-react";
import { Text } from "@/components/nido/Typography";
import { P } from "@/lib/palette";

const CARD_TONES = [
  "linear-gradient(145deg, #3A3330 0%, #5A4E48 55%, #2F2A28 100%)",
  "linear-gradient(145deg, #255D4D 0%, #2F7D66 55%, #1B3C32 100%)",
  "linear-gradient(145deg, #B87485 0%, #D88D9A 55%, #8F5A68 100%)",
  "linear-gradient(145deg, #5C4A38 0%, #8A6A4E 55%, #3D3228 100%)",
] as const;

export function cardToneForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash + id.charCodeAt(i) * (i + 1)) % 997;
  return CARD_TONES[hash % CARD_TONES.length];
}

export function PaymentCardVisual({
  label,
  ownerName,
  lastFour,
  bank,
  cutDay,
  paymentDay,
  tone,
  compact = false,
  onClick,
}: {
  label: string;
  ownerName?: string | null;
  lastFour?: string | null;
  bank?: string | null;
  cutDay?: number;
  paymentDay?: number;
  tone?: string;
  compact?: boolean;
  onClick?: () => void;
}) {
  const background = tone ?? CARD_TONES[0];
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={
        onClick
          ? "w-full text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[1.25rem]"
          : "w-full"
      }
    >
      <div
        className={`relative overflow-hidden rounded-[1.25rem] text-white shadow-sm ${
          compact ? "p-3.5 min-h-[7.5rem]" : "p-4 min-h-[9.5rem]"
        }`}
        style={{ background }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-10 right-10 h-20 w-20 rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
        />

        <div className="relative flex items-start justify-between gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
          >
            <CreditCard size={18} strokeWidth={2} aria-hidden="true" />
          </div>
          <span
            className="text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            {bank?.trim() || "Nido"}
          </span>
        </div>

        <div className="relative mt-5">
          <p className={`font-semibold leading-tight ${compact ? "text-sm" : "text-base"}`}>
            {label}
          </p>
          <p
            className="mt-1 text-[11px] font-medium"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            {ownerName ? `${ownerName}` : "Miembro"}
            {lastFour ? ` · ····${lastFour}` : ""}
          </p>
          {cutDay != null && paymentDay != null ? (
            <p className="mt-2 text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>
              Corte {cutDay} · Pago {paymentDay}
            </p>
          ) : null}
        </div>
      </div>
    </Tag>
  );
}

export function DueSparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  const width = 120;
  const height = 44;
  if (values.length < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
        <path
          d={`M 8 ${height - 10} L ${width - 8} ${height - 10}`}
          fill="none"
          stroke={P.brnDk}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const points = values.map((value, index) => {
    const x = 8 + (index * (width - 16)) / (values.length - 1);
    const y = height - 8 - ((value - min) / span) * (height - 16);
    return { x, y };
  });
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const area = `${line} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <path d={area} fill="rgba(216,141,154,0.18)" />
      <path d={line} fill="none" stroke={P.brnDk} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="3.5" fill={P.brnDk} />
    </svg>
  );
}

export function MonthDueWidget({
  amountLabel,
  caption = "Cuotas por depositar",
  hint = "Abrir cuotas",
  values,
  onClick,
}: {
  amountLabel: string;
  caption?: string;
  hint?: string;
  values: number[];
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={
        onClick
          ? "w-full rounded-[1.25rem] p-3.5 text-left shadow-sm transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[8.5rem]"
          : "w-full rounded-[1.25rem] p-3.5 shadow-sm min-h-[8.5rem]"
      }
      style={{ backgroundColor: P.card }}
    >
      <Text size="caption" tone="muted">
        {caption}
      </Text>
      <p className="mt-1 text-lg font-bold font-sans leading-none" style={{ color: P.text }}>
        {amountLabel}
      </p>
      <DueSparkline values={values} className="mt-3 w-full h-11" />
      {onClick && hint ? (
        <p className="mt-2 text-[10px] font-semibold" style={{ color: P.brnDk }}>
          {hint} →
        </p>
      ) : null}
    </Tag>
  );
}

export function SpendWidget({
  caption,
  amountLabel,
  values,
  tone = "rose",
  onClick,
}: {
  caption: string;
  amountLabel: string;
  values: number[];
  tone?: "rose" | "sage";
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  const stroke = tone === "sage" ? P.sage : P.brnDk;
  const fill = tone === "sage" ? "rgba(47,125,102,0.16)" : "rgba(216,141,154,0.18)";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={
        onClick
          ? "w-full rounded-[1.25rem] p-3.5 text-left shadow-sm transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[8.5rem]"
          : "w-full rounded-[1.25rem] p-3.5 shadow-sm min-h-[8.5rem]"
      }
      style={{ backgroundColor: P.card }}
    >
      <Text size="caption" tone="muted">
        {caption}
      </Text>
      <p className="mt-1 text-lg font-bold font-sans leading-none" style={{ color: P.text }}>
        {amountLabel}
      </p>
      <SpendSparkline values={values} stroke={stroke} fill={fill} className="mt-3 w-full h-11" />
    </Tag>
  );
}

function SpendSparkline({
  values,
  stroke,
  fill,
  className,
}: {
  values: number[];
  stroke: string;
  fill: string;
  className?: string;
}) {
  const width = 120;
  const height = 44;
  if (values.length < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
        <path
          d={`M 8 ${height - 10} L ${width - 8} ${height - 10}`}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const points = values.map((value, index) => {
    const x = 8 + (index * (width - 16)) / (values.length - 1);
    const y = height - 8 - ((value - min) / span) * (height - 16);
    return { x, y };
  });
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const area = `${line} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="3.5" fill={stroke} />
    </svg>
  );
}
