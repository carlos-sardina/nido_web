"use client";

import { useState } from "react";
import {
  C_CAP, C_INC, C_PER, D_CAP, D_INC, D_PER, DIANA_ITEMS, LIFE_EVENTS, TOT_B, T_CAP, T_INC,
} from "@/lib/constants";
import { $k } from "@/lib/helpers";
import { P } from "@/lib/palette";
import type { Model } from "@/lib/types";

export function HouseholdScreen({ model, setModel }: { model: Model; setModel: (m: Model) => void }) {
  const [showItems, setShowItems]   = useState(false);
  const [events, setEvents]         = useState(LIFE_EVENTS.map(e => e.active));
  const shares = model === "equal" ? { d: 50, c: 50 }
    : model === "proportional" ? { d: Math.round(D_INC/T_INC*100), c: Math.round(C_INC/T_INC*100) }
    : { d: Math.round(D_CAP/T_CAP*100), c: Math.round(C_CAP/T_CAP*100) };

  return (
    <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:hidden">
      <div className="px-6 pt-3 pb-1">
        <h2 className="text-[22px] font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Hogar</h2>
        <p className="text-xs" style={{ color: P.muted }}>Departamento · 2 miembros</p>
      </div>
      <div className="px-6 my-3 flex gap-3">
        {[
          { name: "Diana",  init: "DV", income: D_INC, personal: D_PER, cap: D_CAP, color: P.sage  },
          { name: "Carlos", init: "CR", income: C_INC, personal: C_PER, cap: C_CAP, color: "#5A9E90" },
        ].map(m => (
          <div key={m.name} className="flex-1 rounded-[1.5rem] p-4 shadow-sm" style={{ backgroundColor: P.card }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: m.color }}>{m.init}</div>
              <span className="text-sm font-semibold" style={{ color: P.text }}>{m.name}</span>
            </div>
            <p className="text-[9px]" style={{ color: P.muted }}>Ingreso</p>
            <p className="text-base font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>{$k(m.income)}</p>
            <div className="mt-2 pt-2 border-t" style={{ borderColor: P.sub }}>
              <p className="text-[9px]" style={{ color: P.muted }}>Gastos pers.</p>
              <p className="text-xs font-semibold" style={{ color: P.danger }}>−{$k(m.personal)}</p>
              <p className="text-[9px] mt-1" style={{ color: P.muted }}>Capacidad</p>
              <p className="text-sm font-bold" style={{ color: m.color }}>{$k(m.cap)}</p>
            </div>
          </div>
        ))}
      </div>
      {/* Diana items expandable */}
      <div className="mx-6 mb-3 bg-white rounded-[1.5rem] shadow-sm overflow-hidden">
        <button className="w-full flex items-center justify-between p-4" onClick={() => setShowItems(!showItems)}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm" style={{ backgroundColor: P.sagePl }}>👤</div>
            <div className="text-left">
              <p className="text-xs font-semibold" style={{ color: P.text }}>Gastos fijos de Diana</p>
              <p className="text-[9px]" style={{ color: P.muted }}>{DIANA_ITEMS.length} compromisos · {$k(D_PER)}/mes</p>
            </div>
          </div>
          <span className="text-[10px] font-bold" style={{ color: P.danger }}>−{$k(D_PER)}</span>
        </button>
        {showItems && (
          <div className="px-4 pb-4 space-y-1.5 border-t pt-3" style={{ borderColor: P.sub }}>
            {DIANA_ITEMS.map(item => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-sm">{item.icon}</span><span className="text-xs" style={{ color: P.text }}>{item.name}</span></div>
                <span className="text-[10px] font-semibold" style={{ color: P.muted }}>{$k(item.amount)}/mes</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Contribution model */}
      <div className="mx-6 mb-3 bg-white rounded-[1.5rem] p-5 shadow-sm">
        <h3 className="text-xs font-semibold mb-3" style={{ color: P.text }}>Modelo de aportación</h3>
        <div className="space-y-2 mb-5">
          {([
            { id: "equal" as Model,       label: "Por partes iguales",     sub: "50 / 50" },
            { id: "proportional" as Model,label: "Proporcional al ingreso", sub: `${Math.round(D_INC/T_INC*100)}% / ${Math.round(C_INC/T_INC*100)}%` },
            { id: "capacity" as Model,    label: "Capacidad de aportación",sub: "Recomendado", rec: true },
          ] as const).map(opt => (
            <button key={opt.id} onClick={() => setModel(opt.id)}
              className="w-full flex items-center justify-between p-3 rounded-2xl border-2 text-left transition-all"
              style={{ borderColor: model === opt.id ? P.brnDk : "transparent", backgroundColor: model === opt.id ? P.sagePl : P.sub }}>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                  style={{ borderColor: model === opt.id ? P.brnDk : P.brn }}>
                  {model === opt.id && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: P.brnDk }} />}
                </div>
                <div>
                  <p className="text-xs font-semibold" style={{ color: P.text }}>{opt.label}</p>
                  <p className="text-[9px]" style={{ color: P.muted }}>{opt.sub}</p>
                </div>
              </div>
              {"rec" in opt && opt.rec && (
                <span className="text-[9px] font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: P.brnDk, color: "#fff" }}>✦ IDEAL</span>
              )}
            </button>
          ))}
        </div>
        <h3 className="text-[9px] font-semibold uppercase tracking-wider mb-3" style={{ color: P.muted }}>Aportación mensual · {$k(TOT_B)}/mes</h3>
        {[{ name: "Diana", share: shares.d, color: P.sage }, { name: "Carlos", share: shares.c, color: "#5A9E90" }].map(m => (
          <div key={m.name} className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium" style={{ color: P.text }}>{m.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: P.text }}>{$k(Math.round(m.share/100*TOT_B))}</span>
                <span className="text-[9px] w-7 text-right" style={{ color: P.muted }}>{m.share}%</span>
              </div>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: P.sub }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${m.share}%`, backgroundColor: m.color }} />
            </div>
          </div>
        ))}
        {model === "capacity" && (
          <div className="mt-3 rounded-2xl p-3 border" style={{ backgroundColor: "#E8F4EF", borderColor: `${P.sageLt}60` }}>
            <p className="text-[10px] font-semibold mb-1" style={{ color: P.sageDk }}>¿Por qué es más justo?</p>
            <p className="text-[10px] leading-relaxed" style={{ color: P.text }}>Calcula cuánto puede aportar cada persona <em>después</em> de cubrir sus compromisos personales fijos.</p>
          </div>
        )}
      </div>
    </div>
  );
}
