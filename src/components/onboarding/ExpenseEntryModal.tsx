"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { DEFAULT_QUICK, EXP_SUGG, QUICK_AMOUNTS } from "@/lib/constants";
import { P } from "@/lib/palette";

export function ExpenseEntryModal({
  exp, onConfirm, onClose,
}: {
  exp: typeof EXP_SUGG[0];
  onConfirm: (amount: string, type: "personal" | "shared") => void;
  onClose: () => void;
}) {
  const [digits, setDigits] = useState(exp.amount || "");
  const [type, setType]     = useState<"personal" | "shared">(exp.type);

  const quickAmounts = QUICK_AMOUNTS[exp.name] ?? DEFAULT_QUICK;

  const numVal  = parseInt(digits) || 0;
  const display = numVal > 0 ? numVal.toLocaleString("es-MX") : "0";

  const tap = (k: string) => {
    if (k === "⌫") { setDigits(d => d.slice(0, -1)); return; }
    if (digits.length >= 7) return;
    setDigits(d => (d === "0" ? k : d + k));
  };

  const canConfirm = numVal > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain" style={{ backgroundColor: "#FFFFFF" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-2 flex-shrink-0">
        <div className="w-9 h-9" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-2xl">{exp.icon}</span>
          <p className="text-xs font-semibold" style={{ color: P.muted }}>{exp.name}</p>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center border-2" style={{ backgroundColor: "#FFFFFF", borderColor: P.brnDk }}>
          <X size={16} style={{ color: P.brnDk }} />
        </button>
      </div>

      {/* Amount */}
      <div className="flex flex-col items-center px-6 pt-4 pb-2 flex-shrink-0">
        <p className="text-6xl font-bold mb-5" style={{ fontFamily: "Fraunces, serif", color: P.text }}>
          ${display}
        </p>

        {/* Type toggle */}
        <div className="flex gap-2 mb-5">
          {([{ val: "personal" as const, label: "Personal", emoji: "👤" }, { val: "shared" as const, label: "Compartido", emoji: "🏠" }]).map(t => (
            <button key={t.val} onClick={() => setType(t.val)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold border-2 transition-all"
              style={{ backgroundColor: "#FFFFFF", borderColor: type === t.val ? P.brnDk : "rgba(47,42,40,0.15)", color: type === t.val ? P.brnDk : P.muted }}>
              <span>{t.emoji}</span>{t.label}
            </button>
          ))}
        </div>

        {/* Quick amounts */}
        <div className="flex gap-2 w-full mb-5">
          {quickAmounts.map(v => {
            const s = String(v);
            const label = v >= 1000 ? `$${v / 1000}k` : `$${v}`;
            return (
              <button key={v} onClick={() => setDigits(s)}
                className="flex-1 py-2.5 rounded-2xl text-xs font-bold border-2 transition-all"
                style={{ borderColor: digits === s ? P.brnDk : "rgba(47,42,40,0.15)", backgroundColor: "#FFFFFF", color: P.text }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Numpad */}
      <div className="px-6 flex-shrink-0">
        <div className="grid grid-cols-3 gap-2">
          {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => (
            <button key={i} onClick={() => k && tap(k)} disabled={!k}
              className="h-14 rounded-2xl flex items-center justify-center text-xl font-semibold transition-all active:scale-95"
              style={{
                backgroundColor: k === "⌫" ? P.warnBg : k === "" ? "transparent" : P.sub,
                color: k === "⌫" ? P.warn : P.text,
                cursor: k ? "pointer" : "default",
              }}>
              {k === "⌫" ? "⌫" : k}
            </button>
          ))}
        </div>
      </div>

      {/* Confirm */}
      <div className="px-6 pb-8 pt-4 flex-shrink-0">
        <button onClick={() => canConfirm && onConfirm(String(numVal), type)}
          className="w-full py-4 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98]"
          style={{ backgroundColor: canConfirm ? P.brnDk : P.sub, color: canConfirm ? "#fff" : P.muted }}>
          Agregar gasto
        </button>
      </div>
    </div>
  );
}
