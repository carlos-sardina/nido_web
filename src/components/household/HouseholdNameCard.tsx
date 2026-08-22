"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/nido/Button";
import { TextLink } from "@/components/nido/TextLink";
import { Text } from "@/components/nido/Typography";
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
    <div className="mx-6 mb-3 rounded-[1.5rem] p-4 space-y-3" style={{ backgroundColor: P.card }}>
      <Text size="label">Nombre del Nido</Text>
      {editing ? (
        <>
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
              backgroundColor: P.sub,
              color: P.text,
              borderColor: status === "error" ? P.danger : P.border,
            }}
          />
          {error && (
            <Text id="household-name-error" size="caption" tone="danger" role="alert">
              {error}
            </Text>
          )}
          <Button loading={saving} disabled={!canSubmitHouseholdName(saving)} onClick={() => { void save(); }}>
            {saving ? "Guardando…" : "Guardar nombre"}
          </Button>
          <TextLink tone="muted" disabled={saving} onClick={cancelEdit}>
            Cancelar
          </TextLink>
        </>
      ) : (
        <>
          <Text size="caption" className="leading-relaxed">{household.name}</Text>
          {status === "success" && (
            <Text size="caption" tone="brand" role="status">Nombre actualizado.</Text>
          )}
          <TextLink onClick={startEdit}>Editar nombre</TextLink>
        </>
      )}
    </div>
  );
}
