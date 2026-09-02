"use client";

import { useRef, useState } from "react";
import { Home, Pencil } from "lucide-react";
import { Button } from "@/components/nido/Button";
import { TextLink } from "@/components/nido/TextLink";
import { canSubmitHouseholdName, updateHouseholdName } from "@/lib/nido/household";
import type { Household } from "@/lib/nido/types";
import { validateHouseholdName } from "@/lib/onboarding/validation";
import { P } from "@/lib/palette";

type NameStatus = "idle" | "editing" | "saving" | "success" | "error";

export function HouseholdNameCard({
  household,
  onSaved,
}: {
  household: Household;
  onSaved: (household: Household) => void;
}) {
  const [status, setStatus] = useState<NameStatus>("idle");
  const [draft, setDraft] = useState(household.name);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const saving = status === "saving";
  const editing = status === "editing" || status === "saving" || status === "error";

  const startEdit = () => {
    setDraft(household.name);
    setError(null);
    setStatus("editing");
  };

  const cancelEdit = () => {
    if (saving) return;
    setError(null);
    setDraft(household.name);
    setStatus("idle");
  };

  const save = async () => {
    if (!canSubmitHouseholdName(saving) || savingRef.current) return;
    const message = validateHouseholdName(draft);
    if (message) {
      setError(message);
      setStatus("error");
      return;
    }

    savingRef.current = true;
    setStatus("saving");
    setError(null);
    const result = await updateHouseholdName(draft);
    savingRef.current = false;
    if (result.ok === false) {
      setError(result.error.message);
      setStatus("error");
      return;
    }
    onSaved(result.data);
    setDraft(result.data.name);
    setStatus("success");
  };

  return (
    <div
      className="mx-6 mb-3 rounded-[1.5rem] overflow-hidden shadow-sm"
      style={{ background: "linear-gradient(135deg, #255D4D 0%, #2F7D66 100%)" }}
    >
      <div className="relative p-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-12 right-10 h-24 w-24 rounded-full"
          style={{ backgroundColor: "rgba(169,200,166,0.18)" }}
        />

        {editing ? (
          <div className="relative space-y-3">
            <p
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              Nombre del Nido
            </p>
            <label htmlFor="household-name" className="sr-only">Nombre del Nido</label>
            <input
              id="household-name"
              type="text"
              value={draft}
              disabled={saving}
              maxLength={80}
              aria-invalid={status === "error" || undefined}
              aria-describedby={error ? "household-name-error" : undefined}
              onChange={(event) => {
                setDraft(event.target.value);
                if (status === "error") {
                  setError(null);
                  setStatus("editing");
                }
              }}
              className="w-full h-12 px-4 rounded-2xl text-sm font-medium outline-none border-2"
              style={{
                backgroundColor: P.bgL,
                color: P.text,
                borderColor: status === "error" ? P.danger : "transparent",
              }}
            />
            {error ? (
              <p
                id="household-name-error"
                className="text-[11px] font-medium px-3 py-2 rounded-xl"
                role="alert"
                style={{ backgroundColor: P.dangerBg, color: P.danger }}
              >
                {error}
              </p>
            ) : null}
            <Button onClick={() => { void save(); }} loading={saving} disabled={!canSubmitHouseholdName(saving)}>
              {saving ? "Guardando…" : "Guardar nombre"}
            </Button>
            <TextLink
              tone="muted"
              disabled={saving}
              className="w-full text-white/75 hover:text-white"
              onClick={cancelEdit}
            >
              Cancelar
            </TextLink>
          </div>
        ) : (
          <div className="relative flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              <Home size={22} strokeWidth={1.75} color="#E8F4EF" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p
                className="text-[10px] font-semibold uppercase tracking-widest mb-1"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                Tu Nido
              </p>
              <h3
                className="text-[22px] font-bold leading-tight break-words [overflow-wrap:anywhere]"
                style={{ fontFamily: "Fraunces, serif", color: "#FFFCFA" }}
              >
                {household.name}
              </h3>
              {status === "success" ? (
                <p className="text-[11px] mt-1.5 font-medium" role="status" style={{ color: P.sageLt }}>
                  Nombre actualizado.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={startEdit}
              aria-label="Editar nombre del Nido"
              className="w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              <Pencil size={14} color="#FFFCFA" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
