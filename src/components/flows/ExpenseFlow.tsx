"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { cn } from "@/app/components/ui/utils";
import { Button } from "@/components/nido/Button";
import { ChoiceCard } from "@/components/nido/ChoiceCard";
import { EmptyState } from "@/components/nido/EmptyState";
import {
  Field,
  FieldError,
  FieldLabel,
  MoneyField,
  TextInput,
} from "@/components/nido/Field";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
import { Text } from "@/components/nido/Typography";
import { canSubmitExpense, createExpense } from "@/lib/nido/expenses";
import {
  expenseAmountMessage,
  expenseDescriptionMessage,
  parseExpenseAmountInput,
  todayIso,
  type ExpenseScope,
  type HouseholdCategory,
} from "@/lib/nido/financial";
import { fetchActiveExpenseCategories } from "@/lib/nido/queries/categories";
import type { HouseholdMemberView } from "@/lib/nido/types";

type FieldErrors = {
  amount?: string;
  description?: string;
  category?: string;
  date?: string;
  scope?: string;
  participants?: string;
  form?: string;
};

export function ExpenseFlow({
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
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => todayIso());
  const [scope, setScope] = useState<ExpenseScope | null>(null);
  const [participantIds, setParticipantIds] = useState<string[]>(() =>
    members.map((member) => member.userId),
  );
  const [categories, setCategories] = useState<HouseholdCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const canShare = members.length >= 2;
  const amountId = `${ids}-amount`;
  const descriptionId = `${ids}-description`;
  const dateId = `${ids}-date`;
  const categoryLabelId = `${ids}-category`;
  const scopeLabelId = `${ids}-scope`;
  const participantsLabelId = `${ids}-participants`;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await fetchActiveExpenseCategories(householdId);
      if (cancelled) return;
      if (result.ok === false) {
        setErrors({ form: result.error.message });
        setCategories([]);
        setLoadingCategories(false);
        return;
      }
      setCategories(result.data);
      setLoadingCategories(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [householdId]);

  const toggleParticipant = (userId: string) => {
    setParticipantIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmitExpense(submitting) || submittingRef.current) return;

    const nextErrors: FieldErrors = {};
    const amountMessage = expenseAmountMessage(amount);
    if (amountMessage) nextErrors.amount = amountMessage;

    const descriptionMessage = expenseDescriptionMessage(description);
    if (descriptionMessage) nextErrors.description = descriptionMessage;

    if (!categoryId) nextErrors.category = "Elige una categoría.";
    if (!occurredAt) nextErrors.date = "La fecha no es válida.";
    if (scope == null) nextErrors.scope = "Elige si el gasto es personal o compartido.";
    if (scope === "shared" && participantIds.length < 2) {
      nextErrors.participants = "Para un gasto compartido elige al menos dos miembros.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const parsedAmount = parseExpenseAmountInput(amount);
    if (parsedAmount == null || scope == null) {
      setErrors({ amount: "Ingresa un monto válido." });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});

    const result = await createExpense({
      householdId,
      categoryId,
      amount: parsedAmount,
      description,
      occurredAt,
      scope,
      participantIds,
      activeMemberIds: members.map((member) => member.userId),
      allowedCategoryIds: categories.map((category) => category.id),
    });

    if (result.ok === false) {
      submittingRef.current = false;
      setSubmitting(false);
      setErrors({ form: result.error.message });
      return;
    }

    onDone();
  };

  const saveLabel = submitting ? "Guardando…" : "Guardar gasto";

  return (
    <div className="absolute inset-0 z-30">
      <FlowScreen
        lockViewport
        className="h-full min-h-0"
        footer={
          <ScreenFooter>
            <Button
              type="submit"
              form={`${ids}-form`}
              loading={submitting}
              disabled={loadingCategories || categories.length === 0}
            >
              {saveLabel}
            </Button>
          </ScreenFooter>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0">
            <BackLink onClick={onClose} label="Cerrar" />
            <ScreenIntro
              className="mb-6"
              title="Registrar un gasto"
              description="El gasto se guarda en tu Nido activo."
            />
          </div>

          <form
            id={`${ids}-form`}
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-6 space-y-4"
            onSubmit={handleSubmit}
            noValidate
          >
            {errors.form ? (
              <FieldError id={`${ids}-form-error`}>{errors.form}</FieldError>
            ) : null}

            <Field>
              <MoneyField
                id={amountId}
                label="Monto"
                value={amount}
                onChange={(value) => {
                  setAmount(value);
                  setErrors((current) => ({ ...current, amount: undefined }));
                }}
                placeholder="0.00"
                invalid={Boolean(errors.amount)}
                disabled={submitting}
                describedBy={errors.amount ? `${amountId}-error` : undefined}
              />
              <FieldError id={`${amountId}-error`}>{errors.amount}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor={descriptionId}>Descripción</FieldLabel>
              <TextInput
                id={descriptionId}
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setErrors((current) => ({ ...current, description: undefined }));
                }}
                placeholder="Supermercado, gasolina, renta…"
                maxLength={80}
                invalid={Boolean(errors.description)}
                disabled={submitting}
                aria-describedby={errors.description ? `${descriptionId}-error` : undefined}
              />
              <FieldError id={`${descriptionId}-error`}>{errors.description}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor={dateId}>Fecha</FieldLabel>
              <TextInput
                id={dateId}
                type="date"
                value={occurredAt}
                onChange={(event) => {
                  setOccurredAt(event.target.value);
                  setErrors((current) => ({ ...current, date: undefined }));
                }}
                invalid={Boolean(errors.date)}
                disabled={submitting}
                aria-describedby={errors.date ? `${dateId}-error` : undefined}
              />
              <FieldError id={`${dateId}-error`}>{errors.date}</FieldError>
            </Field>

            <Field>
              <p id={categoryLabelId} className="mb-2 text-label font-semibold text-muted-foreground">
                Categoría
              </p>
              {loadingCategories ? (
                <Text size="caption" tone="muted">
                  Cargando categorías…
                </Text>
              ) : categories.length === 0 ? (
                <EmptyState
                  plain
                  title="No hay categorías disponibles."
                  description="No se pueden registrar gastos hasta que tu Nido tenga categorías."
                />
              ) : (
                <div
                  className="grid grid-cols-2 gap-2"
                  role="group"
                  aria-labelledby={categoryLabelId}
                >
                  {categories.map((category) => {
                    const selected = categoryId === category.id;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        aria-pressed={selected}
                        disabled={submitting}
                        onClick={() => {
                          setCategoryId(category.id);
                          setErrors((current) => ({ ...current, category: undefined }));
                        }}
                        className={cn(
                          "flex items-center gap-2 p-3 rounded-2xl border-2 text-left transition-all",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          "disabled:cursor-not-allowed disabled:opacity-70",
                          selected ? "border-primary bg-card" : "border-border bg-card",
                        )}
                      >
                        <span className="text-body flex-shrink-0" aria-hidden="true">
                          {category.icon ?? "💸"}
                        </span>
                        <Text as="span" size="label" className="min-w-0 truncate">
                          {category.name}
                        </Text>
                      </button>
                    );
                  })}
                </div>
              )}
              <FieldError id={`${ids}-category-error`}>{errors.category}</FieldError>
            </Field>

            <Field>
              <p id={scopeLabelId} className="mb-2 text-label font-semibold text-muted-foreground">
                ¿Este gasto es…?
              </p>
              <div className="space-y-2" role="group" aria-labelledby={scopeLabelId}>
                <ChoiceCard
                  icon="👤"
                  title="Personal"
                  description="Solo te corresponde a ti."
                  selected={scope === "personal"}
                  disabled={submitting}
                  onClick={() => {
                    setScope("personal");
                    setErrors((current) => ({ ...current, scope: undefined, participants: undefined }));
                  }}
                />
                <ChoiceCard
                  icon="🏠"
                  title="Compartido"
                  description={
                    canShare
                      ? "Se divide entre las personas que elijas."
                      : "Invita a otra persona para registrar gastos compartidos."
                  }
                  selected={scope === "shared"}
                  disabled={submitting || !canShare}
                  onClick={() => {
                    setScope("shared");
                    setErrors((current) => ({ ...current, scope: undefined }));
                  }}
                />
              </div>
              <FieldError id={`${ids}-scope-error`}>{errors.scope}</FieldError>
            </Field>

            {scope === "shared" && canShare ? (
              <Field>
                <p
                  id={participantsLabelId}
                  className="mb-2 text-label font-semibold text-muted-foreground"
                >
                  Quiénes participan
                </p>
                <div className="space-y-2" role="group" aria-labelledby={participantsLabelId}>
                  {members.map((member) => {
                    const selected = participantIds.includes(member.userId);
                    return (
                      <ChoiceCard
                        key={member.userId}
                        title={member.displayName}
                        description={selected ? "Participa en partes iguales" : "No participa"}
                        selected={selected}
                        disabled={submitting}
                        onClick={() => {
                          toggleParticipant(member.userId);
                          setErrors((current) => ({ ...current, participants: undefined }));
                        }}
                      />
                    );
                  })}
                </div>
                <FieldError id={`${ids}-participants-error`}>{errors.participants}</FieldError>
              </Field>
            ) : null}
          </form>
        </div>
      </FlowScreen>
    </div>
  );
}
