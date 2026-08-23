"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/nido/Button";
import { FieldError } from "@/components/nido/Field";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
import { Text } from "@/components/nido/Typography";
import { canSubmitBudget, deleteBudget } from "@/lib/nido/budgets";
import {
  canMutateBudget,
  formatCompactMoney,
  formatMonthLabel,
  type BudgetItemView,
} from "@/lib/nido/financial";
import { P } from "@/lib/palette";

function periodLabel(item: BudgetItemView): string {
  const [year, month] = item.startDate.split("-").map(Number);
  if (!year || !month) return item.startDate;
  return formatMonthLabel(year, month);
}

export function BudgetDetail({
  budget,
  currentUserId,
  onClose,
  onEdit,
  onDeleted,
}: {
  budget: BudgetItemView;
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
  const canMutate = canMutateBudget(budget, currentUserId);

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
    <div className="absolute inset-0 z-40">
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
              title={confirming ? "¿Eliminar este presupuesto?" : budget.name}
              description={
                confirming
                  ? "El límite dejará de contar en Home y en Presupuestos. Tus gastos no se eliminan."
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
