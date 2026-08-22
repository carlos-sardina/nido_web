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
import {
  amountToRecurrenceInput,
  parseRecurrenceAmountInput,
  recurrenceAmountMessage,
  recurrenceEndDateMessage,
  recurrenceExpenseDescriptionMessage,
  recurrenceFrequencyMessage,
  recurrenceStartDateMessage,
  RECURRENCE_FREQUENCIES,
  frequencyLabel,
  todayIso,
  type ExpenseScope,
  type HouseholdCategory,
  type RecurrenceFrequency,
  type RecurringExpenseTemplate,
} from "@/lib/nido/financial";
import { fetchActiveExpenseCategories } from "@/lib/nido/queries/categories";
import { canSubmitRecurrence, createRecurringExpense, updateRecurringExpense } from "@/lib/nido/recurring-expenses";
import type { HouseholdMemberView } from "@/lib/nido/types";

type FieldErrors = {
  amount?: string;
  description?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  frequency?: string;
  scope?: string;
  participants?: string;
  form?: string;
};

export function RecurringExpenseFlow({
  householdId,
  members,
  template,
  onClose,
  onDone,
}: {
  householdId: string;
  members: HouseholdMemberView[];
  template?: RecurringExpenseTemplate | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const ids = useId();
  const submittingRef = useRef(false);
  const isEditing = Boolean(template);
  const [amount, setAmount] = useState(() =>
    template ? amountToRecurrenceInput(template.amount) : "",
  );
  const [description, setDescription] = useState(() => template?.description ?? "");
  const [categoryId, setCategoryId] = useState(() => template?.categoryId ?? "");
  const [startDate, setStartDate] = useState(() => template?.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(() => template?.endDate ?? "");
  const [frequency, setFrequency] = useState<RecurrenceFrequency | null>(
    () => template?.frequency ?? "monthly",
  );
  const [scope, setScope] = useState<ExpenseScope | null>(() => template?.scope ?? null);
  const [participantIds, setParticipantIds] = useState<string[]>(() =>
    template?.scope === "shared"
      ? template.splits.map((split) => split.memberId)
      : members.map((member) => member.userId),
  );
  const [categories, setCategories] = useState<HouseholdCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const canShare = members.length >= 2;

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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmitRecurrence(submitting) || submittingRef.current) return;

    const nextErrors: FieldErrors = {};
    const amountMessage = recurrenceAmountMessage(amount);
    if (amountMessage) nextErrors.amount = amountMessage;
    const descriptionMessage = recurrenceExpenseDescriptionMessage(description);
    if (descriptionMessage) nextErrors.description = descriptionMessage;
    if (!categoryId) nextErrors.category = "Elige una categoría.";
    const startMessage = recurrenceStartDateMessage(startDate);
    if (startMessage) nextErrors.startDate = startMessage;
    const endMessage = recurrenceEndDateMessage(endDate, startDate);
    if (endMessage) nextErrors.endDate = endMessage;
    const frequencyMessage = recurrenceFrequencyMessage(frequency);
    if (frequencyMessage) nextErrors.frequency = frequencyMessage;
    if (scope == null) nextErrors.scope = "Elige si el gasto es personal o compartido.";
    if (scope === "shared" && participantIds.length < 2) {
      nextErrors.participants = "Para un gasto compartido elige al menos dos miembros.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const parsedAmount = parseRecurrenceAmountInput(amount);
    if (parsedAmount == null || scope == null || frequency == null) {
      setErrors({ amount: "Ingresa un monto válido." });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});

    const request = {
      householdId,
      categoryId,
      amount: parsedAmount,
      description,
      startDate,
      frequency,
      endDate: endDate.trim() || null,
      scope,
      participantIds,
      activeMemberIds: members.map((member) => member.userId),
      allowedCategoryIds: categories.map((category) => category.id),
    };
    const result = template
      ? await updateRecurringExpense({ ...request, recurringId: template.id })
      : await createRecurringExpense(request);

    if (result.ok === false) {
      submittingRef.current = false;
      setSubmitting(false);
      setErrors({ form: result.error.message });
      return;
    }

    onDone();
  };

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
              {submitting ? "Guardando…" : isEditing ? "Guardar cambios" : "Guardar plantilla"}
            </Button>
          </ScreenFooter>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0">
            <BackLink onClick={onClose} label="Cerrar" />
            <ScreenIntro
              className="mb-6"
              title={isEditing ? "Editar gasto recurrente" : "Nuevo gasto recurrente"}
              description="Esto es una plantilla. No cuenta como gasto hasta que registres el periodo."
            />
          </div>

          <form
            id={`${ids}-form`}
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-6 space-y-4"
            onSubmit={handleSubmit}
            noValidate
          >
            {errors.form ? <FieldError id={`${ids}-form-error`}>{errors.form}</FieldError> : null}

            <Field>
              <MoneyField
                id={`${ids}-amount`}
                label="Monto"
                value={amount}
                onChange={(value) => {
                  setAmount(value);
                  setErrors((current) => ({ ...current, amount: undefined }));
                }}
                placeholder="0.00"
                invalid={Boolean(errors.amount)}
                disabled={submitting}
                describedBy={errors.amount ? `${ids}-amount-error` : undefined}
              />
              <FieldError id={`${ids}-amount-error`}>{errors.amount}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor={`${ids}-description`}>Descripción</FieldLabel>
              <TextInput
                id={`${ids}-description`}
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setErrors((current) => ({ ...current, description: undefined }));
                }}
                placeholder="Renta, internet, suscripción…"
                maxLength={80}
                invalid={Boolean(errors.description)}
                disabled={submitting}
              />
              <FieldError>{errors.description}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor={`${ids}-start`}>Fecha de inicio</FieldLabel>
              <TextInput
                id={`${ids}-start`}
                type="date"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setErrors((current) => ({ ...current, startDate: undefined }));
                }}
                invalid={Boolean(errors.startDate)}
                disabled={submitting || isEditing}
              />
              <FieldError>{errors.startDate}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor={`${ids}-end`}>Fecha de fin (opcional)</FieldLabel>
              <TextInput
                id={`${ids}-end`}
                type="date"
                value={endDate}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  setErrors((current) => ({ ...current, endDate: undefined }));
                }}
                invalid={Boolean(errors.endDate)}
                disabled={submitting}
              />
              <FieldError>{errors.endDate}</FieldError>
            </Field>

            <Field>
              <p className="mb-2 text-label font-semibold text-muted-foreground">Frecuencia</p>
              <div className="grid grid-cols-2 gap-2">
                {RECURRENCE_FREQUENCIES.map((value) => (
                  <ChoiceCard
                    key={value}
                    title={frequencyLabel(value)}
                    selected={frequency === value}
                    disabled={submitting}
                    onClick={() => {
                      setFrequency(value);
                      setErrors((current) => ({ ...current, frequency: undefined }));
                    }}
                  />
                ))}
              </div>
              <FieldError>{errors.frequency}</FieldError>
            </Field>

            <Field>
              <p className="mb-2 text-label font-semibold text-muted-foreground">Categoría</p>
              {loadingCategories ? (
                <Text size="caption" tone="muted">Cargando categorías…</Text>
              ) : categories.length === 0 ? (
                <EmptyState
                  plain
                  title="No hay categorías disponibles."
                  description="No se pueden crear recurrencias hasta que tu Nido tenga categorías."
                />
              ) : (
                <div className="grid grid-cols-2 gap-2">
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
                          selected ? "border-primary bg-card" : "border-border bg-card",
                        )}
                      >
                        <span aria-hidden="true">{category.icon ?? "💸"}</span>
                        <Text as="span" size="label" className="min-w-0 truncate">
                          {category.name}
                        </Text>
                      </button>
                    );
                  })}
                </div>
              )}
              <FieldError>{errors.category}</FieldError>
            </Field>

            <Field>
              <p className="mb-2 text-label font-semibold text-muted-foreground">¿Este gasto es…?</p>
              <div className="space-y-2">
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
              <FieldError>{errors.scope}</FieldError>
            </Field>

            {scope === "shared" && canShare ? (
              <Field>
                <p className="mb-2 text-label font-semibold text-muted-foreground">Quiénes participan</p>
                <div className="space-y-2">
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
                          setParticipantIds((current) =>
                            current.includes(member.userId)
                              ? current.filter((id) => id !== member.userId)
                              : [...current, member.userId],
                          );
                          setErrors((current) => ({ ...current, participants: undefined }));
                        }}
                      />
                    );
                  })}
                </div>
                <FieldError>{errors.participants}</FieldError>
              </Field>
            ) : null}
          </form>
        </div>
      </FlowScreen>
    </div>
  );
}
