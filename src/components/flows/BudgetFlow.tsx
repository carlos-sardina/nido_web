"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/nido/Button";
import { ChoiceCard } from "@/components/nido/ChoiceCard";
import { CategoryCreateFields } from "@/components/nido/CategoryEmojiField";
import {
  Field,
  FieldError,
  FieldLabel,
  MoneyField,
  TextInput,
} from "@/components/nido/Field";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
import { trackEvent } from "@/lib/analytics";
import { canSubmitBudget, createBudget, updateBudget } from "@/lib/nido/budgets";
import { createCategory, renameCategory } from "@/lib/nido/categories";
import {
  amountToBudgetInput,
  budgetAmountMessage,
  budgetNameConflictMessage,
  categoryNameKey,
  categoryNameMessage,
  DEFAULT_CATEGORY_EMOJI,
  getCurrentMonthRange,
  parseBudgetAmountInput,
  resolveCategoryIcon,
  withCurrentCategory,
  type BudgetRow,
  type HouseholdCategory,
} from "@/lib/nido/financial";
import { fetchActiveExpenseCategories } from "@/lib/nido/queries/categories";
import { fetchBudgetsForRange } from "@/lib/nido/queries/budgets";
import type { HouseholdMemberView } from "@/lib/nido/types";

type FieldErrors = {
  amount?: string;
  name?: string;
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

export type BudgetCreateTarget = {
  categoryId: string;
  name?: string;
  icon?: string | null;
};

export function BudgetFlow({
  householdId,
  members,
  currentUserId,
  budget,
  initialCategory,
  onClose,
  onDone,
}: {
  householdId: string;
  members: HouseholdMemberView[];
  currentUserId: string | null;
  budget?: BudgetFormValue | null;
  initialCategory?: BudgetCreateTarget | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const ids = useId();
  const submittingRef = useRef(false);
  const isEditing = Boolean(budget);
  const seedCategory = budget ?? initialCategory ?? null;
  const nameLocked = Boolean(initialCategory) && !isEditing;
  const [amount, setAmount] = useState(() =>
    budget ? amountToBudgetInput(budget.amount) : "",
  );
  const [name, setName] = useState(() => seedCategory?.name?.trim() || "");
  const [emoji, setEmoji] = useState(() => seedCategory?.icon?.trim() || DEFAULT_CATEGORY_EMOJI);
  const [personal, setPersonal] = useState(() => Boolean(budget?.memberId));
  const [categories, setCategories] = useState<HouseholdCategory[]>([]);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const amountId = `${ids}-amount`;
  const nameId = `${ids}-name`;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const month = getCurrentMonthRange();
      const [result, budgetResult] = await Promise.all([
        fetchActiveExpenseCategories(householdId),
        fetchBudgetsForRange(householdId, month),
      ]);
      if (cancelled) return;
      setBudgets(budgetResult.ok ? budgetResult.data : []);
      if (result.ok === false) {
        setErrors({ form: result.error.message });
        setCategories([]);
        setLoadingCategories(false);
        return;
      }
      const current = seedCategory
        ? {
            id: seedCategory.categoryId,
            householdId,
            name: seedCategory.name?.trim() || "Presupuesto",
            icon: seedCategory.icon ?? "📌",
            type: "expense" as const,
            isDefault: false,
            archivedAt: result.data.some((row) => row.id === seedCategory.categoryId)
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
  }, [householdId, budget, initialCategory]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmitBudget(submitting) || submittingRef.current) return;

    const nextErrors: FieldErrors = {};
    const amountMessage = budgetAmountMessage(amount);
    if (amountMessage) nextErrors.amount = amountMessage;
    const nameMessage = categoryNameMessage(name);
    if (nameMessage === "Dale un nombre a la categoría.") {
      nextErrors.name = "Dale un nombre al presupuesto.";
    } else if (nameMessage) {
      nextErrors.name = nameMessage;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const parsedAmount = parseBudgetAmountInput(amount);
    if (parsedAmount == null) {
      setErrors({ amount: "Ingresa un monto válido." });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});

    const month = budget?.startDate
      ? { start: budget.startDate, end: getCurrentMonthRange().end }
      : getCurrentMonthRange();
    let categoryId = seedCategory?.categoryId ?? "";
    let catalog = categories;

    if (!nameLocked && !isEditing) {
      const key = categoryNameKey(name);
      const match = catalog.find((row) => categoryNameKey(row.name) === key && row.archivedAt == null);
      if (match) {
        categoryId = match.id;
      } else {
        const created = await createCategory({
          name,
          type: "expense",
          icon: resolveCategoryIcon(emoji),
          householdId,
          existing: catalog,
        });
        if (created.ok === false) {
          submittingRef.current = false;
          setSubmitting(false);
          setErrors({ name: created.error.message });
          return;
        }
        categoryId = created.data.id;
        const createdRow: HouseholdCategory = {
          id: categoryId,
          householdId,
          name: name.trim(),
          icon: resolveCategoryIcon(emoji),
          type: "expense",
          isDefault: false,
          archivedAt: null,
        };
        catalog = withCurrentCategory(catalog, createdRow);
        setCategories(catalog);
      }
    }

    if (isEditing && budget && categoryNameKey(name) !== categoryNameKey(budget.name)) {
      const renamed = await renameCategory({
        categoryId: budget.categoryId,
        name,
        householdId,
        type: "expense",
        existing: catalog,
      });
      if (renamed.ok === false) {
        submittingRef.current = false;
        setSubmitting(false);
        setErrors({ name: renamed.error.message });
        return;
      }
    }

    if (!categoryId) {
      submittingRef.current = false;
      setSubmitting(false);
      setErrors({ name: "Dale un nombre al presupuesto." });
      return;
    }

    if (!isEditing) {
      const conflict = budgetNameConflictMessage(budgets, {
        categoryId,
        personal,
        userId: currentUserId,
        startDate: month.start,
        endDate: month.end,
      });
      if (conflict) {
        submittingRef.current = false;
        setSubmitting(false);
        setErrors({ name: conflict });
        return;
      }
    }

    const request = {
      householdId,
      categoryId,
      amount: parsedAmount,
      startDate: budget?.startDate ?? month.start,
      personal,
      activeMemberIds: members.map((member) => member.userId),
      allowedCategoryIds: catalog.map((category) => category.id),
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

    if (!budget) {
      trackEvent("Budget created", {
        amount: parsedAmount,
        category: name.trim(),
        personal,
      });
    }
    onDone();
  };

  const saveLabel = submitting
    ? "Guardando…"
    : isEditing
      ? "Guardar cambios"
      : "Guardar presupuesto";

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
              disabled={loadingCategories}
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
                ? "Este presupuesto es tuyo. Los gastos que registres aquí son personales."
                : "Este presupuesto es del Nido. Los gastos que registres aquí son compartidos."
              : "El nombre es la categoría. El tipo define si el gasto es tuyo o del Nido, y el límite es de este mes."
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
                description="Los gastos de este nombre se comparten."
                selected={!personal}
                disabled={submitting || isEditing}
                onClick={() => setPersonal(false)}
              />
              <ChoiceCard
                title="Presupuesto personal"
                description="Los gastos de este nombre son tuyos."
                selected={personal}
                disabled={submitting || isEditing}
                onClick={() => setPersonal(true)}
              />
            </div>
          </Field>

          <Field>
            <MoneyField
              id={amountId}
              label="Límite de este mes"
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
            {nameLocked ? (
              <>
                <FieldLabel htmlFor={nameId}>Nombre</FieldLabel>
                <TextInput
                  id={nameId}
                  value={`${emoji} ${name}`.trim()}
                  disabled
                  filled
                />
              </>
            ) : (
              <>
                <p id={`${ids}-name-label`} className="mb-2 text-label font-semibold text-muted-foreground">
                  Nombre
                </p>
                {isEditing ? (
                  <TextInput
                    id={nameId}
                    value={name}
                    maxLength={80}
                    disabled={submitting}
                    invalid={Boolean(errors.name)}
                    filled={Boolean(name)}
                    aria-describedby={errors.name ? `${nameId}-error` : undefined}
                    onChange={(event) => {
                      setName(event.target.value);
                      setErrors((current) => ({ ...current, name: undefined }));
                    }}
                  />
                ) : (
                  <CategoryCreateFields
                    emoji={emoji}
                    onEmojiChange={setEmoji}
                    nameId={nameId}
                    name={name}
                    onNameChange={(value) => {
                      setName(value);
                      setErrors((current) => ({ ...current, name: undefined }));
                    }}
                    namePlaceholder="Restaurantes, gimnasio…"
                    disabled={submitting}
                    nameInvalid={Boolean(errors.name)}
                    nameDescribedBy={errors.name ? `${nameId}-error` : undefined}
                  />
                )}
              </>
            )}
            <FieldError id={`${nameId}-error`}>{errors.name}</FieldError>
          </Field>
        </form>
      </FlowScreen>
    </div>
  );
}
