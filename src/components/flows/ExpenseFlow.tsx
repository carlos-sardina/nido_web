"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import {
  CATS, D_CAP, D_INC, EXP_CATS, FREQUENCIES, T_CAP, T_INC,
} from "@/lib/constants";
import { $k, pct } from "@/lib/helpers";
import { P } from "@/lib/palette";
import { FlowHeader } from "@/components/shared/FlowHeader";
import { PBtn } from "@/components/shared/PBtn";

export function ExpenseFlow({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(1);
  const [shared, setShared]   = useState<boolean | null>(null);
  const [cat, setCat]         = useState("");
  const [amount, setAmount]   = useState("4280");
  const [desc, setDesc]       = useState("Super Walmart");
  const [freq, setFreq]       = useState("Único");
  const [paidBy, setPaidBy]   = useState<"diana"|"carlos"|"both">("diana");
  const [split, setSplit]     = useState<"capacity"|"income"|"equal"|"custom">("capacity");

  const totalSteps = shared === false ? 4 : 5;
  const back = () => step > 1 ? setStep(s => s - 1) : onClose();
  const next = () => {
    if (step === 1 && shared === false) setStep(3); // skip category for personal
    else setStep(s => s + 1);
  };
  const save = () => onDone();

  const dianaPct = split === "equal" ? 50 : split === "income" ? Math.round(D_INC/T_INC*100) : Math.round(D_CAP/T_CAP*100);
  const carlosPct = 100 - dianaPct;
  const amt = parseFloat(amount) || 0;
  const dianaAmt = Math.round(amt * dianaPct / 100);
  const carlosAmt = amt - dianaAmt;

  const budgetCat = CATS.find(c => c.name.toLowerCase().includes((cat || "supermercado").toLowerCase().slice(0,5))) || CATS[2];
  const newSpent  = budgetCat.spent + amt;
  const over      = newSpent > budgetCat.budget;

  return (
    <div className="absolute inset-0 z-30 flex flex-col" style={{ backgroundColor: P.bgL }}>
      <FlowHeader step={step} total={totalSteps} onBack={back} onClose={onClose} />
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden px-5 pb-8">

        {/* STEP 1: Shared vs Personal */}
        {step === 1 && (
          <>
            <h2 className="text-xl font-bold mb-1 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Este gasto es…?</h2>
            <p className="text-xs mb-5" style={{ color: P.muted }}>Elige cómo se registrará en el Nido.</p>
            <div className="grid grid-cols-2 gap-3 mb-8">
              {[
                { val: true,  emoji: "🏠", label: "Compartido",  sub: "Todos participan"         },
                { val: false, emoji: "👤", label: "Personal",    sub: "Solo afecta mis finanzas"  },
              ].map(o => (
                <button key={String(o.val)} onClick={() => setShared(o.val)}
                  className="flex flex-col items-center gap-2 py-7 rounded-3xl border-2 transition-all"
                  style={{ borderColor: shared === o.val ? P.brnDk : "transparent", backgroundColor: shared === o.val ? P.sagePl : P.sub }}>
                  <span className="text-4xl">{o.emoji}</span>
                  <p className="text-sm font-bold" style={{ color: P.text }}>{o.label}</p>
                  <p className="text-[10px] text-center px-3 leading-relaxed" style={{ color: P.muted }}>{o.sub}</p>
                </button>
              ))}
            </div>
            <PBtn label="Continuar" onClick={next} disabled={shared === null} />
          </>
        )}

        {/* STEP 2: Category (shared only) */}
        {step === 2 && (
          <>
            <h2 className="text-xl font-bold mb-1 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿A qué categoría pertenece?</h2>
            <p className="text-xs mb-5" style={{ color: P.muted }}>La categoría más usada aparece primero.</p>
            <div className="grid grid-cols-4 gap-2 mb-6">
              {EXP_CATS.map(c => (
                <button key={c.name} onClick={() => setCat(c.name)}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all"
                  style={{ borderColor: cat === c.name ? P.brnDk : "transparent", backgroundColor: cat === c.name ? P.sagePl : P.sub }}>
                  <span className="text-xl">{c.icon}</span>
                  <span className="text-[9px] font-medium text-center leading-tight" style={{ color: P.text }}>{c.name}</span>
                </button>
              ))}
            </div>
            <PBtn label="Continuar" onClick={next} disabled={!cat} />
          </>
        )}

        {/* STEP 3: Amount & details */}
        {step === 3 && (
          <>
            <h2 className="text-xl font-bold mb-4 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Registrar gasto</h2>
            {/* Amount */}
            <div className="rounded-3xl p-5 mb-3 shadow-sm text-center" style={{ backgroundColor: P.card }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>Monto</p>
              <div className="flex items-center justify-center gap-1">
                <span className="text-3xl font-bold" style={{ color: P.muted, fontFamily: "Fraunces, serif" }}>$</span>
                <input
                  className="text-4xl font-bold bg-transparent outline-none text-center w-48"
                  style={{ fontFamily: "Fraunces, serif", color: P.text }}
                  type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
                />
              </div>
            </div>
            {/* Description */}
            <div className="rounded-2xl px-4 py-3 mb-3 shadow-sm" style={{ backgroundColor: P.card }}>
              <p className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color: P.muted }}>Descripción</p>
              <input className="w-full text-sm bg-transparent outline-none font-medium"
                style={{ color: P.text }} placeholder="¿En qué?" value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
            {/* Frequency */}
            <div className="rounded-2xl px-4 py-3 mb-3 shadow-sm" style={{ backgroundColor: P.card }}>
              <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>Frecuencia</p>
              <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-0.5">
                {FREQUENCIES.map(f => (
                  <button key={f} onClick={() => setFreq(f)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-semibold transition-all"
                    style={{ backgroundColor: freq === f ? P.brnDk : P.sub, color: freq === f ? "#fff" : P.text }}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {/* Who paid */}
            {shared && (
              <div className="rounded-2xl px-4 py-3 mb-3 shadow-sm" style={{ backgroundColor: P.card }}>
                <p className="text-[9px] font-semibold uppercase tracking-widest mb-3" style={{ color: P.muted }}>¿Quién pagó?</p>
                <div className="flex gap-2">
                  {([{ id: "diana", label: "Diana", color: P.sage }, { id: "carlos", label: "Carlos", color: "#5A9E90" }, { id: "both", label: "Ambos", color: P.brn }] as const).map(m => (
                    <button key={m.id} onClick={() => setPaidBy(m.id)}
                      className="flex-1 flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all"
                      style={{ borderColor: paidBy === m.id ? m.color : "transparent", backgroundColor: paidBy === m.id ? `${m.color}15` : P.sub }}>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: m.color }}>
                        {m.label[0]}
                      </div>
                      <span className="text-[10px] font-semibold" style={{ color: P.text }}>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Receipt */}
            <button className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 mb-6 shadow-sm" style={{ backgroundColor: P.card }}>
              <Camera size={16} style={{ color: P.muted }} />
              <span className="text-xs" style={{ color: P.muted }}>Adjuntar comprobante <span style={{ color: P.brn }}>(opcional)</span></span>
            </button>
            <PBtn label="Continuar" onClick={next} disabled={!amount} />
          </>
        )}

        {/* STEP 4: Split method (shared only) */}
        {step === 4 && shared && (
          <>
            <h2 className="text-xl font-bold mb-1 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Cómo repartir este gasto?</h2>
            <p className="text-xs mb-5" style={{ color: P.muted }}>Nido sugiere el método configurado para tu Nido.</p>
            <div className="space-y-2 mb-6">
              {([
                { id: "capacity" as const, label: "Según capacidad de aportación", sub: `Diana ${Math.round(D_CAP/T_CAP*100)}% · Carlos ${100-Math.round(D_CAP/T_CAP*100)}%`, rec: true },
                { id: "income"   as const, label: "Según ingresos",                sub: `Diana ${Math.round(D_INC/T_INC*100)}% · Carlos ${100-Math.round(D_INC/T_INC*100)}%`  },
                { id: "equal"    as const, label: "50 / 50",                        sub: "Partes iguales"   },
                { id: "custom"   as const, label: "Personalizado",                  sub: "Elige porcentajes" },
              ]).map(o => (
                <button key={o.id} onClick={() => setSplit(o.id)}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all"
                  style={{ borderColor: split === o.id ? P.brnDk : "transparent", backgroundColor: split === o.id ? P.sagePl : P.sub }}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center`}
                    style={{ borderColor: split === o.id ? P.brnDk : P.brn }}>
                    {split === o.id && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: P.brnDk }} />}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold" style={{ color: P.text }}>{o.label}</p>
                    <p className="text-[9px]" style={{ color: P.muted }}>{o.sub}</p>
                  </div>
                  {"rec" in o && o.rec && (
                    <span className="text-[9px] font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: P.brnDk, color: "#fff" }}>✦</span>
                  )}
                </button>
              ))}
            </div>
            <PBtn label="Continuar" onClick={next} />
          </>
        )}

        {/* STEP 5 (or 4 for personal): Confirmation */}
        {((shared && step === 5) || (!shared && step === 4)) && (
          <>
            <h2 className="text-xl font-bold mb-4 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Confirmación</h2>
            {/* Summary card */}
            <div className="rounded-3xl p-5 mb-3 shadow-sm" style={{ backgroundColor: P.card }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-bold" style={{ color: P.text }}>{desc || "Gasto"}</p>
                  <p className="text-[10px]" style={{ color: P.muted }}>Pagó {paidBy === "diana" ? "Diana" : paidBy === "carlos" ? "Carlos" : "Ambos"}</p>
                </div>
                <p className="text-2xl font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>{$k(amt)}</p>
              </div>
              {shared && (
                <>
                  <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>Se dividirá así</p>
                  <div className="flex gap-3 mb-3">
                    {[{ name: "Diana", amt: dianaAmt, color: P.sage }, { name: "Carlos", amt: carlosAmt, color: "#5A9E90" }].map(m => (
                      <div key={m.name} className="flex-1 rounded-2xl p-3 text-center" style={{ backgroundColor: P.sub }}>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold mx-auto mb-1.5" style={{ backgroundColor: m.color }}>{m.name[0]}</div>
                        <p className="text-xs font-semibold" style={{ color: P.text }}>{m.name}</p>
                        <p className="text-sm font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>{$k(m.amt)}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {/* Budget impact */}
              <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>
                {shared ? `Presupuesto de ${cat || "Despensa"}` : "Impacto en tu capacidad"}
              </p>
              {shared ? (
                <>
                  <div className="h-2 rounded-full overflow-hidden mb-1" style={{ backgroundColor: P.sub }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct(newSpent, budgetCat.budget))}%`, backgroundColor: over ? P.danger : P.sage }} />
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span style={{ color: P.muted }}>{$k(newSpent)} de {$k(budgetCat.budget)}</span>
                    {over && <span className="font-semibold" style={{ color: P.warn }}>⚠️ +{$k(newSpent - budgetCat.budget)} sobre plan</span>}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl p-3" style={{ backgroundColor: P.sub }}>
                  <p className="text-xs font-semibold" style={{ color: P.text }}>Tu nueva capacidad de aportación</p>
                  <p className="text-xl font-bold" style={{ fontFamily: "Fraunces, serif", color: P.sage }}>{$k(D_CAP - amt)}</p>
                  <p className="text-[10px]" style={{ color: P.muted }}>−{$k(amt)} respecto a este mes</p>
                </div>
              )}
            </div>
            <PBtn label="Guardar gasto" onClick={save} />
          </>
        )}
      </div>
    </div>
  );
}
