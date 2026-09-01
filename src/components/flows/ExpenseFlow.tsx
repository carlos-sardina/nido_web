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
import { canSubmitExpense, createExpense, updateExpense } from "@/lib/nido/expenses";
import {
  ALL_MEMBERS_PAYER,
  amountToExpenseInput,
  expenseAmountMessage,
  expenseDescriptionMessage,
  isPaidByAllMembers,
  parseExpenseAmountInput,
  resolveExpenseParticipantIds,
  resolveExpensePayerId,
  showExpenseParticipantPicker,
  showExpensePayerPicker,
  todayIso,
  withCurrentCategory,
  type ExpenseRow,
  type ExpenseScope,
  type HouseholdCategory,
} from "@/lib/nido/financial";
import { fetchActiveExpenseCategories } from "@/lib/nido/queries/categories";
import type { HouseholdSplitMethod } from "@/lib/nido/split-method";
import type { HouseholdMemberView } from "@/lib/nido/types";

type FieldErrors = {
  amount?: string;
  description?: string;
  category?: string;
  date?: string;
  scope?: string;
  payer?: string;
  participants?: string;
  form?: string;
};

function defaultPayerId(
  expense: ExpenseRow | null | undefined,
  currentUserId: string | null,
  members: HouseholdMemberView[],
): string {
  if (expense && isPaidByAllMembers(expense)) {
    return ALL_MEMBERS_PAYER;
  }
  if (expense?.payerId && members.some((member) => member.userId === expense.payerId)) {
    return expense.payerId;
  }
  if (currentUserId && members.some((member) => member.userId === currentUserId)) {
    return currentUserId;
  }
  return members[0]?.userId ?? "";
}

