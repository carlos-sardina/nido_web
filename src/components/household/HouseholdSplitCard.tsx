"use client";

import { useRef, useState } from "react";
import { ChoiceCard } from "@/components/nido/ChoiceCard";
import { Text } from "@/components/nido/Typography";
import { canSubmitHouseholdSplitMethod, updateHouseholdSplitMethod } from "@/lib/nido/household";
import type { HouseholdSplitMethod } from "@/lib/nido/split-method";
import type { Household } from "@/lib/nido/types";

const OPTIONS: Array<{ method: HouseholdSplitMethod; title: string; description: string }> = [
  {
    method: "equal",
    title: "Por partes iguales",
    description: "Los gastos compartidos nuevos se dividen igual entre quienes participan.",
  },
  {
    method: "proportional",
    title: "Proporcional al ingreso",
    description: "Los gastos compartidos nuevos se dividen según los ingresos confirmados de este mes.",
  },
];

export function HouseholdSplitCard({
  household,
  onSaved,
}: {
  household: Household;
  onSaved: (household: Household) => void;
}) {
  const [draft, setDraft] = useState<HouseholdSplitMethod>(household.default_split_method);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const savingRef = useRef(false);

  const save = async (method: HouseholdSplitMethod) => {
    if (!canSubmitHouseholdSplitMethod(saving) || savingRef.current) return;
    setDraft(method);
    if (method === household.default_split_method) {
      setError(null);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    setSuccess(null);
    const result = await updateHouseholdSplitMethod(method);
    savingRef.current = false;
    setSaving(false);
    if (result.ok === false) {
      setError(result.error.message);
      return;
    }
    onSaved(result.data);
    setDraft(result.data.default_split_method);
    setSuccess(
      result.data.default_split_method === "proportional"
        ? "Los gastos compartidos nuevos se dividirán según el ingreso."
        : "Los gastos compartidos nuevos se dividirán por partes iguales.",
    );
  };

  return (
    <div className="px-6 mb-5 space-y-3">
      <Text size="label">Método de división</Text>
      <Text size="caption" tone="muted" className="leading-relaxed">
        Esta preferencia es del Nido. Solo afecta a los gastos compartidos nuevos. Los personales no la usan.
      </Text>
      <div className="space-y-2">
        {OPTIONS.map((option) => (
          <ChoiceCard
            key={option.method}
            title={option.title}
            description={option.description}
            selected={draft === option.method}
            disabled={saving}
            className="shadow-sm"
            onClick={() => { void save(option.method); }}
          />
        ))}
      </div>
      {success && (
        <Text size="caption" tone="brand" role="status">{success}</Text>
      )}
      {error && (
        <Text size="caption" tone="danger" role="alert">{error}</Text>
      )}
    </div>
  );
}
