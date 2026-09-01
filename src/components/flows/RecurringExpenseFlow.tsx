"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CategoryPicker } from "@/components/flows/CategoryPicker";
import { Button } from "@/components/nido/Button";
import { ChoiceCard } from "@/components/nido/ChoiceCard";
import {
  Field,
  FieldError,
  FieldLabel,
  MoneyField,
  TextInput,
} from "@/components/nido/Field";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
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
  withCurrentCategory,
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
      const current = template?.category
        ? {
            id: template.categoryId,
            householdId,
            name: template.category.name,
            icon: template.category.icon,
            type: "expense" as const,
            isDefault: false,
            archivedAt: result.data.some((row) => row.id === template.categoryId)
              ? null
              : "archived",
          }
        : null;
      setCategories(withCurrentCategory(result.data, current));
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
    <div className="absolute inset-0 z-30 overflow-hidden">
      <FlowScreen
        lockViewport
        className="h-full min-h-0"
        header={<BackLink onClick={onClose} label="Cerrar" />}
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
        <ScreenIntro
          className="mb-6"
          title={isEditing ? "Editar gasto recurrente" : "Nuevo gasto recurrente"}
          description="Esto es una plantilla. No cuenta como gasto hasta que registres el periodo."
        />

        <form
          id={`${ids}-form`}
          className="space-y-4"
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
              <p id={`${ids}-category`} className="mb-2 text-label font-semibold text-muted-foreground">
                Categoría
              </p>
              <CategoryPicker
                householdId={householdId}
                type="expense"
                categories={categories}
                selectedId={categoryId}
                loading={loadingCategories}
                disabled={submitting}
                labelledBy={`${ids}-category`}
                fallbackIcon="💸"
                onSelect={(id) => {
                  setCategoryId(id);
                  setErrors((current) => ({ ...current, category: undefined }));
                }}
                onCategoriesChange={setCategories}
              />
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
      </FlowScreen>
    </div>
  );
}
