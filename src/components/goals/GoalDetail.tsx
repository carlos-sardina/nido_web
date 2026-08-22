"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/nido/Button";
import { FieldError } from "@/components/nido/Field";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
import { Text } from "@/components/nido/Typography";
import { archiveGoal, canSubmitGoal } from "@/lib/nido/goals";
import {
  canMutateGoal,
  formatCompactMoney,
  formatGoalTargetDate,
  formatWholeMoney,
  goalProgress,
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
  onArchived,
}: {
  goal: GoalRow;
  members: HouseholdMemberView[];
  currentUserId: string | null;
  onClose: () => void;
  onEdit: () => void;
  onArchived: () => void;
}) {
  const ids = useId();
  const submittingRef = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canMutate = canMutateGoal(goal, currentUserId);
  const progress = goalProgress(goal);
  const creatorName = memberName(goal.createdBy, members);
  const targetLabel = formatGoalTargetDate(goal.targetDate);

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

  return (
    <div className="absolute inset-0 z-30">
      <FlowScreen
        lockViewport
        className="h-full min-h-0"
        footer={
          canMutate ? (
            <ScreenFooter>
              {confirming ? (
                <div className="space-y-3">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (submitting) return;
                      setConfirming(false);
                      setError(null);
                    }}
                    disabled={submitting}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="danger"
                    loading={submitting}
                    onClick={() => void handleArchive()}
                  >
                    {submitting ? "Archivando…" : "Archivar meta"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button onClick={onEdit}>Editar</Button>
                  <Button variant="ghost" onClick={() => setConfirming(true)}>
                    Archivar
                  </Button>
                </div>
              )}
            </ScreenFooter>
          ) : undefined
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0">
            <BackLink
              onClick={() => {
                if (submitting) return;
                onClose();
              }}
              label="Cerrar"
            />
            <ScreenIntro
              className="mb-6"
              title={confirming ? "¿Archivar esta meta?" : goal.name}
              description={
                confirming
                  ? "Dejará de aparecer en Metas y en el inicio. Las aportaciones se conservan."
                  : undefined
              }
            />
          </div>

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-6 space-y-4">
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
                      Meta alcanzada
                    </Text>
                  ) : null}
                </div>

                <DetailRow
                  label="Tipo"
                  value={goal.goalType === "purchase" ? "Compra" : "Ahorro"}
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
              </>
            )}
          </div>
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