export function ExpenseFlow({
  householdId,
  members,
  currentUserId,
  defaultSplitMethod = "equal",
  expense,
  onClose,
  onDone,
}: {
  householdId: string;
  members: HouseholdMemberView[];
  currentUserId: string | null;
  defaultSplitMethod?: HouseholdSplitMethod;
  expense?: ExpenseRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const ids = useId();
  const submittingRef = useRef(false);
  const isEditing = Boolean(expense);
  const [amount, setAmount] = useState(() =>
    expense ? amountToExpenseInput(expense.amount) : "",
  );
  const [description, setDescription] = useState(() => expense?.description ?? "");
  const [categoryId, setCategoryId] = useState(() => expense?.categoryId ?? "");
  const [occurredAt, setOccurredAt] = useState(() => expense?.occurredAt ?? todayIso());
  const [scope, setScope] = useState<ExpenseScope | null>(() => expense?.scope ?? null);
  const [payerId, setPayerId] = useState(() => defaultPayerId(expense, currentUserId, members));
  const [participantIds, setParticipantIds] = useState<string[]>(() =>
    expense?.scope === "shared"
      ? expense.splits.map((split) => split.memberId)
      : members.map((member) => member.userId),
  );
  const [categories, setCategories] = useState<HouseholdCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const canShare = members.length >= 2;
  const askPayer = showExpensePayerPicker(scope, members.length);
  const askParticipants = showExpenseParticipantPicker(scope, members.length);
  const payerOptions = currentUserId
    ? [
        ...members.filter((member) => member.userId === currentUserId),
        ...members.filter((member) => member.userId !== currentUserId),
      ]
    : members;
  const participantCopy = !isEditing && defaultSplitMethod === "proportional"
    ? "Participa según el ingreso del mes"
    : "Participa en partes iguales";
  const amountId = `${ids}-amount`;
  const descriptionId = `${ids}-description`;
  const dateId = `${ids}-date`;
  const categoryLabelId = `${ids}-category`;
  const scopeLabelId = `${ids}-scope`;
  const payerLabelId = `${ids}-payer`;
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
      const current = expense?.category
        ? {
            id: expense.categoryId,
            householdId,
            name: expense.category.name,
            icon: expense.category.icon,
            type: "expense" as const,
            isDefault: false,
            archivedAt: result.data.some((row) => row.id === expense.categoryId)
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
    const resolvedPayerId =
      scope == null
        ? payerId
        : resolveExpensePayerId(scope, payerId, currentUserId ?? "", members.map((member) => member.userId));
    if (scope === "shared" && askPayer && resolvedPayerId !== ALL_MEMBERS_PAYER && !members.some((member) => member.userId === resolvedPayerId)) {
      nextErrors.payer = "Elige quién pagó.";
    }
    const resolvedParticipants =
      scope == null
        ? participantIds
        : resolveExpenseParticipantIds(
            scope,
            members.map((member) => member.userId),
            participantIds,
          );
    if (scope === "shared" && askParticipants && resolvedParticipants.length < 2) {
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

    const request = {
      householdId,
      categoryId,
      amount: parsedAmount,
      description,
      occurredAt,
      scope,
      payerId: resolvedPayerId,
      participantIds: [...resolvedParticipants],
      activeMemberIds: members.map((member) => member.userId),
      allowedCategoryIds: categories.map((category) => category.id),
    };
    const result = expense
      ? await updateExpense({ ...request, expenseId: expense.id })
      : await createExpense(request);

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
      : "Guardar gasto";

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
          title={isEditing ? "Editar gasto" : "Registrar un gasto"}
          description={
            isEditing
              ? "Los cambios se guardan en tu Nido activo."
              : "El gasto se guarda en tu Nido activo."
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
              <CategoryPicker
                householdId={householdId}
                type="expense"
                categories={categories}
                selectedId={categoryId}
                loading={loadingCategories}
                disabled={submitting}
                labelledBy={categoryLabelId}
                fallbackIcon="💸"
                onSelect={(id) => {
                  setCategoryId(id);
                  setErrors((current) => ({ ...current, category: undefined }));
                }}
                onCategoriesChange={setCategories}
              />
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
                    setErrors((current) => ({
                      ...current,
                      scope: undefined,
                      payer: undefined,
                      participants: undefined,
                    }));
                  }}
                />
                <ChoiceCard
                  icon="🏠"
                  title="Compartido"
                  description={
                    canShare
                      ? members.length === 2
                        ? "Se divide entre los dos."
                        : "Se divide entre las personas que elijas."
                      : "Invita a otra persona para registrar gastos compartidos."
                  }
                  selected={scope === "shared"}
                  disabled={submitting || !canShare}
                  onClick={() => {
                    setScope("shared");
                    setErrors((current) => ({ ...current, scope: undefined, payer: undefined }));
                  }}
                />
              </div>
              <FieldError id={`${ids}-scope-error`}>{errors.scope}</FieldError>
            </Field>

            {askPayer ? (
              <Field>
                <p id={payerLabelId} className="mb-2 text-label font-semibold text-muted-foreground">
                  Quién pagó
                </p>
                <div className="space-y-2" role="radiogroup" aria-labelledby={payerLabelId}>
                  {payerOptions.map((member) => {
                    const selected = payerId === member.userId;
                    const isSelf = member.userId === currentUserId;
                    return (
                      <ChoiceCard
                        key={member.userId}
                        title={member.displayName}
                        description={isSelf ? "Tú · titular de la cuenta" : "Miembro del Nido"}
                        selected={selected}
                        disabled={submitting}
                        onClick={() => {
                          setPayerId(member.userId);
                          setErrors((current) => ({ ...current, payer: undefined }));
                        }}
                      />
                    );
                  })}
                  <ChoiceCard
                    title="Todos los miembros"
                    description="Se pagó en el momento. Nadie le debe a nadie."
                    selected={payerId === ALL_MEMBERS_PAYER}
                    disabled={submitting}
                    onClick={() => {
                      setPayerId(ALL_MEMBERS_PAYER);
                      setErrors((current) => ({ ...current, payer: undefined }));
                    }}
                  />
                </div>
                <FieldError id={`${ids}-payer-error`}>{errors.payer}</FieldError>
              </Field>
            ) : null}

            {askParticipants ? (
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
                        description={selected ? participantCopy : "No participa"}
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
      </FlowScreen>
    </div>
  );
}
