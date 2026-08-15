"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { GOAL_TYPES, SAVE_METHODS } from "@/lib/constants";
import { $k } from "@/lib/helpers";
import { P } from "@/lib/palette";
import { FlowHeader } from "@/components/shared/FlowHeader";
import { PBtn } from "@/components/shared/PBtn";

export function GoalFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep]         = useState(1);
  const [goalType, setGoalType] = useState("");
  const [goalEmoji, setGoalEmoji] = useState("✨");
  const [name, setName]         = useState("");
  const [target, setTarget]     = useState("180000");
  const [saveMethod, setSaveMethod] = useState(0);
  const [monthly, setMonthly]   = useState(8000);
  const [done, setDone]         = useState(false);

  const remaining = parseFloat(target) || 180000;
  const months    = Math.ceil(remaining / monthly);
  const estimatedDate = (() => {
    const d = new Date(); d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  })();

  const back  = () => step > 1 ? setStep(s => s-1) : onClose();
  const TOTAL = 4;

  if (done) {
    return (
      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center px-6 text-center" style={{ backgroundColor: P.bgL }}>
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¡Meta creada!</h2>
        <p className="text-sm mb-8 leading-relaxed" style={{ color: P.muted }}>
          Ahora aparece en tu dashboard.<br />Nido calculará automáticamente las aportaciones.
        </p>
        <div className="w-full rounded-3xl p-5 mb-8" style={{ backgroundColor: "#E8F4EF", border: `2px solid ${P.sageLt}` }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">{goalEmoji}</span>
            <div>
              <p className="text-sm font-bold" style={{ color: P.text }}>{name || "Nueva meta"}</p>
              <p className="text-[10px]" style={{ color: P.muted }}>Diana & Carlos · {$k(monthly)}/mes</p>
            </div>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: P.sageLt }}>
            <div className="h-full w-0 rounded-full" style={{ backgroundColor: P.sage }} />
          </div>
          <div className="flex justify-between mt-1 text-[10px]" style={{ color: P.muted }}>
            <span>$0 de {$k(remaining)}</span><span>{estimatedDate}</span>
          </div>
        </div>
        <button onClick={onClose}
          className="w-full py-4 rounded-2xl font-semibold text-sm"
          style={{ backgroundColor: P.brnDk, color: "#fff" }}>
          Ver en el dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col" style={{ backgroundColor: P.bgL }}>
      <FlowHeader step={step} total={TOTAL} onBack={back} onClose={onClose} />
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden px-5 pb-8">

        {/* STEP 1: Goal type */}
        {step === 1 && (
          <>
            <h2 className="text-xl font-bold mb-1 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Qué quieren lograr?</h2>
            <p className="text-xs mb-5" style={{ color: P.muted }}>Elige un tipo de meta para empezar.</p>
            <div className="grid grid-cols-4 gap-2 mb-6">
              {GOAL_TYPES.map(g => (
                <button key={g.name} onClick={() => { setGoalType(g.name); setGoalEmoji(g.emoji); }}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all"
                  style={{ borderColor: goalType === g.name ? P.brnDk : "transparent", backgroundColor: goalType === g.name ? P.sagePl : P.sub }}>
                  <span className="text-2xl">{g.emoji}</span>
                  <span className="text-[9px] font-medium text-center leading-tight" style={{ color: P.text }}>{g.name}</span>
                </button>
              ))}
            </div>
            <PBtn label="Continuar" onClick={() => setStep(2)} disabled={!goalType} />
          </>
        )}

        {/* STEP 2: Info */}
        {step === 2 && (
          <>
            <h2 className="text-xl font-bold mb-4 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Información</h2>
            <div className="rounded-2xl px-4 py-3 mb-3 shadow-sm" style={{ backgroundColor: P.card }}>
              <p className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color: P.muted }}>Nombre de la meta</p>
              <input className="w-full text-sm font-semibold bg-transparent outline-none"
                style={{ color: P.text }} placeholder="Viaje a Japón"
                value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="rounded-2xl px-4 py-3 mb-3 shadow-sm" style={{ backgroundColor: P.card }}>
              <p className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color: P.muted }}>Monto objetivo</p>
              <div className="flex items-center gap-1">
                <span className="text-base font-bold" style={{ color: P.muted }}>$</span>
                <input className="flex-1 text-xl font-bold bg-transparent outline-none"
                  style={{ fontFamily: "Fraunces, serif", color: P.text }} type="number"
                  value={target} onChange={e => setTarget(e.target.value)} placeholder="180,000" />
              </div>
            </div>
            <div className="rounded-2xl px-4 py-3 mb-6 shadow-sm flex items-center gap-3" style={{ backgroundColor: P.card }}>
              <Camera size={16} style={{ color: P.muted }} />
              <span className="text-xs" style={{ color: P.muted }}>Agregar foto <span style={{ color: P.brn }}>(opcional)</span></span>
            </div>
            <PBtn label="Continuar" onClick={() => setStep(3)} />
          </>
        )}

        {/* STEP 3: Save method */}
        {step === 3 && (
          <>
            <h2 className="text-xl font-bold mb-1 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Cómo quieren ahorrar?</h2>
            <p className="text-xs mb-5" style={{ color: P.muted }}>Pueden cambiarlo después.</p>
            <div className="space-y-2 mb-6">
              {SAVE_METHODS.map((m, i) => (
                <button key={i} onClick={() => setSaveMethod(i)}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all"
                  style={{ borderColor: saveMethod === i ? P.brnDk : "transparent", backgroundColor: saveMethod === i ? P.sagePl : P.sub }}>
                  <span className="text-xl w-8 text-center">{m.icon}</span>
                  <span className="text-xs font-semibold" style={{ color: P.text }}>{m.label}</span>
                  <div className="ml-auto w-4 h-4 rounded-full border-2 flex items-center justify-center"
                    style={{ borderColor: saveMethod === i ? P.brnDk : P.brn }}>
                    {saveMethod === i && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: P.brnDk }} />}
                  </div>
                </button>
              ))}
            </div>
            <PBtn label="Continuar" onClick={() => setStep(4)} />
          </>
        )}

        {/* STEP 4: Simulation */}
        {step === 4 && (
          <>
            <h2 className="text-xl font-bold mb-1 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Simulación</h2>
            <p className="text-xs mb-5" style={{ color: P.muted }}>Ajusta la aportación mensual y ve cuándo llegarán.</p>
            <div className="rounded-3xl p-5 mb-4 shadow-sm" style={{ backgroundColor: P.card }}>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <p className="text-xs font-semibold" style={{ color: P.text }}>{name || "Tu meta"}</p>
                  <p className="text-[10px]" style={{ color: P.muted }}>{goalEmoji} Meta: {$k(remaining)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px]" style={{ color: P.muted }}>Llegarán en</p>
                  <p className="text-xl font-bold" style={{ fontFamily: "Fraunces, serif", color: P.brnDk }}>{months} meses</p>
                </div>
              </div>
              {/* Slider */}
              <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>
                Aportación mensual: {$k(monthly)}
              </p>
              <input type="range" min={1000} max={20000} step={500} value={monthly}
                onChange={e => setMonthly(Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer mb-2"
                style={{ accentColor: P.brnDk }} />
              <div className="flex justify-between text-[9px]" style={{ color: P.muted }}>
                <span>$1k</span><span>$20k</span>
              </div>
            </div>
            <PBtn label="Crear esta meta" onClick={() => setDone(true)} />
          </>
        )}
      </div>
    </div>
  );
}
