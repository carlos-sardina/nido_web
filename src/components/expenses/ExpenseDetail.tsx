"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/nido/Button";
import { Field, FieldError, HelperText, MoneyField } from "@/components/nido/Field";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
import { Text } from "@/components/nido/Typography";
import {
  canSubmitExpense,
  canSubmitRefund,
  createRefund,
  deleteExpense,
} from "@/lib/nido/expenses";
import {
  canEditExpense,
  canMutateExpense,
  canRefundExpense,
  expensePayerLabel,
  formatCompactMoney,
  formatRelativeActivityDate,
  isPersonalExpense,
  netExpense,
  parseExpenseAmountInput,
  refundableRemaining,
  refundAmountMessage,
  refundedTotal,
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
  onRefunded,
}: {
  expense: ExpenseRow;
  members: HouseholdMemberView[];
  currentUserId: string | null;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
  onRefunded?: () => void;
}) {
  const ids = useId();
  const submittingRef = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canMutate = canMutateExpense(expense, currentUserId);
  const canEdit = canEditExpense(expense, currentUserId);
  const canRefund = canRefundExpense(expense, currentUserId);
  const personal = isPersonalExpense(expense);
  const refunds = expense.refunds ?? [];
  const refunded = refundedTotal(refunds);
  const remaining = refundableRemaining(expense.amount, refunds);
  const net = netExpense(expense.amount, refunds);
  const payerName = expensePayerLabel(expense, members);
  const creatorName = memberName(expense.createdBy, members, expense.createdBy === expense.payerId ? expense.payer?.displayName : null);
  const refundFieldError = refundAmount ? refundAmountMessage(refundAmount, remaining) : null;

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

  const handleRefund = async () => {
    if (!canSubmitRefund(submitting) || submittingRef.current) return;
    const amount = parseExpenseAmountInput(refundAmount);
    const message = refundAmountMessage(refundAmount, remaining);
    if (amount == null || message) {
      setError(message ?? "Ingresa un monto válido.");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    const result = await createRefund({
      expenseId: expense.id,
      amount,
      refundableRemaining: remaining,
    });
    if (result.ok === false) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(result.error.message);
      return;
    }

    submittingRef.current = false;
    setSubmitting(false);
    setRefunding(false);
    setRefundAmount("");
    onRefunded?.();
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
                    {submitting ? "Eliminando…" : "Eliminar gasto"}
                  </Button>
                </div>
              ) : refunding ? (
                <div className="space-y-3">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (submitting) return;
                      setRefunding(false);
                      setRefundAmount("");
                      setError(null);
                    }}
                    disabled={submitting}
                  >
                    Cancelar
                  </Button>
                  <Button
                    loading={submitting}
                    disabled={Boolean(refundFieldError) || !refundAmount.trim()}
                    onClick={() => void handleRefund()}
                  >
                    {submitting ? "Guardando…" : "Devolver dinero"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {canRefund ? (
                    <Button onClick={() => { setRefunding(true); setError(null); }}>
                      Devolver dinero
                    </Button>
                  ) : null}
                  {canEdit ? <Button variant={canRefund ? "secondary" : "primary"} onClick={onEdit}>Editar</Button> : null}
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
              ? "¿Eliminar este gasto?"
              : refunding
                ? "Devolver dinero"
                : expense.description?.trim() || expense.category?.name || "Gasto"
          }
          description={
            confirming
              ? personal
                ? "Esta acción quitará el gasto de tus totales y actividad."
                : "Esta acción quitará el gasto de tus totales. El Nido verá en Actividad que lo eliminaste."
              : refunding
                ? `Disponible para devolver: ${formatCompactMoney(remaining)}`
                : undefined
          }
        />

        <div className="space-y-4">
            {error ? <FieldError id={`${ids}-error`}>{error}</FieldError> : null}

            {confirming ? null : refunding ? (
              <Field>
                <MoneyField
                  id={`${ids}-refund`}
                  label="Monto a devolver"
                  value={refundAmount}
                  onChange={setRefundAmount}
                  invalid={Boolean(refundFieldError)}
                  disabled={submitting}
                  describedBy={refundFieldError ? `${ids}-refund-error` : `${ids}-refund-help`}
                />
                {refundFieldError ? (
                  <FieldError id={`${ids}-refund-error`}>{refundFieldError}</FieldError>
                ) : (
                  <HelperText id={`${ids}-refund-help`}>
                    {`Disponible: ${formatCompactMoney(remaining)}`}
                  </HelperText>
                )}
              </Field>
            ) : (
              <>
                <div
                  className="rounded-2xl p-4 shadow-sm"
                  style={{ backgroundColor: P.card }}
                >
                  <Text size="caption" tone="muted">
                    Gasto original
                  </Text>
                  <p className="mt-1 text-h2 font-bold font-sans" style={{ color: P.text }}>
                    {formatCompactMoney(expense.amount)}
                  </p>
                  {refunded > 0 ? (
                    <div className="mt-3 space-y-1">
                      <Text size="caption" tone="muted">
                        {`Ya reembolsado ${formatCompactMoney(refunded)}`}
                      </Text>
                      <Text size="body-sm" className="font-semibold">
                        {`Neto ${formatCompactMoney(net)}`}
                      </Text>
                    </div>
                  ) : null}
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
                      {expense.splits.map((split) => {
                        const refundShare = refunds.reduce((sum, refund) => {
                          const match = refund.splits.find((row) => row.memberId === split.memberId);
                          return sum + (match?.amount ?? 0);
                        }, 0);
                        return (
                          <div
                            key={split.id}
                            className="rounded-2xl px-4 py-3"
                            style={{ backgroundColor: P.sub }}
                          >
                            <div className="flex items-center justify-between">
                              <Text size="body-sm">
                                {memberName(split.memberId, members)}
                              </Text>
                              <Text size="body-sm" className="font-semibold">
                                {formatCompactMoney(split.amount)}
                              </Text>
                            </div>
                            {refundShare > 0 ? (
                              <Text size="caption" tone="muted" className="mt-1">
                                {`Original ${formatCompactMoney(split.amount)} · Devolución ${formatCompactMoney(refundShare)}`}
                              </Text>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {refunds.length > 0 ? (
                  <div>
                    <Text size="label" tone="muted" className="mb-2">
                      Devoluciones
                    </Text>
                    <div className="space-y-2">
                      {refunds.map((refund) => (
                        <div
                          key={refund.id}
                          className="flex items-center justify-between rounded-2xl px-4 py-3"
                          style={{ backgroundColor: P.sub }}
                        >
                          <Text size="caption" tone="muted">
                            {formatRelativeActivityDate(refund.occurredAt, refund.createdAt)}
                          </Text>
                          <Text size="body-sm" className="font-semibold">
                            {`− ${formatCompactMoney(refund.amount)}`}
                          </Text>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 space-y-1">
                      <DetailRow label="Total refundado" value={formatCompactMoney(refunded)} />
                      <DetailRow label="Neto" value={formatCompactMoney(net)} />
                      {remaining > 0 ? (
                        <DetailRow label="Disponible para devolver" value={formatCompactMoney(remaining)} />
                      ) : null}
                    </div>
                  </div>
                ) : canRefund ? (
                  <DetailRow label="Disponible para devolver" value={formatCompactMoney(remaining)} />
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
