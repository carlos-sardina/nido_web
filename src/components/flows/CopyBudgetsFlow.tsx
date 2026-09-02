"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CategoryPicker } from "@/components/flows/CategoryPicker";
import { Button } from "@/components/nido/Button";
import { ChoiceCard } from "@/components/nido/ChoiceCard";
import { Field, FieldError, MoneyField } from "@/components/nido/Field";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
import { Text } from "@/components/nido/Typography";
import {
  canCopyPreviousMonthBudgets,
  createBudgetsFromCopyDrafts,
  loadPreviousMonthCopyDrafts,
} from "@/lib/nido/budgets";
import {
  amountToBudgetInput,
  budgetAmountMessage,
  budgetCopyDraftKey,
  parseBudgetAmountInput,
  type HouseholdCategory,
} from "@/lib/nido/financial";
import type { HouseholdMemberView } from "@/lib/nido/types";
import { P } from "@/lib/palette";

type DraftRow = {
  id: string;
  categoryId: string;
  name: string;
  icon: string;
  amount: string;
  personal: boolean;
  archived: boolean;
};

export function CopyBudgetsFlow({
  householdId,
  members,
  onClose,
  onDone,
}: {
  householdId: string;
  members: HouseholdMemberView[];
  onClose: () => void;
  onDone: () => void;
}) {
  const ids = useId();
  const submittingRef = useRef(false);
  const addedCountRef = useRef(0);
  const [mode, setMode] = useState<"list" | "add">("list");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [previousLabel, setPreviousLabel] = useState("el mes pasado");
  const [currentLabel, setCurrentLabel] = useState("este mes");
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [categories, setCategories] = useState<HouseholdCategory[]>([]);
  const [amountErrors, setAmountErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [addPersonal, setAddPersonal] = useState(false);
  const [addCategoryId, setAddCategoryId] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addErrors, setAddErrors] = useState<{ category?: string; amount?: string }>({});

  const loadDrafts = async () => {
    setLoading(true);
    setLoadError(null);
    const result = await loadPreviousMonthCopyDrafts({
      householdId,
      activeMemberIds: members.map((member) => member.userId),
    });
    if (result.ok === false) {
      setLoadError(result.error.message);
      setDrafts([]);
      setCategories([]);
      setLoading(false);
      return;
    }
    setPreviousLabel(result.data.previousRange.label);
    setCurrentLabel(result.data.currentRange.label);
    setCategories(result.data.categories);
    setDrafts(
      result.data.drafts.map((draft) => ({
        id: draft.id,
        categoryId: draft.categoryId,
        name: draft.name,
        icon: draft.icon,
        amount: amountToBudgetInput(draft.amount),
        personal: draft.personal,
        archived: false,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    void loadDrafts();
  }, [householdId]);

  const activeDrafts = drafts.filter((draft) => !draft.archived);

  const updateDraftAmount = (id: string, value: string) => {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, amount: value } : draft)),
    );
    setAmountErrors((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const toggleArchived = (id: string) => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === id ? { ...draft, archived: !draft.archived } : draft,
      ),
    );
    setFormError(null);
  };

  const openAdd = () => {
    if (submitting) return;
    setAddPersonal(false);
    setAddCategoryId("");
    setAddAmount("");
    setAddErrors({});
    setFormError(null);
    setMode("add");
  };

  const handleAdd = () => {
    const nextErrors: { category?: string; amount?: string } = {};
    if (!addCategoryId) nextErrors.category = "Elige una categoría.";
    const amountMessage = budgetAmountMessage(addAmount);
    if (amountMessage) nextErrors.amount = amountMessage;
    if (Object.keys(nextErrors).length > 0) {
      setAddErrors(nextErrors);
      return;
    }

    const parsedAmount = parseBudgetAmountInput(addAmount);
    if (parsedAmount == null) {
      setAddErrors({ amount: "Ingresa un monto válido." });
      return;
    }

    const key = budgetCopyDraftKey({ categoryId: addCategoryId, personal: addPersonal });
    if (drafts.some((draft) => budgetCopyDraftKey(draft) === key)) {
      setAddErrors({
        category: "Ya tienes este presupuesto en la lista. Restáuralo si lo archivaste.",
      });
      return;
    }

    const category = categories.find((row) => row.id === addCategoryId);
    addedCountRef.current += 1;
    setDrafts((current) => [
      ...current,
      {
        id: `added-${addedCountRef.current}`,
        categoryId: addCategoryId,
        name: category?.name.trim() || "Categoría",
        icon: category?.icon?.trim() || "📌",
        amount: amountToBudgetInput(parsedAmount),
        personal: addPersonal,
        archived: false,
      },
    ]);
    setMode("list");
  };

  const handleConfirm = async () => {
    if (!canCopyPreviousMonthBudgets(submitting) || submittingRef.current) return;

    const nextAmountErrors: Record<string, string> = {};
    const ready = [];
    for (const draft of activeDrafts) {
      const message = budgetAmountMessage(draft.amount);
      if (message) {
        nextAmountErrors[draft.id] = message;
        continue;
      }
      const parsed = parseBudgetAmountInput(draft.amount);
      if (parsed == null) {
        nextAmountErrors[draft.id] = "Ingresa un monto válido.";
        continue;
      }
      ready.push({
        id: draft.id,
        categoryId: draft.categoryId,
        name: draft.name,
        icon: draft.icon,
        amount: parsed,
        personal: draft.personal,
      });
    }

    if (Object.keys(nextAmountErrors).length > 0) {
      setAmountErrors(nextAmountErrors);
      setFormError("Revisa los montos antes de copiar.");
      return;
    }
    if (ready.length === 0) {
      setFormError("Agrega al menos un presupuesto para copiar.");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setFormError(null);

    const result = await createBudgetsFromCopyDrafts({
      householdId,
      activeMemberIds: members.map((member) => member.userId),
      allowedCategoryIds: categories.map((category) => category.id),
      drafts: ready,
    });

    if (result.ok === false) {
      submittingRef.current = false;
      setSubmitting(false);
      setFormError(result.error.message);
      return;
    }

    onDone();
  };

  const confirmLabel = submitting
    ? "Copiando…"
    : activeDrafts.length === 1
      ? "Copiar 1 presupuesto"
      : `Copiar ${activeDrafts.length} presupuestos`;

  return (
    <div className="absolute inset-0 z-40 overflow-hidden">
      <FlowScreen
        lockViewport
        className="h-full min-h-0"
        header={
          <BackLink
            onClick={() => {
              if (submitting) return;
              if (mode === "add") {
                setMode("list");
                return;
              }
              onClose();
            }}
            label={mode === "add" ? "Atrás" : "Cerrar"}
          />
        }
        footer={
          loading || loadError ? undefined : mode === "add" ? (
            <ScreenFooter>
              <Button onClick={handleAdd} disabled={submitting}>
                Agregar a la lista
              </Button>
            </ScreenFooter>
          ) : (
            <ScreenFooter>
              <div className="space-y-3">
                <Button variant="secondary" onClick={openAdd} disabled={submitting}>
                  Agregar presupuesto
                </Button>
                <Button
                  onClick={() => void handleConfirm()}
                  loading={submitting}
                  disabled={activeDrafts.length === 0}
                >
                  {confirmLabel}
                </Button>
              </div>
            </ScreenFooter>
          )
        }
      >
        {mode === "add" ? (
          <>
            <ScreenIntro
              className="mb-6"
              title="Agregar presupuesto"
              description="Se sumará a la copia de este mes. El gasto se calcula de tus gastos reales."
            />
            <div className="space-y-4">
              <Field>
                <p className="mb-2 text-label font-semibold text-muted-foreground">Tipo</p>
                <div className="space-y-2">
                  <ChoiceCard
                    title="Presupuesto del Nido"
                    description="Visible para los miembros de tu Nido."
                    selected={!addPersonal}
                    disabled={submitting}
                    onClick={() => {
                      setAddPersonal(false);
                      setAddErrors((current) => ({ ...current, category: undefined }));
                    }}
                  />
                  <ChoiceCard
                    title="Presupuesto personal"
                    description="Es tuyo. La visibilidad sigue tu preferencia de Perfil."
                    selected={addPersonal}
                    disabled={submitting}
                    onClick={() => {
                      setAddPersonal(true);
                      setAddErrors((current) => ({ ...current, category: undefined }));
                    }}
                  />
                </div>
              </Field>
              <Field>
                <MoneyField
                  id={`${ids}-add-amount`}
                  label="Límite"
                  value={addAmount}
                  onChange={(value) => {
                    setAddAmount(value);
                    setAddErrors((current) => ({ ...current, amount: undefined }));
                  }}
                  placeholder="0.00"
                  invalid={Boolean(addErrors.amount)}
                  disabled={submitting}
                  describedBy={addErrors.amount ? `${ids}-add-amount-error` : undefined}
                />
                <FieldError id={`${ids}-add-amount-error`}>{addErrors.amount}</FieldError>
              </Field>
              <Field>
                <p id={`${ids}-add-category`} className="mb-2 text-label font-semibold text-muted-foreground">
                  Categoría
                </p>
                <CategoryPicker
                  householdId={householdId}
                  type="expense"
                  categories={categories}
                  selectedId={addCategoryId}
                  loading={false}
                  disabled={submitting}
                  labelledBy={`${ids}-add-category`}
                  fallbackIcon="📌"
                  onSelect={(id) => {
                    setAddCategoryId(id);
                    setAddErrors((current) => ({ ...current, category: undefined }));
                  }}
                  onCategoriesChange={setCategories}
                />
                <FieldError id={`${ids}-add-category-error`}>{addErrors.category}</FieldError>
              </Field>
            </div>
          </>
        ) : (
          <>
            <ScreenIntro
              className="mb-6"
              title="Copiar del mes pasado"
              description={`Revisa los límites de ${previousLabel}. Archiva los que no quieras, cambia los montos o agrega otro antes de copiarlos a ${currentLabel}. El mes pasado no cambia.`}
            />

            {loading ? (
              <Text size="caption" tone="muted">
                Cargando presupuestos…
              </Text>
            ) : loadError ? (
              <div className="space-y-4">
                <Text size="body-sm" tone="danger">
                  {loadError}
                </Text>
                <Button variant="secondary" onClick={() => void loadDrafts()}>
                  Reintentar
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {formError ? <FieldError id={`${ids}-form-error`}>{formError}</FieldError> : null}
                {drafts.length === 0 ? (
                  <Text size="caption" tone="muted" className="leading-relaxed">
                    No hay presupuestos de {previousLabel} para copiar. Agrega los que quieras para{" "}
                    {currentLabel}.
                  </Text>
                ) : (
                  drafts.map((draft) => (
                    <DraftCard
                      key={draft.id}
                      draft={draft}
                      amountId={`${ids}-${draft.id}-amount`}
                      amountError={amountErrors[draft.id]}
                      disabled={submitting}
                      onAmountChange={(value) => updateDraftAmount(draft.id, value)}
                      onToggleArchive={() => toggleArchived(draft.id)}
                    />
                  ))
                )}
              </div>
            )}
          </>
        )}
      </FlowScreen>
    </div>
  );
}

