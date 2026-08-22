"use client";

import { Button } from "@/components/nido/Button";
import { EmptyState } from "@/components/nido/EmptyState";
import { BackLink } from "@/components/nido/Screen";
import { Heading, Text } from "@/components/nido/Typography";
import {
  formatCompactMoney,
  formatMonthLabel,
  type BudgetItemView,
} from "@/lib/nido/financial";
import type { DashboardQuery } from "@/lib/nido/use-dashboard";
import { P } from "@/lib/palette";

function periodLabel(item: BudgetItemView): string {
  const [year, month] = item.startDate.split("-").map(Number);
  if (!year || !month) return item.startDate;
  return formatMonthLabel(year, month);
}

function usageColor(item: BudgetItemView): string {
  if (item.over) return P.danger;
  if (item.nearLimit) return P.warn;
  return P.sageDk;
}

export function BudgetScreen({
  dashboard,
  onClose,
  onOpenBudget,
  onCreateBudget,
}: {
  dashboard: DashboardQuery;
  onClose: () => void;
  onOpenBudget: (budget: BudgetItemView) => void;
  onCreateBudget: () => void;
}) {
  const { isLoading, error, model, refresh } = dashboard;
  const budgets = model?.periodBudgets ?? [];
  const empty = Boolean(model && budgets.length === 0);
  const summary = model?.budget;

  return (
    <div className="absolute inset-0 z-30" style={{ backgroundColor: P.bgL }}>
      <div className="h-full min-h-0 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden">
        <div className="px-6 pt-3 pb-1">
          <BackLink onClick={onClose} label="Cerrar" />
          <Heading as="h2" size="h2">
            Presupuestos
          </Heading>
          <Text size="caption" tone="muted" className="mt-1">
            {model?.range.label ?? "Este mes"}
          </Text>
        </div>

        {isLoading && !model ? (
          <div className="px-6 pt-4" aria-busy="true" aria-live="polite">
            <Text size="caption" tone="muted">
              Cargando presupuestos…
            </Text>
          </div>
        ) : error && !model ? (
          <div className="px-6 pt-4">
            <div className="rounded-[1.5rem] p-5 shadow-sm" style={{ backgroundColor: P.card }}>
              <Text size="body-sm" tone="danger" className="mb-4">
                {error.message}
              </Text>
              <Button onClick={() => void refresh()} loading={isLoading}>
                Reintentar
              </Button>
            </div>
          </div>
        ) : empty ? (
          <div className="px-6 pt-4">
            <EmptyState
              title="Sin presupuestos este mes"
              description="Crea un límite por categoría. El gasto se calcula de tus gastos reales."
              actionLabel="Crear un presupuesto"
              onAction={onCreateBudget}
            />
          </div>
        ) : (
          <div className="px-6 pt-3 pb-6 space-y-3">
            {error ? (
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: P.dangerBg }}>
                <Text size="caption" tone="danger">
                  {error.message}
                </Text>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={isLoading}
                  className="mt-1 text-caption font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  style={{ color: P.danger }}
                >
                  Reintentar
                </button>
              </div>
            ) : null}

            {summary?.hasBudget ? (
              <div className="rounded-[1.5rem] p-5 shadow-sm" style={{ backgroundColor: P.card }}>
                <div className="flex items-end justify-between mb-3">
                  <div>
                    <p className="text-[10px] mb-0.5" style={{ color: P.muted }}>
                      Gastado este mes
                    </p>
                    <p className="text-[26px] font-bold font-sans" style={{ color: P.text }}>
                      {formatCompactMoney(summary.totalSpent)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px]" style={{ color: P.muted }}>
                      Presupuestado
                    </p>
                    <p className="text-lg font-bold font-sans" style={{ color: P.text }}>
                      {formatCompactMoney(summary.totalBudget)}
                    </p>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: P.sub }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, summary.usagePercent ?? 0)}%`,
                      background: summary.over
                        ? P.danger
                        : `linear-gradient(90deg, ${P.sage}, ${P.sageDk})`,
                    }}
                  />
                </div>
                <p
                  className="text-[10px] font-semibold mt-2"
                  style={{ color: summary.over ? P.danger : P.sageDk }}
                >
                  {summary.over
                    ? `${formatCompactMoney(Math.abs(summary.remaining))} sobre el plan`
                    : `${formatCompactMoney(summary.remaining)} disponible`}
                </p>
              </div>
            ) : null}

            {budgets.map((item) => {
              const ratio = Math.min(100, item.usagePercent ?? 0);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenBudget(item)}
                  className="w-full rounded-2xl p-4 shadow-sm text-left active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ backgroundColor: P.card }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                      style={{ backgroundColor: P.sub }}
                    >
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold truncate" style={{ color: P.text }}>
                          {item.name}
                        </span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span
                            className="text-xs font-bold font-sans"
                            style={{ color: item.over ? P.danger : P.text }}
                          >
                            {formatCompactMoney(item.spent)}
                          </span>
                          <span className="text-[9px]" style={{ color: P.muted }}>
                            / {formatCompactMoney(item.amount)}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: P.sub }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${ratio}%`,
                            backgroundColor: usageColor(item),
                          }}
                        />
                      </div>
                      <p className="text-[10px] mt-1.5" style={{ color: usageColor(item) }}>
                        {item.over
                          ? `Excedido · ${formatCompactMoney(Math.abs(item.remaining))}`
                          : item.nearLimit
                            ? `Cerca del límite · ${formatCompactMoney(item.remaining)}`
                            : `${formatCompactMoney(item.remaining)} restante · ${periodLabel(item)}`}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}

            <Button variant="ghost" onClick={onCreateBudget}>
              Crear otro presupuesto
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
