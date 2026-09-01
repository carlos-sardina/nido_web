"use client";

import { useId, useRef, useState } from "react";
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
    <div className="absolute inset-0 z-30">
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
                <div
                  className="rounded-2xl p-4 shadow-sm"
                  style={{ backgroundColor: P.card }}
                >
                  <Text size="caption" tone="muted">
                    Ahorrado
                  </Text>
                  <p className="mt-1 text-h2 font-bold font-sans" style={{ color: P.text }}>
                    {formatWholeMoney(progress.contributed)}
                  </p>
                  <div
                    className="mt-3 h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: P.sub }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${progress.percent}%`,
                        backgroundColor: P.sage,
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <Text size="caption" tone="muted">
                      {formatCompactMoney(progress.contributed)} de{" "}
                      {progress.invalidTarget ? "—" : formatCompactMoney(progress.targetAmount)}
                    </Text>
                    <Text size="caption" tone="muted">
                      {progress.invalidTarget ? "—" : `${progress.percent}%`}
                    </Text>
                  </div>
                  {progress.completed ? (
                    <Text size="caption" className="mt-2 font-semibold">
                      {goal.goalType === "saving" ? "Fondo alcanzado" : "Meta alcanzada"}
                    </Text>
                  ) : null}
                </div>

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
                <DetailRow label="La creó" value={creatorName} />

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
                              <Text size="body-sm" className="font-semibold shrink-0">
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <Text size="caption" tone="muted">
        {label}
      </Text>
      <Text size="body-sm" className="text-right font-medium">
        {value}
      </Text>
    </div>
  );
}
