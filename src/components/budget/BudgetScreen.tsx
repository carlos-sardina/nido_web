"use client";

import { useState } from "react";
import { CATS, TOT_B, TOT_S } from "@/lib/constants";
import { $k, pct } from "@/lib/helpers";
import { P } from "@/lib/palette";

export function BudgetScreen() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:hidden">
      <div className="px-6 pt-3 pb-1">
        <h2 className="text-[22px] font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Presupuesto</h2>
        <p className="text-xs" style={{ color: P.muted }}>Junio 2026</p>
      </div>
      <div className="mx-6 my-3 rounded-[1.5rem] p-5 shadow-sm" style={{ backgroundColor: P.card }}>
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-[10px] mb-0.5" style={{ color: P.muted }}>Total gastado</p>
            <p className="text-[26px] font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>{$k(TOT_S)}</p>
            <p className="text-[10px] font-semibold mt-0.5" style={{ color: P.danger }}>+$1,837 sobre presupuesto</p>
          </div>
          <div className="text-right">
            <p className="text-[10px]" style={{ color: P.muted }}>Presupuestado</p>
            <p className="text-lg font-bold" style={{ color: P.text }}>{$k(TOT_B)}</p>
          </div>
        </div>
        <div className="h-2.5 flex rounded-full overflow-hidden gap-px">
          {CATS.map(c => <div key={c.name} style={{ flex: c.budget, backgroundColor: c.color, opacity: 0.8 }} />)}
        </div>
        <div className="flex gap-3 mt-3 flex-wrap">
          {CATS.slice(0, 4).map(c => (
            <div key={c.name} className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="text-[9px]" style={{ color: P.muted }}>{c.icon} {c.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-6 space-y-2 pb-6">
        {CATS.map(cat => {
          const over = cat.spent > cat.budget;
          const ratio = pct(cat.spent, cat.budget);
          const isOpen = open === cat.name;
          return (
            <button key={cat.name} onClick={() => setOpen(isOpen ? null : cat.name)}
              className="w-full rounded-2xl p-4 shadow-sm text-left active:scale-[0.99] transition-transform" style={{ backgroundColor: P.card }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: P.sub }}>{cat.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold" style={{ color: P.text }}>{cat.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold" style={{ color: over ? P.danger : P.text }}>{$k(cat.spent)}</span>
                      <span className="text-[9px]" style={{ color: P.muted }}>/ {$k(cat.budget)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: P.sub }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, ratio)}%`, backgroundColor: over ? P.danger : cat.color }} />
                  </div>
                </div>
              </div>
              {isOpen && (
                <div className="mt-3 pt-3 border-t grid grid-cols-3 gap-2" style={{ borderColor: P.sub }}>
                  {[
                    { label: "Gastado",    value: $k(cat.spent), color: P.text  },
                    { label: "Restante",   value: over ? `−${$k(cat.spent-cat.budget)}` : $k(cat.budget-cat.spent), color: over ? P.danger : P.sageDk },
                    { label: "vs mes ant.",value: "+12%",         color: P.warn  },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <p className="text-[9px] mb-0.5" style={{ color: P.muted }}>{s.label}</p>
                      <p className="text-xs font-bold" style={{ color: s.color }}>{s.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
