"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { cn } from "@/app/components/ui/utils";
import { Button } from "@/components/nido/Button";
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
import { canSubmitIncome, createIncome, updateIncome } from "@/lib/nido/incomes";
import {
  amountToIncomeInput,
  getCurrentMonthRange,
  incomeAmountMessage,
  incomeDateMessage,
  incomeDescriptionMessage,
  parseIncomeAmountInput,
  todayIso,
  selectableIncomeCategories,
  isSueldoIncomeCategory,
  withCurrentCategory,
  type HouseholdCategory,
  type IncomeRow,
} from "@/lib/nido/financial";
import { fetchActiveIncomeCategories } from "@/lib/nido/queries/categories";
import type { HouseholdMemberView } from "@/lib/nido/types";

type FieldErrors = {
  amount?: string;
  description?: string;
  category?: string;
  date?: string;
  form?: string;
};

export function IncomeFlow({
  householdId,
  members,
  income,
  onClose,
  onDone,
}: {
  householdId: string;
  members: HouseholdMemberView[];
  income?: IncomeRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const ids = useId();
  const submittingRef = useRef(false);
  const isEditing = Boolean(income);
  const [amount, setAmount] = useState(() =>
    income ? amountToIncomeInput(income.amount) : "",
  );
  const [description, setDescription] = useState(() => income?.description ?? "");
  const [categoryId, setCategoryId] = useState(() => income?.categoryId ?? "");
  const [occurredAt, setOccurredAt] = useState(() => income?.occurredAt ?? todayIso());
  const [categories, setCategories] = useState<HouseholdCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const monthRange = getCurrentMonthRange();
  const amountId = `${ids}-amount`;
  const descriptionId = `${ids}-description`;
  const dateId = `${ids}-date`;
  const categoryLabelId = `${ids}-category`;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await fetchActiveIncomeCategories(householdId);
      if (cancelled) return;
      if (result.ok === false) {
        setErrors({ form: result.error.message });
        setCategories([]);
        setLoadingCategories(false);
        return;
      }
      const current = income?.category
        ? {
            id: income.categoryId,
            householdId,
            name: income.category.name,
            icon: income.category.icon,
            type: "income" as const,
            isDefault: false,
            archivedAt: result.data.some((row) => row.id === income.categoryId)
              ? null
              : "archived",
          }
        : null;
      setCategories(withCurrentCategory(selectableIncomeCategories(result.data, householdId), current));
      setLoadingCategories(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [householdId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmitIncome(submitting) || submittingRef.current) return;

    const nextErrors: FieldErrors = {};
    const amountMessage = incomeAmountMessage(amount);
    if (amountMessage) nextErrors.amount = amountMessage;

    const descriptionMessage = incomeDescriptionMessage(description);
    if (descriptionMessage) nextErrors.description = descriptionMessage;

    if (!categoryId) nextErrors.category = "Elige una categoría.";
    const dateMessage = incomeDateMessage(occurredAt);
    if (dateMessage) nextErrors.date = dateMessage;

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const parsedAmount = parseIncomeAmountInput(amount);
    if (parsedAmount == null) {
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
      occurredAt,
      activeMemberIds: members.map((member) => member.userId),
      allowedCategoryIds: categories.map((category) => category.id),
    };
    const result = income
      ? await updateIncome({ ...request, incomeId: income.id })
      : await createIncome(request);

    if (result.ok === false) {
      submittingRef.current = false;
      setSubmitting(false);
      setErrors({ form: result.error.message });
      return;
    }

    onDone();
  };

  const saveLabel = submitting
    ? "Guardando…"
    : isEditing
      ? "Guardar cambios"
      : "Guardar ingreso";

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
              {saveLabel}
            </Button>
          </ScreenFooter>
        }
      >
        <ScreenIntro
          className="mb-6"
          title={isEditing ? "Editar ingreso" : "Registrar un ingreso"}
          description={
            isEditing
              ? income?.category && isSueldoIncomeCategory(income.category)
                ? "Si cambias un sueldo, el nuevo monto aplica a este mes y a los siguientes. Los meses anteriores no cambian."
                : "Los cambios se guardan en tu Nido activo."
              : "El sueldo se copia al mes siguiente hasta que lo elimines o cambies el monto. El extra se registra cada vez."
          }
        />

        <form
          id={`${ids}-form`}
          className="space-y-4"
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
              <FieldLabel htmlFor={descriptionId}>Descripción (opcional)</FieldLabel>
              <TextInput
                id={descriptionId}
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setErrors((current) => ({ ...current, description: undefined }));
                }}
                placeholder="Nómina, extra…"
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
                min={monthRange.start}
                max={monthRange.end}
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
                  description="No se pueden registrar ingresos hasta que tu Nido tenga categorías."
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
                          {category.icon ?? "💰"}
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
          </form>
      </FlowScreen>
    </div>
  );
}
