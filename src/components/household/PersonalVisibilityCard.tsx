"use client";

import { useRef, useState } from "react";
import { ChoiceCard } from "@/components/nido/ChoiceCard";
import { Text } from "@/components/nido/Typography";
import type { PersonalVisibility } from "@/lib/nido/personal-visibility";
import { canSubmitPersonalVisibility, updatePersonalVisibility } from "@/lib/nido/profile";

const OPTIONS: Array<{
  value: PersonalVisibility;
  title: string;
  description: string;
}> = [
  {
    value: "nido",
    title: "Visible al Nido",
    description: "Los miembros de tu Nido pueden ver tus gastos, presupuestos y ahorros personales.",
  },
  {
    value: "private",
    title: "Solo yo",
    description: "Solo tú puedes ver tus datos personales.",
  },
];

export function PersonalVisibilityCard({
  personalVisibility,
  onSaved,
}: {
  personalVisibility: PersonalVisibility;
  onSaved: (visibility: PersonalVisibility) => void;
}) {
  const [draft, setDraft] = useState<PersonalVisibility>(personalVisibility);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const savingRef = useRef(false);

  const save = async (next: PersonalVisibility) => {
    if (!canSubmitPersonalVisibility(saving) || savingRef.current) return;
    setDraft(next);
    if (next === personalVisibility) {
      setError(null);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    setSuccess(null);
    const result = await updatePersonalVisibility(next);
    savingRef.current = false;
    setSaving(false);
    if (result.ok === false) {
      setDraft(personalVisibility);
      setError(result.error.message);
      return;
    }
    const saved = result.data.personal_visibility;
    setDraft(saved);
    onSaved(saved);
    setSuccess(
      saved === "private"
        ? "Tus datos personales ahora son solo tuyos."
        : "Tus datos personales ahora son visibles al Nido.",
    );
  };

  return (
    <div className="px-6 mb-5 space-y-3">
      <Text size="label">Visibilidad de mis datos personales</Text>
      <Text size="caption" tone="muted" className="leading-relaxed">
        Una sola preferencia para tus gastos, presupuestos y ahorros personales. Los datos compartidos del Nido no cambian.
      </Text>
      <div className="space-y-2">
        {OPTIONS.map((option) => (
          <ChoiceCard
            key={option.value}
            title={option.title}
            description={option.description}
            selected={draft === option.value}
            disabled={saving}
            className="shadow-sm"
            onClick={() => { void save(option.value); }}
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
