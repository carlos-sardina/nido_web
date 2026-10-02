"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/nido/Button";
import { FieldError } from "@/components/nido/Field";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
import { ScopeTag } from "@/components/nido/ScopeTag";
import { Text } from "@/components/nido/Typography";
import { canSubmitBudget, deleteBudget } from "@/lib/nido/budgets";
import {
  canMutateBudget,
  expensesConsumingBudget,
  formatCompactMoney,
  formatMonthLabel,
  formatRelativeActivityDate,
  isPersonalExpense,
  netExpense,
  type BudgetItemView,
  type ExpenseRow,
} from "@/lib/nido/financial";
import { P } from "@/lib/palette";

function periodLabel(item: BudgetItemView): string {
  const [year, month] = item.startDate.split("-").map(Number);
  if (!year || !month) return item.startDate;
  return formatMonthLabel(year, month);
}

export function BudgetDetail({
  budget,
  expenses,
  currentUserId,
  onClose,
  onEdit,
  onDeleted,
  onOpenExpense,
}: {
  budget: BudgetItemView;
  expenses: readonly ExpenseRow[];
  currentUserId: string | null;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
  onOpenExpense?: (expense: ExpenseRow) => void;
}) {
  const ids = useId();
  const submittingRef = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canMutate = canMutateBudget(budget, currentUserId);
  const related = expensesConsumingBudget(budget, expenses);

  const handleDelete = async () => {
    if (!canSubmitBudget(submitting) || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    const result = await deleteBudget(budget.id);
    if (result.ok === false) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(result.error.message);
      return;
    }

    onDeleted();
  };

  return (
    <div className="absolute inset-0 z-40 overflow-hidden">
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
                    {submitting ? "Eliminando…" : "Eliminar presupuesto"}
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
          title={confirming ? "¿Eliminar este presupuesto?" : budget.name}
          description={
            confirming
              ? budget.memberId == null
                ? "El límite dejará de contar en Home y en Presupuestos. El Nido verá en Actividad que lo eliminaste."
                : "El límite dejará de contar en Home y en Presupuestos. Tus gastos no se eliminan."
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
                    Límite
                  </Text>
                  <p className="mt-1 text-h2 font-bold font-sans" style={{ color: P.text }}>
                    {formatCompactMoney(budget.amount)}
                  </p>
                </div>

                <div
                  className="rounded-2xl p-4 shadow-sm"
                  style={{ backgroundColor: P.card }}
                >
                  <Text size="caption" tone="muted">
                    Consumido
                  </Text>
                  <p
                    className="mt-1 text-h2 font-bold font-sans"
                    style={{ color: budget.over ? P.danger : P.text }}
                  >
                    {formatCompactMoney(budget.spent)}
                  </p>
                  <div
                    className="mt-3 h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: P.sub }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, budget.usagePercent ?? 0)}%`,
                        backgroundColor: budget.over
                          ? P.danger
                          : budget.nearLimit
                            ? P.warn
                            : P.sageDk,
                      }}
                    />
                  </div>
                  <p
                    className="mt-2 text-caption font-semibold"
                    style={{
                      color: budget.over ? P.danger : budget.nearLimit ? P.warn : P.sageDk,
                    }}
                  >
                    {budget.usagePercent != null ? `${budget.usagePercent}% · ` : ""}
                    {budget.over
                      ? `Restante ${formatCompactMoney(budget.remaining)}`
                      : `${formatCompactMoney(budget.remaining)} restante`}
                  </p>
                </div>

                <DetailRow
                  label="Categoría"
                  value={`${budget.icon} ${budget.name}`}
                />
                <DetailRow
                  label="Tipo"
                  value={
                    budget.memberId
                      ? budget.memberId === currentUserId
                        ? "Presupuesto personal"
                        : `Presupuesto personal · ${budget.memberName?.split(/\s+/)[0] ?? "Miembro"}`
                      : "Presupuesto del Nido"
                  }
                />
                <DetailRow label="Periodo" value={periodLabel(budget)} />

                <div className="pt-2">
                  <Text size="label">Gastos de este mes</Text>
                  {related.length === 0 ? (
                    <Text size="caption" tone="muted" className="mt-2 leading-relaxed">
                      Ningún gasto de este mes cuenta para este presupuesto.
                    </Text>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {related.map((expense) => {
                        const personal = isPersonalExpense(expense);
                        const net = netExpense(expense.amount, expense.refunds);
                        const title = expense.description?.trim() || "Gasto";
                        return (
                          <button
                            key={expense.id}
                            type="button"
                            onClick={() => onOpenExpense?.(expense)}
                            disabled={!onOpenExpense}
                            className="w-full flex items-center gap-3 rounded-2xl p-3 text-left shadow-sm transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:active:scale-100"
                            style={{ backgroundColor: P.card }}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold truncate" style={{ color: P.text }}>
                                {title}
                              </p>
                              <div className="mt-1 flex items-center gap-1.5">
                                <ScopeTag
                                  kind={personal ? "personal" : "nido"}
                                  label={personal ? "Personal" : "Compartido"}
                                />
                                <span className="text-[10px]" style={{ color: P.muted }}>
                                  {formatRelativeActivityDate(expense.occurredAt, expense.createdAt)}
                                </span>
                              </div>
                            </div>
                            <span className="text-sm font-bold font-sans flex-shrink-0" style={{ color: P.text }}>
                              {formatCompactMoney(net)}
                            </span>
                          </button>
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
