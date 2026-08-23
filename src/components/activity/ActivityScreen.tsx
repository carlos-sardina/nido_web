"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/nido/Button";
import { EmptyInline } from "@/components/nido/EmptyState";
import { PullToRefresh } from "@/components/nido/PullToRefresh";
import { Heading, Text } from "@/components/nido/Typography";
import {
  findActivitySource,
  formatCompactMoney,
  formatRelativeActivityDate,
  type ExpenseRow,
  type GoalRow,
  type IncomeRow,
} from "@/lib/nido/financial";
import type { DashboardQuery } from "@/lib/nido/use-dashboard";
import { P } from "@/lib/palette";

function activityCaption(item: {
  type: string;
  date: string;
  createdAt: string | null;
  metadata: { scope?: string; categoryName?: string | null; goalName?: string | null };
}): string {
  const parts = [formatRelativeActivityDate(item.date, item.createdAt)];
  if (item.type === "refund") parts.push("Devolución");
  if ((item.type === "expense" || item.type === "refund") && item.metadata.scope === "personal") {
    parts.push("Personal");
  }
  if ((item.type === "expense" || item.type === "refund") && item.metadata.scope === "shared") {
    parts.push("Compartido");
  }
  if (item.metadata.categoryName) parts.push(item.metadata.categoryName);
  return parts.join(" · ");
}

export function ActivityScreen({
  dashboard,
  onOpenExpense,
  onOpenIncome,
  onOpenGoal,
  onRegisterExpense,
  onRegisterIncome,
  onRegisterContribution,
}: {
  dashboard: DashboardQuery;
  onOpenExpense: (expense: ExpenseRow) => void;
  onOpenIncome: (income: IncomeRow) => void;
  onOpenGoal: (goal: GoalRow) => void;
  onRegisterExpense: () => void;
  onRegisterIncome: () => void;
  onRegisterContribution: () => void;
}) {
  const { isLoading, refreshing, error, model, refresh } = dashboard;
  const activity = model?.activity ?? [];
  const empty = Boolean(model && activity.length === 0);
  const health = model?.health;
  const chips = health?.available
    ? [
        {
          label: "Ingreso del mes",
          value: formatCompactMoney(model?.periodIncome ?? 0),
        },
        health.savingsRatePercent != null
          ? { label: "Tasa de ahorro", value: `${health.savingsRatePercent}%` }
          : null,
        { label: "Salud", value: health.label },
      ].filter((chip): chip is { label: string; value: string } => chip != null)
    : [];

  const openItem = (item: (typeof activity)[number]) => {
    if (!model) return;
    const source = findActivitySource(item, {
      expenses: [...model.recentExpenses, ...model.periodExpenses],
      incomes: [...model.recentIncomes, ...model.periodIncomes],
      goals: model.goals,
    });
    if (source?.type === "expense") onOpenExpense(source.expense);
    if (source?.type === "income") onOpenIncome(source.income);
    if (source?.type === "goal_contribution") onOpenGoal(source.goal);
  };

  return (
    <PullToRefresh
      onRefresh={refresh}
      refreshing={refreshing}
      className="h-full min-h-0 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden pb-20"
    >
      <div className="px-6 pt-3 pb-1">
        <Heading as="h2" size="h2">
          Actividad
        </Heading>
        <Text size="caption" tone="muted" className="mt-1">
          Línea de tiempo del hogar
        </Text>
      </div>

      {isLoading && !model ? (
        <div className="px-6 pt-4" aria-busy="true" aria-live="polite">
          <Text size="caption" tone="muted">
            Cargando actividad…
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
      ) : (
        <>
          {error ? (
            <div className="mx-6 mb-3 rounded-2xl px-4 py-3" style={{ backgroundColor: P.dangerBg }}>
              <Text size="caption" tone="danger">
                {error.message}
              </Text>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                className="mt-1 text-caption font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                style={{ color: P.danger }}
              >
                Reintentar
              </button>
            </div>
          ) : null}

          {chips.length > 0 ? (
            <div
              className="mx-6 my-3 rounded-[1.5rem] overflow-hidden"
              style={{ background: "linear-gradient(135deg, #255D4D 0%, #2F7D66 100%)" }}
            >
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={13} style={{ color: P.sageLt }} />
                  <span
                    className="text-[9px] font-bold uppercase tracking-widest"
                    style={{ color: P.sageLt }}
                  >
                    Bienestar financiero
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {chips.slice(0, 3).map((chip) => (
                    <div
                      key={chip.label}
                      className="rounded-xl p-2.5 text-center"
                      style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
                    >
                      <p className="text-sm font-bold text-white font-sans">{chip.value}</p>
                      <p
                        className="text-[9px] mt-0.5 leading-tight"
                        style={{ color: "rgba(255,255,255,0.4)" }}
                      >
                        {chip.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="px-6 pb-6 relative">
            {empty ? (
              <div className="rounded-[1.5rem] p-5 shadow-sm" style={{ backgroundColor: P.card }}>
                <EmptyInline
                  title="Todo tranquilo por aquí."
                  description="Todavía no hay movimientos. Registra un gasto, un ingreso o una aportación para ver la actividad de tu Nido."
                >
                  <div className="mt-4 space-y-2">
                    <Button variant="secondary" size="compact" onClick={onRegisterExpense}>
                      Registrar un gasto
                    </Button>
                    <Button variant="secondary" size="compact" onClick={onRegisterIncome}>
                      Registrar un ingreso
                    </Button>
                    <Button variant="secondary" size="compact" onClick={onRegisterContribution}>
                      Registrar una aportación
                    </Button>
                  </div>
                </EmptyInline>
              </div>
            ) : (
              <>
                <div
                  className="absolute top-0 bottom-0 w-px"
                  style={{ left: "2.125rem", backgroundColor: P.sub }}
                />
                <div className="space-y-3">
                  {activity.map((item) => (
                    <div key={item.id} className="flex gap-3 items-start">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 z-10 text-sm shadow-sm"
                        style={{ backgroundColor: P.card }}
                      >
                        {item.icon}
                      </div>
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        className="flex-1 rounded-2xl p-3 shadow-sm text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        style={{ backgroundColor: P.card, border: `1px solid ${P.border}` }}
                      >
                        <p className="text-xs font-medium leading-snug" style={{ color: P.text }}>
                          {item.title}
                        </p>
                        <div className="flex items-center justify-between mt-1 gap-2">
                          <span className="text-[9px]" style={{ color: P.muted }}>
                            {activityCaption(item)}
                          </span>
                          <span className="text-[10px] font-bold font-sans flex-shrink-0" style={{ color: P.text }}>
                            {formatCompactMoney(item.amount)}
                          </span>
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </PullToRefresh>
  );
}
