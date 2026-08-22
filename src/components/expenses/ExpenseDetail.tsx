"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/nido/Button";
import { FieldError } from "@/components/nido/Field";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
import { Text } from "@/components/nido/Typography";
import { canSubmitExpense, deleteExpense } from "@/lib/nido/expenses";
import {
  canMutateExpense,
  formatCompactMoney,
  formatRelativeActivityDate,
  isPersonalExpense,
  type ExpenseRow,
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

export function ExpenseDetail({
  expense,
  members,
  currentUserId,
  onClose,
  onEdit,
  onDeleted,
}: {
  expense: ExpenseRow;
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
  const canMutate = canMutateExpense(expense, currentUserId);
  const personal = isPersonalExpense(expense);
  const payerName = memberName(expense.payerId, members, expense.payer?.displayName);
  const creatorName = memberName(expense.createdBy, members, expense.createdBy === expense.payerId ? expense.payer?.displayName : null);

  const handleDelete = async () => {
    if (!canSubmitExpense(submitting) || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    const result = await deleteExpense(expense.id);
    if (result.ok === false) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(result.error.message);
      return;
    }

    onDeleted();
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
                    onClick={() => void handleDelete()}
                  >
                    {submitting ? "Eliminando…" : "Eliminar gasto"}
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
              title={
                confirming
                  ? "¿Eliminar este gasto?"
                  : expense.description?.trim() || expense.category?.name || "Gasto"
              }
              description={
                confirming
                  ? "Esta acción quitará el gasto de tus totales y actividad."
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
                    Monto
                  </Text>
                  <p className="mt-1 text-h2 font-bold font-sans" style={{ color: P.text }}>
                    {formatCompactMoney(expense.amount)}
                  </p>
                </div>

                <DetailRow
                  label="Categoría"
                  value={`${expense.category?.icon?.trim() || "💸"} ${expense.category?.name ?? "Categoría"}`}
                />
                <DetailRow
                  label="Fecha"
                  value={formatRelativeActivityDate(expense.occurredAt, expense.createdAt)}
                />
                <DetailRow
                  label="Tipo"
                  value={personal ? "Personal" : "Compartido"}
                />
                <DetailRow label="Lo registró" value={creatorName} />
                <DetailRow label="Lo pagó" value={payerName} />

                {!personal && expense.splits.length > 0 ? (
                  <div>
                    <Text size="label" tone="muted" className="mb-2">
                      Distribución
                    </Text>
                    <div className="space-y-2">
                      {expense.splits.map((split) => (
                        <div
                          key={split.id}
                          className="flex items-center justify-between rounded-2xl px-4 py-3"
                          style={{ backgroundColor: P.sub }}
                        >
                          <Text size="body-sm">
                            {memberName(split.memberId, members)}
                          </Text>
                          <Text size="body-sm" className="font-semibold">
                            {formatCompactMoney(split.amount)}
                          </Text>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
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
