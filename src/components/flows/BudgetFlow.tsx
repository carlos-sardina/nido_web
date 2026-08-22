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
import { canSubmitBudget, createBudget, updateBudget } from "@/lib/nido/budgets";
import {
  amountToBudgetInput,
  budgetAmountMessage,
  budgetDateMessage,
  budgetMonthInput,
  getCurrentMonthRange,
  parseBudgetAmountInput,
  parseBudgetMonthInput,
  type HouseholdCategory,
} from "@/lib/nido/financial";
import { fetchActiveExpenseCategories } from "@/lib/nido/queries/categories";
import type { HouseholdMemberView } from "@/lib/nido/types";

type FieldErrors = {
  amount?: string;
  category?: string;
  month?: string;
  form?: string;
};

export type BudgetFormValue = {
  id: string;
  categoryId: string;
  amount: number;
  startDate: string;
};

export function BudgetFlow({
  householdId,
  members,
  budget,
  onClose,
  onDone,
}: {
  householdId: string;
  members: HouseholdMemberView[];
  budget?: BudgetFormValue | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const ids = useId();
  const submittingRef = useRef(false);
  const isEditing = Boolean(budget);
  const [amount, setAmount] = useState(() =>
    budget ? amountToBudgetInput(budget.amount) : "",
  );
  const [categoryId, setCategoryId] = useState(() => budget?.categoryId ?? "");
  const [month, setMonth] = useState(
    () => budgetMonthInput(budget?.startDate ?? getCurrentMonthRange().start),
  );
  const [categories, setCategories] = useState<HouseholdCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const amountId = `${ids}-amount`;
  const monthId = `${ids}-month`;
  const categoryLabelId = `${ids}-category`;

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
    if (!canSubmitBudget(submitting) || submittingRef.current) return;

    const nextErrors: FieldErrors = {};
    const amountMessage = budgetAmountMessage(amount);
    if (amountMessage) nextErrors.amount = amountMessage;

    if (!categoryId) nextErrors.category = "Elige una categoría.";
    const monthMessage = budgetDateMessage(month);
    if (monthMessage) nextErrors.month = monthMessage;

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const parsedAmount = parseBudgetAmountInput(amount);
    const range = parseBudgetMonthInput(month);
    if (parsedAmount == null) {
      setErrors({ amount: "Ingresa un monto válido." });
      return;
    }
    if (!range) {
      setErrors({ month: "El periodo no es válido." });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});

    const request = {
      householdId,
      categoryId,
      amount: parsedAmount,
      startDate: range.start,
      activeMemberIds: members.map((member) => member.userId),
      allowedCategoryIds: categories.map((category) => category.id),
    };
    const result = budget
      ? await updateBudget({ ...request, budgetId: budget.id })
      : await createBudget(request);

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
      : "Guardar presupuesto";

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
              title={isEditing ? "Editar presupuesto" : "Crear un presupuesto"}
              description={
                isEditing
                  ? "El límite se guarda en tu Nido activo. El gasto se calcula de tus gastos reales."
                  : "El límite se guarda en tu Nido activo. El gasto se calcula de tus gastos reales."
              }
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
                label="Límite"
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
              <FieldLabel htmlFor={monthId}>Mes</FieldLabel>
              <TextInput
                id={monthId}
                type="month"
                value={month}
                onChange={(event) => {
                  setMonth(event.target.value);
                  setErrors((current) => ({ ...current, month: undefined }));
                }}
                invalid={Boolean(errors.month)}
                disabled={submitting}
                aria-describedby={errors.month ? `${monthId}-error` : undefined}
              />
              <FieldError id={`${monthId}-error`}>{errors.month}</FieldError>
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
                  description="No se pueden crear presupuestos hasta que tu Nido tenga categorías de gasto."
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
                          {category.icon ?? "📌"}
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
        </div>
      </FlowScreen>
    </div>
  );
}
