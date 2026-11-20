"use client";

import { ChevronRight } from "lucide-react";
import { HOME_CARD_SHADOW } from "@/components/home/home-card";
import {
  DEFAULT_PURCHASE_EMOJI,
  formatExactMoney,
  resolvePurchaseEmoji,
} from "@/lib/nido/financial";

export type ComprasHomePreview = {
  purchaseCount: number;
  /** Amount shown on the home card (current month, or next month with dues). */
  dueAmount: number;
  /** Caption under/beside the amount, e.g. "por depositar" or "en diciembre". */
  dueCaption: string;
  emojis: string[];
};

const CARD_BG = "linear-gradient(135deg, #B87485 0%, #D88D9A 100%)";

export function ComprasHomeCard({
  preview,
  onOpen,
}: {
  preview: ComprasHomePreview;
  onOpen: () => void;
}) {
  const emojis =
    preview.emojis.length > 0
      ? preview.emojis.slice(0, 3).map((emoji) => resolvePurchaseEmoji(emoji))
      : [DEFAULT_PURCHASE_EMOJI];
  const hasPurchases = preview.purchaseCount > 0;
  const dueLabel =
    preview.dueAmount > 0
      ? formatExactMoney(preview.dueAmount)
      : hasPurchases
        ? formatExactMoney(0)
        : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative w-full overflow-hidden rounded-[1.5rem] p-5 text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ background: CARD_BG, boxShadow: HOME_CARD_SHADOW }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full"
        style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-14 right-6 h-28 w-28 rounded-full"
        style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            Compras a plazos
          </p>
          {dueLabel != null ? (
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[28px] font-bold font-sans leading-none text-white">
                {dueLabel}
              </span>
              <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                {preview.dueCaption}
              </span>
            </div>
          ) : (
            <p className="mt-2 text-[22px] font-bold leading-none text-white">
              Amuebla el Nido
            </p>
          )}
          <p className="mt-2 text-[12px] leading-snug" style={{ color: "rgba(255,255,255,0.55)" }}>
            {hasPurchases
              ? preview.purchaseCount === 1
                ? "1 compra activa · MSI, cooperación y bonos"
                : `${preview.purchaseCount} compras activas · MSI, cooperación y bonos`
              : "Registra MSI, tarjetas y bonificaciones del amueblado"}
          </p>
        </div>

        <div className="flex shrink-0 items-center pt-1">
          <div className="flex items-center" aria-hidden="true">
            {emojis.map((emoji, index) => (
              <div
                key={`${emoji}-${index}`}
                className="flex h-11 w-11 items-center justify-center rounded-full text-xl shadow-sm"
                style={{
                  backgroundColor: "rgba(255,252,250,0.94)",
                  marginLeft: index === 0 ? 0 : -10,
                  zIndex: emojis.length - index,
                }}
              >
                {emoji}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative mt-4 flex items-center justify-between gap-3">
        <div
          className="inline-flex items-baseline gap-1.5 rounded-xl px-3 py-2"
          style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
        >
          {hasPurchases ? (
            <>
              <span className="text-xs font-bold font-sans text-white">
                {preview.purchaseCount}
              </span>
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.55)" }}>
                {preview.purchaseCount === 1 ? "compra" : "compras"}
              </span>
            </>
          ) : (
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.55)" }}>
              sin compras
            </span>
          )}
        </div>
        <span
          className="inline-flex items-center gap-0.5 text-[11px] font-semibold"
          style={{ color: "rgba(255,255,255,0.9)" }}
        >
          Abrir
          <ChevronRight size={14} aria-hidden="true" />
        </span>
      </div>
    </button>
  );
}
