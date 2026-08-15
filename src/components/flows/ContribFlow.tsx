"use client";

import { useState } from "react";
import { GOALS } from "@/lib/constants";
import { $k, pct } from "@/lib/helpers";
import { P } from "@/lib/palette";
import { FlowHeader } from "@/components/shared/FlowHeader";
import { PBtn } from "@/components/shared/PBtn";

export function ContribFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep]       = useState(1);
  const [goalIdx, setGoalIdx] = useState(-1);
  const [amount, setAmount]   = useState("");
  const [who, setWho]         = useState<"diana"|"carlos"|"both">("both");

  const goal = GOALS[goalIdx];
  const amt  = parseFloat(amount) || 0;
  const newCurrent = goal ? goal.current + amt : 0;

  return (
    <div className="absolute inset-0 z-30 flex flex-col" style={{ backgroundColor: P.bgL }}>
      <FlowHeader step={step} total={3} onBack={() => step > 1 ? setStep(s => s-1) : onClose()} onClose={onClose} />
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden px-5 pb-8">

        {step === 1 && (
          <>
            <h2 className="text-xl font-bold mb-1 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿A qué meta aportarás?</h2>
            <p className="text-xs mb-5" style={{ color: P.muted }}>Elige la meta que quieres avanzar.</p>
            <div className="space-y-2 mb-6">
              {GOALS.map((g, i) => (
                <button key={g.name} onClick={() => setGoalIdx(i)}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all"
                  style={{ borderColor: goalIdx === i ? P.brnDk : "transparent", backgroundColor: goalIdx === i ? g.bg : P.sub }}>
                  <span className="text-2xl">{g.emoji}</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold" style={{ color: P.text }}>{g.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: P.sub }}>
                        <div className="h-full rounded-full" style={{ width: `${pct(g.current, g.target)}%`, backgroundColor: g.color }} />
                      </div>
                      <span className="text-[9px]" style={{ color: P.muted }}>{pct(g.current, g.target)}%</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <PBtn label="Continuar" onClick={() => setStep(2)} disabled={goalIdx < 0} />
          </>
        )}

        {step === 2 && goal && (
          <>
            <h2 className="text-xl font-bold mb-4 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Cuánto aportan?</h2>
            <div className="rounded-3xl p-5 mb-3 shadow-sm text-center" style={{ backgroundColor: P.card }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>Monto</p>
              <div className="flex items-center justify-center gap-1">
                <span className="text-3xl font-bold" style={{ color: P.muted, fontFamily: "Fraunces, serif" }}>$</span>
                <input className="text-4xl font-bold bg-transparent outline-none text-center w-40"
                  style={{ fontFamily: "Fraunces, serif", color: P.text }}
                  type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="rounded-2xl px-4 py-3 mb-6 shadow-sm" style={{ backgroundColor: P.card }}>
              <p className="text-[9px] font-semibold uppercase tracking-widest mb-3" style={{ color: P.muted }}>¿Quién aporta?</p>
              <div className="flex gap-2">
                {([{ id: "diana" as const, l: "Diana", c: P.sage }, { id: "carlos" as const, l: "Carlos", c: "#5A9E90" }, { id: "both" as const, l: "Ambos", c: P.brn }]).map(m => (
                  <button key={m.id} onClick={() => setWho(m.id)}
                    className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all"
                    style={{ borderColor: who === m.id ? m.c : "transparent", backgroundColor: who === m.id ? `${m.c}15` : P.sub }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: m.c }}>{m.l[0]}</div>
                    <span className="text-[10px] font-semibold" style={{ color: P.text }}>{m.l}</span>
                  </button>
                ))}
              </div>
            </div>
            <PBtn label="Continuar" onClick={() => setStep(3)} disabled={!amount} />
          </>
        )}

        {step === 3 && goal && (
          <>
            <h2 className="text-xl font-bold mb-4 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Confirmación</h2>
            <div className="rounded-3xl p-5 mb-3 shadow-sm" style={{ backgroundColor: P.card }}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{goal.emoji}</span>
                <div className="flex-1">
                  <p className="text-sm font-bold" style={{ color: P.text }}>{goal.name}</p>
                  <p className="text-[10px]" style={{ color: P.muted }}>Aporta {who === "diana" ? "Diana" : who === "carlos" ? "Carlos" : "Diana & Carlos"}</p>
                </div>
                <p className="text-xl font-bold" style={{ fontFamily: "Fraunces, serif", color: P.brnDk }}>+{$k(amt)}</p>
              </div>
              <div className="h-2 rounded-full overflow-hidden mb-2" style={{ backgroundColor: P.sub }}>
                <div className="h-full rounded-full" style={{ width: `${pct(newCurrent, goal.target)}%`, backgroundColor: goal.color }} />
              </div>
              <div className="flex justify-between text-[10px]" style={{ color: P.muted }}>
                <span>{$k(newCurrent)} de {$k(goal.target)}</span>
                <span>{pct(newCurrent, goal.target)}%</span>
              </div>
            </div>
            <PBtn label="Guardar aportación" onClick={onClose} />
          </>
        )}
      </div>
    </div>
  );
}
