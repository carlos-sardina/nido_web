"use client";

import { useId, useRef, useState } from "react";
import { Shield, Target } from "lucide-react";
import { Button } from "@/components/nido/Button";
import { FieldError } from "@/components/nido/Field";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
import { Text } from "@/components/nido/Typography";
import { canSubmitContribution, deleteContribution } from "@/lib/nido/contributions";
import { archiveGoal, canSubmitGoal } from "@/lib/nido/goals";
import {
  canMutateContribution,
  canMutateGoal,
  formatCompactMoney,
  goalKindLabel,
  goalScopeLabel,
  formatGoalTargetDate,
  formatRelativeActivityDate,
  formatWholeMoney,
  goalProgress,
  isFund,
  roundMoney,
  visibleGoalContributions,
  type GoalContributionRow,
  type GoalRow,
} from "@/lib/nido/financial";
import type { HouseholdMemberView } from "@/lib/nido/types";
import { P } from "@/lib/palette";

function memberName(
  userId: string,
  members: HouseholdMemberView[],
  fallback?: string | null,
): string {
  return members.find((member) => member.userId === userId)?.displayName
    ?? fallback
    ?? "Un miembro";
}

export function GoalDetail({
  goal,
  members,
  currentUserId,
  onClose,
  onEdit,
  onEditContribution,
  onArchived,
  onContributionChanged,
}: {
  goal: GoalRow;
  members: HouseholdMemberView[];
  currentUserId: string | null;
  onClose: () => void;
  onEdit: () => void;
  onEditContribution: (contribution: GoalContributionRow) => void;
  onArchived: () => void;
  onContributionChanged: () => void;
}) {
  const ids = useId();
  const submittingRef = useRef(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<GoalContributionRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canMutate = canMutateGoal(goal, currentUserId);
  const progress = goalProgress(goal);
  const creatorName = memberName(goal.createdBy, members);
  const targetLabel = formatGoalTargetDate(goal.targetDate);
  const contributions = visibleGoalContributions(goal.contributions);
  const confirming = confirmingArchive || pendingDelete != null;

  const handleArchive = async () => {
    if (!canSubmitGoal(submitting) || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    const result = await archiveGoal(goal.id);
    if (result.ok === false) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(result.error.message);
      return;
    }

    onArchived();
  };

  const handleDeleteContribution = async () => {
    if (!pendingDelete) return;
    if (!canSubmitContribution(submitting) || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    const result = await deleteContribution(pendingDelete.id);
    if (result.ok === false) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(result.error.message);
      return;
    }

    setPendingDelete(null);
    submittingRef.current = false;
    setSubmitting(false);
    onContributionChanged();
  };

  const footer = confirming ? (
    <ScreenFooter>
      <div className="space-y-3">
        <Button
          variant="ghost"
          onClick={() => {
            if (submitting) return;
            setConfirmingArchive(false);
            setPendingDelete(null);
            setError(null);
          }}
          disabled={submitting}
        >
          Cancelar
        </Button>
        {pendingDelete ? (
          <Button
            variant="danger"
            loading={submitting}
            onClick={() => void handleDeleteContribution()}
          >
            {submitting ? "Eliminando…" : "Eliminar aportación"}
          </Button>
        ) : (
          <Button
            variant="danger"
            loading={submitting}
            onClick={() => void handleArchive()}
          >
            {submitting
              ? "Archivando…"
              : goal.goalType === "saving"
                ? "Archivar fondo"
                : "Archivar meta"}
          </Button>
        )}
      </div>
    </ScreenFooter>
  ) : canMutate ? (
    <ScreenFooter>
      <div className="space-y-3">
        <Button onClick={onEdit}>Editar</Button>
        <Button variant="ghost" onClick={() => setConfirmingArchive(true)}>
          Archivar
        </Button>
      </div>
    </ScreenFooter>
  ) : undefined;

  return (
    <div className="absolute inset-0 z-30 overflow-hidden">
      <FlowScreen
        lockViewport
        className="h-full min-h-0"
        header={
          <BackLink
            onClick={() => {
              if (submitting) return;
              onClose();
            }}
            label="Cerrar"
          />
        }
        footer={footer}
      >
        <ScreenIntro
          className="mb-6"
          title={
            pendingDelete
              ? "¿Eliminar esta aportación?"
              : confirmingArchive
                ? goal.goalType === "saving"
                  ? "¿Archivar este fondo?"
                  : "¿Archivar esta meta?"
                : goal.name
          }
          description={
            pendingDelete
              ? "Esta acción quitará la aportación del progreso y de la actividad."
              : confirmingArchive
                ? "Dejará de aparecer en Metas y en el inicio. Las aportaciones se conservan."
                : undefined
          }
        />

        <div className="space-y-4">
            {error ? <FieldError id={`${ids}-error`}>{error}</FieldError> : null}

            {confirming ? null : (
              <>
                <GoalProgressHero goalType={goal.goalType} progress={progress} />

                <div className="rounded-2xl px-4 py-1" style={{ backgroundColor: P.bg }}>
                  <DetailRow
                    label="Tipo"
                    value={goalKindLabel(goal.goalType)}
                  />
                  <DetailRow
                    label="Alcance"
                    value={goalScopeLabel(goal.scope)}
                  />
                  <DetailRow
                    label="Objetivo"
                    value={progress.invalidTarget ? "—" : formatCompactMoney(goal.targetAmount)}
                  />
                  {targetLabel ? <DetailRow label="Fecha objetivo" value={targetLabel} /> : null}
                  {goal.description?.trim() ? (
                    <DetailRow label="Descripción" value={goal.description.trim()} />
                  ) : null}
                  <DetailRow label="La creó" value={creatorName} last />
                </div>

                <div>
                  <Text size="label" tone="muted" className="mb-2">
                    Aportaciones
                  </Text>
                  {contributions.length === 0 ? (
                    <Text size="caption" tone="muted">
                      Todavía no hay aportaciones.
                    </Text>
                  ) : (
                    <div className="space-y-2">
                      {contributions.map((contribution) => {
                        const own = canMutateContribution(contribution, currentUserId, goal);
                        const who = memberName(
                          contribution.memberId,
                          members,
                          contribution.member?.displayName,
                        );
                        return (
                          <div
                            key={contribution.id}
                            className="rounded-2xl px-4 py-3"
                            style={{ backgroundColor: P.sub }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <Text size="body-sm" className="font-medium">
                                  {who}
                                </Text>
                                <Text size="caption" tone="muted" className="mt-0.5">
                                  {formatRelativeActivityDate(
                                    contribution.contributedAt,
                                    contribution.createdAt,
                                  )}
                                </Text>
                              </div>
                              <Text size="body-sm" className="font-semibold shrink-0 font-sans" style={{ color: P.sageDk }}>
                                {formatCompactMoney(contribution.amount)}
                              </Text>
                            </div>
                            {own ? (
                              <div className="mt-2 flex gap-4">
                                <button
                                  type="button"
                                  className="text-caption font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                                  style={{ color: P.brnDk }}
                                  onClick={() => onEditContribution(contribution)}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="text-caption font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                                  style={{ color: P.danger }}
                                  onClick={() => {
                                    setError(null);
                                    setPendingDelete(contribution);
                                  }}
                                >
                                  Eliminar
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
        </div>
      </FlowScreen>
    </div>
  );
}

function GoalProgressHero({
  goalType,
  progress,
}: {
  goalType: GoalRow["goalType"];
  progress: ReturnType<typeof goalProgress>;
}) {
  const fund = isFund({ goalType });
  const Icon = fund ? Shield : Target;
  const remaining = progress.invalidTarget || progress.completed
    ? null
    : roundMoney(progress.targetAmount - progress.contributed);
  const percent = progress.invalidTarget ? 0 : progress.percent;
  const status = progress.completed
    ? fund
      ? "Fondo alcanzado"
      : "Meta alcanzada"
    : remaining != null
      ? `Faltan ${formatCompactMoney(remaining)}`
      : null;

  return (
    <div
      className="rounded-[1.5rem] overflow-hidden shadow-sm"
      style={{
        background: fund
          ? "linear-gradient(135deg, #255D4D 0%, #2F7D66 100%)"
          : "linear-gradient(135deg, #B87485 0%, #D88D9A 100%)",
      }}
    >
      <div className="relative p-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-12 right-8 h-24 w-24 rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
        />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-9 h-9 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
              >
                <Icon size={16} strokeWidth={1.75} color="#E8F4EF" aria-hidden="true" />
              </div>
              <p
                className="text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                Ahorrado
              </p>
            </div>
            <p className="text-[28px] font-bold font-sans leading-none" style={{ color: "#FFFCFA" }}>
              {formatWholeMoney(progress.contributed)}
            </p>
            <p className="mt-2 text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
              {progress.invalidTarget
                ? "Sin objetivo definido"
                : `de ${formatCompactMoney(progress.targetAmount)}`}
            </p>
          </div>
          <ProgressRing percent={percent} />
        </div>
        <div
          className="relative mt-4 h-2 rounded-full overflow-hidden"
          style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={progress.invalidTarget ? "Sin objetivo" : `${percent}% completado`}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${percent}%`, backgroundColor: "#E8F4EF" }}
          />
        </div>
        {status ? (
          <p className="relative mt-2 text-[11px] font-semibold" style={{ color: "#E8F4EF" }}>
            {status}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const size = 64;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, percent)) / 100);

  return (
    <div className="relative flex-shrink-0" aria-hidden="true">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#E8F4EF"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[11px] font-bold font-sans"
        style={{ color: "#FFFCFA" }}
      >
        {`${percent}%`}
      </span>
    </div>
  );
}

function DetailRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-start justify-between gap-4 py-3"
      style={{ borderBottom: last ? undefined : `1px solid ${P.border}` }}
    >
      <Text size="caption" tone="muted">
        {label}
      </Text>
      <Text size="body-sm" className="text-right font-medium">
        {value}
      </Text>
    </div>
  );
}
