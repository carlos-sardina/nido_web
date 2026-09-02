"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, Shield, Target } from "lucide-react";
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
import { goalVisual } from "@/components/goals/visual";
import { canSubmitContribution, createContribution, updateContribution } from "@/lib/nido/contributions";
import {
  amountToContributionInput,
  clampedPercent,
  contributionAmountMessage,
  contributionDateMessage,
  formatCompactMoney,
  canContributeToGoal,
  goalKindLabel,
  goalProgress,
  goalScopeLabel,
  isFund,
  parseContributionAmountInput,
  roundMoney,
  todayIso,
  type GoalContributionRow,
  type GoalProgress,
  type GoalRow,
} from "@/lib/nido/financial";
import type { HouseholdMemberView } from "@/lib/nido/types";
import { P } from "@/lib/palette";

type FieldErrors = {
  goal?: string;
  amount?: string;
  date?: string;
  form?: string;
};

export function ContribFlow({
  householdId,
  members,
  currentUserId,
  goals,
  contribution,
  loading = false,
  onClose,
  onDone,
  onCreateGoal,
}: {
  householdId: string;
  members: HouseholdMemberView[];
  currentUserId: string | null;
  goals: GoalRow[];
  contribution?: GoalContributionRow | null;
  loading?: boolean;
  onClose: () => void;
  onDone: () => void;
  onCreateGoal: () => void;
}) {
  const ids = useId();
  const submittingRef = useRef(false);
  const isEditing = Boolean(contribution);
  const activeGoals = goals.filter((goal) => canContributeToGoal(goal, currentUserId));
  const funds = activeGoals.filter((goal) => isFund(goal));
  const metas = activeGoals.filter((goal) => !isFund(goal));
  const [goalId, setGoalId] = useState(() => contribution?.goalId ?? "");
  const [amount, setAmount] = useState(() =>
    contribution ? amountToContributionInput(contribution.amount) : "",
  );
  const [contributedAt, setContributedAt] = useState(
    () => contribution?.contributedAt ?? todayIso(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const knownGoalIdsRef = useRef<Set<string> | null>(null);
  const activeGoalIds = activeGoals.map((goal) => goal.id).join("\0");

  useEffect(() => {
    const nextIds = activeGoalIds ? activeGoalIds.split("\0") : [];
    if (knownGoalIdsRef.current == null) {
      knownGoalIdsRef.current = new Set(nextIds);
      return;
    }
    const added = nextIds.filter((id) => !knownGoalIdsRef.current!.has(id));
    knownGoalIdsRef.current = new Set(nextIds);
    if (isEditing || added.length !== 1) return;
    setGoalId(added[0]);
    setErrors((current) => ({ ...current, goal: undefined }));
  }, [activeGoalIds, isEditing]);

  const amountId = `${ids}-amount`;
  const dateId = `${ids}-date`;
  const goalLabelId = `${ids}-goal`;
  const empty = !loading && !isEditing && activeGoals.length === 0;
  const editingGoal = contribution
    ? activeGoals.find((goal) => goal.id === contribution.goalId) ??
      goals.find((goal) => goal.id === contribution.goalId)
    : null;
  const selectedGoal = isEditing
    ? editingGoal
    : activeGoals.find((goal) => goal.id === goalId) ?? null;
  const parsedAmount = parseContributionAmountInput(amount);
  const saveLabel = submitting
    ? "Guardando…"
    : isEditing
      ? "Guardar cambios"
      : "Guardar aportación";

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

    const parsed = parseContributionAmountInput(amount);
    if (parsed == null) {
      setErrors({ amount: "Ingresa un monto válido." });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});

    const result = contribution
      ? await updateContribution({
          householdId,
          goalId,
          amount: parsed,
          contributedAt,
          contributionId: contribution.id,
          activeMemberIds: members.map((member) => member.userId),
          allowedGoalIds: activeGoals.map((goal) => goal.id),
        })
      : await createContribution({
          householdId,
          goalId,
          amount: parsed,
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
    <div className="absolute inset-0 z-30 overflow-hidden">
      <FlowScreen
        lockViewport
        className="h-full min-h-0"
        header={<BackLink onClick={onClose} label="Cerrar" />}
        footer={
          empty || loading ? undefined : (
            <ScreenFooter>
              <Button type="submit" form={`${ids}-form`} loading={submitting}>
                {saveLabel}
              </Button>
            </ScreenFooter>
          )
        }
      >
        <ScreenIntro
          className="mb-6"
          title={isEditing ? "Editar aportación" : "Registrar una aportación"}
          description={
            isEditing
              ? "Los cambios se guardan en tu Nido activo."
              : "Elige una meta o un fondo activo."
          }
        />

        {loading ? (
            <Text size="caption" tone="muted" aria-busy="true">
              Cargando metas y fondos…
            </Text>
          ) : empty ? (
            <div>
              <div className="flex justify-center gap-2 mb-4" aria-hidden="true">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: "#E8F4EF" }}
                >
                  <Shield size={20} strokeWidth={1.75} style={{ color: P.sageDk }} />
                </div>
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: "#FDEEF1" }}
                >
                  <Target size={20} strokeWidth={1.75} style={{ color: P.brnDp }} />
                </div>
              </div>
              <EmptyState
                title="Todavía no hay metas ni fondos"
                description="Crea una meta o un fondo primero para poder registrar una aportación."
                actionLabel="Crear una meta o un fondo"
                onAction={onCreateGoal}
              />
            </div>
          ) : (
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
                <p id={goalLabelId} className="mb-2 text-label font-semibold text-muted-foreground">
                  Meta o fondo
                </p>
                {isEditing ? (
                  editingGoal ? (
                    <GoalPickCard
                      goal={editingGoal}
                      selected
                      locked
                      disabled
                    />
                  ) : (
                    <div
                      className="rounded-2xl px-4 py-3"
                      role="group"
                      aria-labelledby={goalLabelId}
                      style={{ backgroundColor: P.bg }}
                    >
                      <Text size="body-sm" className="font-medium">
                        Meta o fondo
                      </Text>
                      <Text size="caption" tone="muted" className="mt-0.5">
                        No se puede cambiar el destino de una aportación.
                      </Text>
                    </div>
                  )
                ) : (
                  <div className="space-y-4" role="group" aria-labelledby={goalLabelId}>
                    {funds.length > 0 ? (
                      <GoalPickSection title="Fondos">
                        {funds.map((goal) => (
                          <GoalPickCard
                            key={goal.id}
                            goal={goal}
                            selected={goalId === goal.id}
                            disabled={submitting}
                            onSelect={() => {
                              setGoalId(goal.id);
                              setErrors((current) => ({ ...current, goal: undefined }));
                            }}
                          />
                        ))}
                      </GoalPickSection>
                    ) : null}
                    {metas.length > 0 ? (
                      <GoalPickSection title="Metas">
                        {metas.map((goal) => (
                          <GoalPickCard
                            key={goal.id}
                            goal={goal}
                            selected={goalId === goal.id}
                            disabled={submitting}
                            onSelect={() => {
                              setGoalId(goal.id);
                              setErrors((current) => ({ ...current, goal: undefined }));
                            }}
                          />
                        ))}
                      </GoalPickSection>
                    ) : null}
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={submitting}
                      onClick={onCreateGoal}
                    >
                      Crear otra meta o fondo
                    </Button>
                  </div>
                )}
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

              {selectedGoal && parsedAmount != null ? (
                <ContributionPreview
                  goal={selectedGoal}
                  amount={parsedAmount}
                  editing={contribution}
                />
              ) : null}

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
      </FlowScreen>
    </div>
  );
}

function GoalPickSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: P.muted }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function GoalPickCard({
  goal,
  selected,
  locked = false,
  disabled = false,
  onSelect,
}: {
  goal: GoalRow;
  selected: boolean;
  locked?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  const progress = goalProgress(goal);
  const visual = goalVisual(goal.goalType);
  const Icon = visual.Icon;
  const className =
    "w-full rounded-[1.25rem] p-3.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70";

  const body = (
    <>
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: P.card }}
        >
          <Icon size={16} strokeWidth={1.75} style={{ color: visual.accentDk }} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-bold leading-tight truncate" style={{ color: P.text }}>
              {goal.name}
            </p>
            {selected ? (
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: visual.accentDk }}
              >
                <Check size={12} strokeWidth={2.5} color="#FFFCFA" aria-hidden="true" />
              </span>
            ) : null}
          </div>
          <p className="text-[10px] mt-0.5" style={{ color: P.muted }}>
            {goalKindLabel(goal.goalType)}
            {" · "}
            {goalScopeLabel(goal.scope)}
          </p>
        </div>
      </div>
      <GoalMiniBar progress={progress} bar={visual.bar} accent={visual.accentDk} />
      {locked ? (
        <p className="mt-2 text-[10px]" style={{ color: P.muted }}>
          No se puede cambiar el destino de una aportación.
        </p>
      ) : null}
    </>
  );

  const surfaceStyle = {
    backgroundColor: visual.well,
    boxShadow: selected ? `inset 0 0 0 2px ${visual.accent}` : undefined,
  };

  if (locked || !onSelect) {
    return (
      <div className={className} role="group" style={surfaceStyle}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`${className} active:scale-[0.99]`}
      style={surfaceStyle}
    >
      {body}
    </button>
  );
}

