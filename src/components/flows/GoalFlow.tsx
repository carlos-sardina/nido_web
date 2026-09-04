"use client";

import { useId, useRef, useState, type FormEvent } from "react";
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
import { trackEvent } from "@/lib/analytics";
import { canSubmitGoal, createGoal, updateGoal } from "@/lib/nido/goals";
import {
  amountToGoalInput,
  GOAL_DESCRIPTION_MAX,
  GOAL_NAME_MAX,
  goalAmountMessage,
  goalDateMessage,
  goalDescriptionMessage,
  goalNameMessage,
  parseGoalAmountInput,
  type ExpenseScope,
  type GoalRow,
  type GoalType,
} from "@/lib/nido/financial";

type FieldErrors = {
  name?: string;
  amount?: string;
  date?: string;
  description?: string;
  type?: string;
  scope?: string;
  form?: string;
};

export function GoalFlow({
  householdId,
  members,
  goal,
  onClose,
  onDone,
}: {
  householdId: string;
  members: { userId: string }[];
  goal?: GoalRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const ids = useId();
  const submittingRef = useRef(false);
  const isEditing = Boolean(goal);
  const [name, setName] = useState(() => goal?.name ?? "");
  const [amount, setAmount] = useState(() =>
    goal ? amountToGoalInput(goal.targetAmount) : "",
  );
  const [targetDate, setTargetDate] = useState(() => goal?.targetDate ?? "");
  const [description, setDescription] = useState(() => goal?.description ?? "");
  const [goalType, setGoalType] = useState<GoalType | null>(() => goal?.goalType ?? null);
  const [scope, setScope] = useState<ExpenseScope | null>(() => goal?.scope ?? "shared");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const nameId = `${ids}-name`;
  const amountId = `${ids}-amount`;
  const dateId = `${ids}-date`;
  const descriptionId = `${ids}-description`;
  const typeLabelId = `${ids}-type`;
  const scopeLabelId = `${ids}-scope`;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmitGoal(submitting) || submittingRef.current) return;

    const nextErrors: FieldErrors = {};
    const nameMessage = goalNameMessage(name);
    if (nameMessage) nextErrors.name = nameMessage;

    const amountMessage = goalAmountMessage(amount);
    if (amountMessage) nextErrors.amount = amountMessage;

    const dateMessage = goalDateMessage(targetDate);
    if (dateMessage) nextErrors.date = dateMessage;

    const descriptionMessage = goalDescriptionMessage(description);
    if (descriptionMessage) nextErrors.description = descriptionMessage;

    if (goalType == null) nextErrors.type = "Elige si es un fondo o una meta.";
    if (scope == null) nextErrors.scope = "Elige si es personal o compartido.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const parsedAmount = parseGoalAmountInput(amount);
    if (parsedAmount == null || goalType == null || scope == null) {
      setErrors({ amount: "Ingresa un monto válido." });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});

    const request = {
      householdId,
      name,
      amount: parsedAmount,
      goalType,
      scope,
      targetDate: targetDate.trim() || null,
      description,
      activeMemberIds: members.map((member) => member.userId),
    };
    const result = goal
      ? await updateGoal({ ...request, goalId: goal.id })
      : await createGoal(request);

    if (result.ok === false) {
      submittingRef.current = false;
      setSubmitting(false);
      setErrors({ form: result.error.message });
      return;
    }

    if (!goal) {
      trackEvent("Goal created", { type: goalType, scope });
    }
    onDone();
  };

  const saveLabel = submitting
    ? "Guardando…"
    : isEditing
      ? "Guardar cambios"
      : goalType === "saving"
        ? "Crear fondo"
        : goalType === "purchase"
          ? "Crear meta"
          : "Crear";

  return (
    <div className="absolute inset-0 z-40 overflow-hidden">
      <FlowScreen
        lockViewport
        className="h-full min-h-0"
        header={<BackLink onClick={onClose} label="Cerrar" />}
        footer={
          <ScreenFooter>
            <Button type="submit" form={`${ids}-form`} loading={submitting}>
              {saveLabel}
            </Button>
          </ScreenFooter>
        }
      >
        <ScreenIntro
          className="mb-6"
          title={
            isEditing
              ? goal?.goalType === "saving"
                ? "Editar fondo"
                : "Editar meta"
              : "Crear una meta o un fondo"
          }
          description={
            isEditing
              ? "Los cambios se guardan en tu Nido activo."
              : "Un fondo cubre gastos. Una meta es algo que quieren alcanzar."
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
              <FieldLabel htmlFor={nameId}>Nombre</FieldLabel>
              <TextInput
                id={nameId}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setErrors((current) => ({ ...current, name: undefined }));
                }}
                placeholder="Viaje a Japón"
                maxLength={GOAL_NAME_MAX}
                invalid={Boolean(errors.name)}
                disabled={submitting}
                aria-describedby={errors.name ? `${nameId}-error` : undefined}
              />
              <FieldError id={`${nameId}-error`}>{errors.name}</FieldError>
            </Field>

            <Field>
              <MoneyField
                id={amountId}
                label="Monto objetivo"
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
              <FieldLabel htmlFor={dateId}>Fecha objetivo (opcional)</FieldLabel>
              <TextInput
                id={dateId}
                type="date"
                value={targetDate}
                onChange={(event) => {
                  setTargetDate(event.target.value);
                  setErrors((current) => ({ ...current, date: undefined }));
                }}
                invalid={Boolean(errors.date)}
                disabled={submitting}
                aria-describedby={errors.date ? `${dateId}-error` : undefined}
              />
              <FieldError id={`${dateId}-error`}>{errors.date}</FieldError>
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
                placeholder="Para qué es esta meta"
                maxLength={GOAL_DESCRIPTION_MAX}
                invalid={Boolean(errors.description)}
                disabled={submitting}
                aria-describedby={errors.description ? `${descriptionId}-error` : undefined}
              />
              <FieldError id={`${descriptionId}-error`}>{errors.description}</FieldError>
            </Field>

            <Field>
              <p id={typeLabelId} className="mb-2 text-label font-semibold text-muted-foreground">
                ¿Qué quieres crear?
              </p>
              <div className="space-y-2" role="group" aria-labelledby={typeLabelId}>
                <ChoiceCard
                  icon="🛡️"
                  title="Fondo"
                  description="Reserva para imprevistos. Solo los compartidos cubren meses de gastos."
                  selected={goalType === "saving"}
                  disabled={submitting}
                  onClick={() => {
                    setGoalType("saving");
                    setErrors((current) => ({ ...current, type: undefined }));
                  }}
                />
                <ChoiceCard
                  icon="🎯"
                  title="Meta"
                  description="Algo que quieren alcanzar o comprar. No cubre meses de gastos."
                  selected={goalType === "purchase"}
                  disabled={submitting}
                  onClick={() => {
                    setGoalType("purchase");
                    setErrors((current) => ({ ...current, type: undefined }));
                  }}
                />
              </div>
              <FieldError id={`${ids}-type-error`}>{errors.type}</FieldError>
            </Field>

            <Field>
              <p id={scopeLabelId} className="mb-2 text-label font-semibold text-muted-foreground">
                ¿Es personal o del Nido?
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
                    setErrors((current) => ({ ...current, scope: undefined }));
                  }}
                />
                <ChoiceCard
                  icon="🏠"
                  title="Compartido"
                  description={
                    goalType === "saving"
                      ? "Del Nido. Suma a los meses que pueden cubrir con fondos."
                      : "Del Nido. Cualquier miembro puede aportar."
                  }
                  selected={scope === "shared"}
                  disabled={submitting}
                  onClick={() => {
                    setScope("shared");
                    setErrors((current) => ({ ...current, scope: undefined }));
                  }}
                />
              </div>
              <FieldError id={`${ids}-scope-error`}>{errors.scope}</FieldError>
            </Field>
          </form>
      </FlowScreen>
    </div>
  );
}
