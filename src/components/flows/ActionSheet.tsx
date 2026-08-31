"use client";

import { useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { P } from "@/lib/palette";
import type { Flow } from "@/lib/types";
import { Button } from "@/components/nido/Button";

export function ActionSheet({
  onSelect,
  onClose,
}: {
  onSelect: (f: Flow) => void;
  onClose: () => void;
}) {
  const actions: { flow: Exclude<Flow, null>; emoji: string; label: string; sub: string }[] = [
    { flow: "expense", emoji: "💸", label: "Registrar un gasto", sub: "Compartido o personal" },
    { flow: "income", emoji: "💰", label: "Registrar un ingreso", sub: "Sueldo, freelance u extra" },
    { flow: "budget", emoji: "📊", label: "Crear un presupuesto", sub: "Límite por categoría este mes" },
    { flow: "goal", emoji: "🎯", label: "Crear una meta o un fondo", sub: "Personal o del Nido" },
    { flow: "contrib", emoji: "💰", label: "Registrar una aportación", sub: "Agrega a una meta o un fondo" },
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
        aria-labelledby="nido-action-sheet-title"
        className="absolute bottom-0 left-0 right-0 z-50 rounded-t-[2rem] pt-3 pb-[max(2rem,env(safe-area-inset-bottom))]"
        style={{ backgroundColor: P.card }}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: P.sub }} />
        <div className="px-5">
          <p
            id="nido-action-sheet-title"
            className="text-xs font-semibold text-center mb-4"
            style={{ color: P.muted }}
          >
            ¿Qué quieres hacer?
          </p>
          <div className="space-y-2 mb-4">
            {actions.map((action) => (
              <button
                key={action.flow}
                type="button"
                onClick={() => onSelect(action.flow)}
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
                <ChevronRight size={14} style={{ color: P.muted, marginLeft: "auto" }} aria-hidden="true" />
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
