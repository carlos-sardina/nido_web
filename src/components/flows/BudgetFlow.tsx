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
import { canSubmitBudget, createBudget, updateBudget } from "@/lib/nido/budgets";
import {
  amountToBudgetInput,
  budgetAmountMessage,
  budgetDateMessage,
  budgetMonthInput,
  getCurrentMonthRange,
  parseBudgetAmountInput,
  parseBudgetMonthInput,
  withCurrentCategory,
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
  memberId?: string | null;
  name?: string;
  icon?: string | null;
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
  const [personal, setPersonal] = useState(() => Boolean(budget?.memberId));
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
      const current = budget
        ? {
            id: budget.categoryId,
            householdId,
            name: budget.name?.trim() || "Categoría",
            icon: budget.icon ?? "📌",
            type: "expense" as const,
            isDefault: false,
            archivedAt: result.data.some((row) => row.id === budget.categoryId)
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
      personal,
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
          title={isEditing ? "Editar presupuesto" : "Crear un presupuesto"}
          description={
            isEditing
              ? personal
                ? "Este es tu presupuesto personal. Solo tú puedes editarlo."
                : "Este es un presupuesto del Nido. El gasto se calcula de tus gastos reales."
              : "Elige si el límite es del Nido o solo tuyo. El gasto se calcula de tus gastos reales."
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
              <p className="mb-2 text-label font-semibold text-muted-foreground">
                Tipo
              </p>
              <div className="space-y-2">
                <ChoiceCard
                  title="Presupuesto del Nido"
                  description="Visible para los miembros de tu Nido."
                  selected={!personal}
                  disabled={submitting || isEditing}
                  onClick={() => setPersonal(false)}
                />
                <ChoiceCard
                  title="Presupuesto personal"
                  description="Es tuyo. La visibilidad sigue tu preferencia de Perfil."
                  selected={personal}
                  disabled={submitting || isEditing}
                  onClick={() => setPersonal(true)}
                />
              </div>
            </Field>

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
              <CategoryPicker
                householdId={householdId}
                type="expense"
                categories={categories}
                selectedId={categoryId}
                loading={loadingCategories}
                disabled={submitting}
                labelledBy={categoryLabelId}
                fallbackIcon="📌"
                onSelect={(id) => {
                  setCategoryId(id);
                  setErrors((current) => ({ ...current, category: undefined }));
                }}
                onCategoriesChange={setCategories}
              />
              <FieldError id={`${ids}-category-error`}>{errors.category}</FieldError>
            </Field>
          </form>
      </FlowScreen>
    </div>
  );
}
