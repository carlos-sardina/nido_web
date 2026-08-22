"use client";

import { useId, useRef, useState, type FormEvent } from "react";
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
import { canSubmitContribution, createContribution } from "@/lib/nido/contributions";
import {
  contributionAmountMessage,
  contributionDateMessage,
  formatCompactMoney,
  goalProgress,
  parseContributionAmountInput,
  todayIso,
  type GoalRow,
} from "@/lib/nido/financial";
import type { HouseholdMemberView } from "@/lib/nido/types";

type FieldErrors = {
  goal?: string;
  amount?: string;
  date?: string;
  form?: string;
};

export function ContribFlow({
  householdId,
  members,
  goals,
  loading = false,
  onClose,
  onDone,
  onCreateGoal,
}: {
  householdId: string;
  members: HouseholdMemberView[];
  goals: GoalRow[];
  loading?: boolean;
  onClose: () => void;
  onDone: () => void;
  onCreateGoal: () => void;
}) {
  const ids = useId();
  const submittingRef = useRef(false);
  const activeGoals = goals.filter((goal) => goal.status === "active");
  const [goalId, setGoalId] = useState("");
  const [amount, setAmount] = useState("");
  const [contributedAt, setContributedAt] = useState(() => todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const amountId = `${ids}-amount`;
  const dateId = `${ids}-date`;
  const goalLabelId = `${ids}-goal`;
  const empty = !loading && activeGoals.length === 0;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (empty || !canSubmitContribution(submitting) || submittingRef.current) return;

    const nextErrors: FieldErrors = {};
    if (!goalId) nextErrors.goal = "Elige una meta.";

    const amountMessage = contributionAmountMessage(amount);
    if (amountMessage) nextErrors.amount = amountMessage;

    const dateMessage = contributionDateMessage(contributedAt);
    if (dateMessage) nextErrors.date = dateMessage;

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const parsedAmount = parseContributionAmountInput(amount);
    if (parsedAmount == null) {
      setErrors({ amount: "Ingresa un monto válido." });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});

    const result = await createContribution({
      householdId,
      goalId,
      amount: parsedAmount,
      contributedAt,
      activeMemberIds: members.map((member) => member.userId),
      allowedGoalIds: activeGoals.map((goal) => goal.id),
    });

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
          empty || loading ? undefined : (
            <ScreenFooter>
              <Button type="submit" form={`${ids}-form`} loading={submitting}>
                {submitting ? "Guardando…" : "Guardar aportación"}
              </Button>
            </ScreenFooter>
          )
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0">
            <BackLink onClick={onClose} label="Cerrar" />
            <ScreenIntro
              className="mb-6"
              title="Registrar una aportación"
              description="Elige una meta activa de tu Nido."
            />
          </div>

          {loading ? (
            <Text size="caption" tone="muted" aria-busy="true">
              Cargando metas…
            </Text>
          ) : empty ? (
            <EmptyState
              title="Todavía no hay metas"
              description="Crea una meta primero para poder registrar una aportación."
              actionLabel="Crear una meta"
              onAction={onCreateGoal}
            />
          ) : (
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
                <p id={goalLabelId} className="mb-2 text-label font-semibold text-muted-foreground">
                  Meta
                </p>
                <div className="space-y-2" role="group" aria-labelledby={goalLabelId}>
                  {activeGoals.map((goal) => {
                    const progress = goalProgress(goal);
                    const targetLabel = progress.invalidTarget
                      ? "—"
                      : formatCompactMoney(progress.targetAmount);
                    return (
                      <ChoiceCard
                        key={goal.id}
                        icon={goal.goalType === "purchase" ? "🎯" : "🛡️"}
                        title={goal.name}
                        description={`${formatCompactMoney(progress.contributed)} de ${targetLabel} · ${
                          progress.invalidTarget ? "—" : `${progress.percent}%`
                        }`}
                        selected={goalId === goal.id}
                        disabled={submitting}
                        onClick={() => {
                          setGoalId(goal.id);
                          setErrors((current) => ({ ...current, goal: undefined }));
                        }}
                      />
                    );
                  })}
                </div>
                <FieldError id={`${ids}-goal-error`}>{errors.goal}</FieldError>
              </Field>

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
                <FieldLabel htmlFor={dateId}>Fecha</FieldLabel>
                <TextInput
                  id={dateId}
                  type="date"
                  value={contributedAt}
                  onChange={(event) => {
                    setContributedAt(event.target.value);
                    setErrors((current) => ({ ...current, date: undefined }));
                  }}
                  invalid={Boolean(errors.date)}
                  disabled={submitting}
                  aria-describedby={errors.date ? `${dateId}-error` : undefined}
                />
                <FieldError id={`${dateId}-error`}>{errors.date}</FieldError>
              </Field>
            </form>
          )}
        </div>
      </FlowScreen>
    </div>
  );
}