function DraftCard({
  draft,
  amountId,
  amountError,
  disabled,
  onAmountChange,
  onToggleArchive,
}: {
  draft: DraftRow;
  amountId: string;
  amountError?: string;
  disabled: boolean;
  onAmountChange: (value: string) => void;
  onToggleArchive: () => void;
}) {
  return (
    <div
      className="rounded-2xl p-4 shadow-sm"
      style={{
        backgroundColor: P.card,
        opacity: draft.archived ? 0.62 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
          style={{ backgroundColor: P.sub }}
        >
          {draft.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold truncate" style={{ color: P.text }}>
              {draft.name}
            </p>
            <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: P.muted }}>
              {draft.archived ? "Archivado" : draft.personal ? "Personal" : "Nido"}
            </span>
          </div>
          {draft.archived ? (
            <p className="text-[11px] mt-1" style={{ color: P.muted }}>
              No se copiará a este mes.
            </p>
          ) : (
            <div className="mt-3">
              <MoneyField
                id={amountId}
                label="Límite"
                value={draft.amount}
                onChange={onAmountChange}
                placeholder="0.00"
                invalid={Boolean(amountError)}
                disabled={disabled}
                describedBy={amountError ? `${amountId}-error` : undefined}
              />
              <FieldError id={`${amountId}-error`} className="mt-1">
                {amountError}
              </FieldError>
            </div>
          )}
          <button
            type="button"
            onClick={onToggleArchive}
            disabled={disabled}
            className="mt-3 text-[11px] font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded disabled:opacity-50"
            style={{ color: P.muted }}
          >
            {draft.archived ? "Restaurar" : "Archivar"}
          </button>
        </div>
      </div>
    </div>
  );
}
