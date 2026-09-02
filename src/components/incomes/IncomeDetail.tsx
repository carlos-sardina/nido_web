"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/nido/Button";
import { FieldError } from "@/components/nido/Field";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
import { Text } from "@/components/nido/Typography";
import { canSubmitIncome, deleteIncome } from "@/lib/nido/incomes";
import {
  canMutateIncome,
  formatCompactMoney,
  formatRelativeActivityDate,
  isSueldoIncomeCategory,
  type IncomeRow,
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

export function IncomeDetail({
  income,
  members,
  currentUserId,
  onClose,
  onEdit,
  onDeleted,
}: {
  income: IncomeRow;
  members: HouseholdMemberView[];
  currentUserId: string | null;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const ids = useId();
  const submittingRef = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canMutate = canMutateIncome(income, currentUserId);
  const isSueldo = income.category != null && isSueldoIncomeCategory(income.category);
  const ownerName = memberName(income.memberId, members, income.member?.displayName);
  const creatorName = memberName(
    income.createdBy,
    members,
    income.createdBy === income.memberId ? income.member?.displayName : null,
  );

  const handleDelete = async () => {
    if (!canSubmitIncome(submitting) || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    const result = await deleteIncome(income.id);
    if (result.ok === false) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(result.error.message);
      return;
    }

    onDeleted();
  };

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
                    onClick={() => void handleDelete()}
                  >
                    {submitting ? "Eliminando…" : "Eliminar ingreso"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button onClick={onEdit}>Editar</Button>
                  <Button variant="ghost" onClick={() => setConfirming(true)}>
                    Eliminar
                  </Button>
                </div>
              )}
            </ScreenFooter>
          ) : undefined
        }
      >
        <ScreenIntro
          className="mb-6"
          title={
            confirming
              ? "¿Eliminar este ingreso?"
              : income.description?.trim() || income.category?.name || "Ingreso"
          }
          description={
            confirming
              ? isSueldo
                ? "Esta acción quitará el ingreso de tus totales y no se copiará a los meses siguientes."
                : "Esta acción quitará el ingreso de tus totales y actividad."
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
                    Monto
                  </Text>
                  <p className="mt-1 text-h2 font-bold font-sans" style={{ color: P.text }}>
                    {formatCompactMoney(income.amount)}
                  </p>
                </div>

                <DetailRow
                  label="Categoría"
                  value={`${income.category?.icon?.trim() || "💰"} ${income.category?.name ?? "Categoría"}`}
                />
                <DetailRow
                  label="Fecha"
                  value={formatRelativeActivityDate(income.occurredAt, income.createdAt)}
                />
                <DetailRow label="Lo registró" value={creatorName} />
                {income.memberId !== income.createdBy ? (
                  <DetailRow label="A quién pertenece" value={ownerName} />
                ) : null}
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