function GoalMiniBar({
  progress,
  bar,
  accent,
}: {
  progress: GoalProgress;
  bar: string;
  accent: string;
}) {
  return (
    <>
      <div className="mt-2.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold font-sans" style={{ color: P.text }}>
          {formatCompactMoney(progress.contributed)}
          <span className="font-medium" style={{ color: P.muted }}>
            {progress.invalidTarget ? " ahorrados" : ` de ${formatCompactMoney(progress.targetAmount)}`}
          </span>
        </span>
        <span className="text-[11px] font-bold font-sans" style={{ color: accent }}>
          {progress.invalidTarget ? "—" : `${progress.percent}%`}
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: "rgba(47,42,40,0.08)" }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.invalidTarget ? 0 : progress.percent}
        aria-label={
          progress.invalidTarget ? "Sin objetivo" : `${progress.percent}% completado`
        }
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${progress.percent}%`, background: bar }}
        />
      </div>
    </>
  );
}

function ContributionPreview({
  goal,
  amount,
  editing,
}: {
  goal: GoalRow;
  amount: number;
  editing?: GoalContributionRow | null;
}) {
  const progress = goalProgress(goal);
  const visual = goalVisual(goal.goalType);
  const current = progress.contributed;
  const projected = Math.max(
    0,
    roundMoney(
      editing && editing.goalId === goal.id
        ? current - editing.amount + amount
        : current + amount,
    ),
  );
  const projectedPercent = progress.invalidTarget
    ? null
    : clampedPercent(projected, progress.targetAmount);
  const reached = !progress.invalidTarget && projected >= progress.targetAmount;

  return (
    <div
      className="rounded-[1.25rem] p-4"
      style={{ backgroundColor: visual.well }}
      aria-live="polite"
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-widest mb-2"
        style={{ color: visual.accentDk }}
      >
        {reached ? (isFund(goal) ? "Fondo alcanzado" : "Meta alcanzada") : "Después de aportar"}
      </p>
      <p className="text-lg font-bold font-sans leading-none" style={{ color: P.text }}>
        {formatCompactMoney(projected)}
        <span className="ml-1.5 text-[11px] font-medium" style={{ color: P.muted }}>
          {progress.invalidTarget ? "ahorrados" : `de ${formatCompactMoney(progress.targetAmount)}`}
        </span>
      </p>
      {projectedPercent != null ? (
        <>
          <div
            className="relative mt-3 h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: "rgba(47,42,40,0.08)" }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${projectedPercent}%`,
                background: visual.bar,
                opacity: 0.4,
              }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${Math.min(progress.percent, projectedPercent)}%`,
                background: visual.bar,
              }}
            />
          </div>
          <p className="mt-1.5 text-[10px] font-semibold" style={{ color: visual.accentDk }}>
            {`${progress.percent}% → ${projectedPercent}%`}
          </p>
        </>
      ) : null}
    </div>
  );
}
