"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { DEFAULT_QUICK, QUICK_AMOUNTS } from "@/lib/constants";
import { canStartExclusiveAction, parseMoneyInput, validateExpenseEntry } from "@/lib/onboarding/validation";
import { P } from "@/lib/palette";
import type { OnboardingExpense } from "@/lib/types";
import { Button } from "@/components/nido/Button";
import { FieldError } from "@/components/nido/Field";
import { SectionLabel } from "@/components/nido/ChoiceCard";
import { Text } from "@/components/nido/Typography";

export function ExpenseEntryModal({
  exp, onConfirm, onClose,
}: {
  exp: OnboardingExpense;
  onConfirm: (amount: string, type: "personal" | "shared") => void;
  onClose: () => void;
}) {
  const [digits, setDigits] = useState(exp.amount || "");
  const [type, setType]     = useState<"personal" | "shared">(exp.type);
  const [error, setError]   = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const quickAmounts = QUICK_AMOUNTS[exp.name] ?? DEFAULT_QUICK;

  const parsed = parseMoneyInput(digits);
  const numVal = parsed ?? 0;
  const display = numVal > 0 ? numVal.toLocaleString("es-MX") : "0";
  const kindLabel = exp.kind === "variable" ? "Variable" : "Recurrente";

  const tap = (k: string) => {
    if (k === "⌫") { setDigits(d => d.slice(0, -1)); return; }
    if (digits.length >= 7) return;
    setDigits(d => (d === "0" ? k : d + k));
  };

  const handleSave = () => {
    if (!canStartExclusiveAction(saving) || savingRef.current) return;
    const invalid = validateExpenseEntry({ amount: digits, type });
    if (invalid) {
      setError(invalid);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    onConfirm(String(parsed), type);
  };

  return (
    <div className="fixed left-0 top-[var(--app-offset-top,0px)] z-50 flex h-[var(--app-height,100dvh)] w-full flex-col overflow-hidden bg-white font-sans">
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col">
        <div className="relative z-10 flex shrink-0 justify-end bg-white px-6 pt-6 pb-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-11 h-11 rounded-full flex items-center justify-center border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ backgroundColor: "#FFFFFF", borderColor: P.brnDk }}
          >
            <X size={16} style={{ color: P.brnDk }} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex flex-col items-center px-6 pt-2 pb-2">
            <span className="text-h2" aria-hidden="true">{exp.icon}</span>
            <Text size="label" tone="muted">{exp.name}</Text>
            <Text size="caption" tone="muted">{kindLabel} · estimado mensual</Text>
          </div>

          <div className="flex flex-col items-center px-6 pt-4 pb-2">
            <SectionLabel>Monto mensual</SectionLabel>
            <p className="text-display font-bold mb-6 font-sans text-foreground">
              ${display}
            </p>

            <SectionLabel>¿Cómo lo consideramos?</SectionLabel>
            <div className="flex gap-2 mb-6">
              {([{ val: "personal" as const, label: "Personal", emoji: "👤" }, { val: "shared" as const, label: "Compartido", emoji: "🏠" }]).map(t => (
                <button
                  key={t.val}
                  type="button"
                  onClick={() => setType(t.val)}
                  aria-pressed={type === t.val}
                  className="flex items-center gap-1.5 px-4 h-11 rounded-full text-sm font-semibold border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderColor: type === t.val ? P.brnDk : P.sub,
                    color: type === t.val ? P.brnDk : P.muted,
                  }}
                >
                  <span aria-hidden="true">{t.emoji}</span>{t.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2 w-full mb-6">
              {quickAmounts.map(v => {
                const s = String(v);
                const label = v >= 1000 ? `$${v / 1000}k` : `$${v}`;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { setDigits(s); setError(null); }}
                    className="flex-1 h-11 rounded-2xl text-sm font-semibold border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{
                      borderColor: digits === s ? P.brnDk : P.sub,
                      backgroundColor: "#FFFFFF",
                      color: P.text,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-6">
            <div className="grid grid-cols-3 gap-2">
              {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { if (k) { tap(k); setError(null); } }}
                  disabled={!k}
                  aria-label={k === "⌫" ? "Borrar" : k || undefined}
                  className="h-14 rounded-2xl flex items-center justify-center text-h3 font-semibold transition-all active:enabled:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                  style={{
                    backgroundColor: k === "⌫" ? P.warnBg : k === "" ? "transparent" : P.sub,
                    color: k === "⌫" ? P.warn : P.text,
                  }}
                >
                  {k === "⌫" ? "⌫" : k}
                </button>
              ))}
            </div>
          </div>

          <div className="px-6 pb-8 pt-8">
            {error && (
              <FieldError className="mb-3 text-center">{error}</FieldError>
            )}
            <Button onClick={handleSave} disabled={numVal <= 0 || saving} loading={saving}>
              Guardar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
