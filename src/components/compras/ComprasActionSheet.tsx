"use client";

import { useEffect } from "react";
import { Button } from "@/components/nido/Button";
import { NavChevron } from "@/components/nido/ClickHint";
import { P } from "@/lib/palette";

export type ComprasAction = "purchase" | "payment";

export function ComprasActionSheet({
  onSelect,
  onClose,
}: {
  onSelect: (action: ComprasAction) => void;
  onClose: () => void;
}) {
  const actions: { action: ComprasAction; emoji: string; label: string; sub: string }[] = [
    {
      action: "purchase",
      emoji: "🛋️",
      label: "Registrar compra a plazos",
      sub: "MSI, tarjeta y bonificaciones",
    },
    {
      action: "payment",
      emoji: "💳",
      label: "Registrar un pago",
      sub: "Cuota o desparcializar de uno o más",
    },
  ];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="absolute inset-0 z-40"
        style={{ backgroundColor: "rgba(47,42,40,0.40)" }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="compras-action-sheet-title"
        className="absolute bottom-0 left-0 right-0 z-50 rounded-t-[2rem] pt-3 pb-[var(--app-screen-bottom)]"
        style={{ backgroundColor: P.card }}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: P.sub }} />
        <div className="px-5">
          <p
            id="compras-action-sheet-title"
            className="text-xs font-semibold text-center mb-4"
            style={{ color: P.muted }}
          >
            ¿Qué quieres hacer?
          </p>
          <div className="space-y-2 mb-4">
            {actions.map((action) => (
              <button
                key={action.action}
                type="button"
                onClick={() => onSelect(action.action)}
                className="w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ backgroundColor: P.bg }}
              >
                <span className="text-2xl w-9 text-center" aria-hidden="true">
                  {action.emoji}
                </span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: P.text }}>
                    {action.label}
                  </p>
                  <p className="text-caption" style={{ color: P.muted }}>
                    {action.sub}
                  </p>
                </div>
                <NavChevron size={14} className="ml-auto" />
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </>
  );
}
