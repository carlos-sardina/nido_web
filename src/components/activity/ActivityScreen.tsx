"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/nido/Button";
import { EmptyInline } from "@/components/nido/EmptyState";
import { PullToRefresh } from "@/components/nido/PullToRefresh";
import { Heading, Text } from "@/components/nido/Typography";
import {
  ACTIVITY_PAGE_SIZE,
  filterActivityByScope,
  findActivitySource,
  formatCompactMoney,
  formatRelativeActivityDate,
  type ActivityScopeFilter,
  type ExpenseRow,
  type GoalRow,
  type IncomeRow,
} from "@/lib/nido/financial";
import type { DashboardQuery } from "@/lib/nido/use-dashboard";
import { P } from "@/lib/palette";

const SCOPE_FILTERS: { value: ActivityScopeFilter; label: string }[] = [
  { value: "all", label: "Todo" },
  { value: "shared", label: "Compartido" },
  { value: "personal", label: "Personal" },
];

function ScopeFilterBar({
  value,
  onChange,
}: {
  value: ActivityScopeFilter;
  onChange: (next: ActivityScopeFilter) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filtrar actividad"
      className="flex gap-1 rounded-full p-1"
      style={{ backgroundColor: P.sub }}
    >
      {SCOPE_FILTERS.map((filter) => {
        const selected = filter.value === value;
        return (
          <button
            key={filter.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(filter.value)}
            className="flex-1 h-8 rounded-full text-caption font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              backgroundColor: selected ? P.card : "transparent",
              color: selected ? P.brnDp : P.muted,
              boxShadow: selected ? "0 1px 3px rgba(47,42,40,0.08)" : undefined,
            }}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}

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
  currentUserId,
  onOpenExpense,
  onOpenIncome,
  onOpenGoal,
  onRegisterExpense,
  onRegisterIncome,
  onRegisterContribution,
}: {
  dashboard: DashboardQuery;
  currentUserId: string | null;
  onOpenExpense: (expense: ExpenseRow) => void;
  onOpenIncome: (income: IncomeRow) => void;
  onOpenGoal: (goal: GoalRow) => void;
  onRegisterExpense: () => void;
  onRegisterIncome: () => void;
  onRegisterContribution: () => void;
}) {
  const { isLoading, refreshing, loadingMore, error, model, refresh, loadMoreActivity, activityHasMore } =
    dashboard;
  const [scopeFilter, setScopeFilter] = useState<ActivityScopeFilter>("all");
  const [visibleCount, setVisibleCount] = useState(ACTIVITY_PAGE_SIZE);
  const activity = useMemo(() => model?.activity ?? [], [model]);
  const filteredActivity = useMemo(
    () => filterActivityByScope(activity, scopeFilter, currentUserId),
    [activity, scopeFilter, currentUserId],
  );
  const visibleActivity = filteredActivity.slice(0, visibleCount);
  const empty = Boolean(model && activity.length === 0);
  const filteredEmpty = Boolean(model && activity.length > 0 && filteredActivity.length === 0);
  const canRevealMore = filteredActivity.length > visibleCount;
  const showLoadMore = !empty && (canRevealMore || activityHasMore);
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

  useEffect(() => {
    setVisibleCount(ACTIVITY_PAGE_SIZE);
  }, [scopeFilter]);

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

  const onLoadMore = () => {
    if (canRevealMore) {
      setVisibleCount((count) => count + ACTIVITY_PAGE_SIZE);
      return;
    }
    void loadMoreActivity().then(() => {
      setVisibleCount((count) => count + ACTIVITY_PAGE_SIZE);
    });
  };

  const loadMoreButton = showLoadMore ? (
    <div className="mt-4">
      <Button
        variant="secondary"
        size="compact"
        onClick={onLoadMore}
        loading={loadingMore}
        disabled={loadingMore}
      >
        Cargar más
      </Button>
    </div>
  ) : null;

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
                <div className="relative">
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
            </div>
          ) : null}

          {!empty && model ? (
            <div className="px-6 pt-1 pb-3">
              <ScopeFilterBar value={scopeFilter} onChange={setScopeFilter} />
            </div>
          ) : null}

          <div className="px-6 pb-6">
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
            ) : filteredEmpty ? (
              <div className="rounded-[1.5rem] p-5 shadow-sm" style={{ backgroundColor: P.card }}>
                <EmptyInline
                  title={
                    scopeFilter === "shared"
                      ? "Sin movimientos compartidos."
                      : "Sin movimientos tuyos."
                  }
                  description={
                    activityHasMore
                      ? "No hay nada con este filtro en lo que ya cargamos. Puedes intentar con más historial."
                      : "No hay nada con este filtro en la actividad reciente de tu Nido."
                  }
                >
                  <div className="mt-4">
                    {activityHasMore ? (
                      <Button
                        variant="secondary"
                        size="compact"
                        onClick={onLoadMore}
                        loading={loadingMore}
                        disabled={loadingMore}
                      >
                        Cargar más
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="compact"
                        onClick={() => setScopeFilter("all")}
                      >
                        Ver toda la actividad
                      </Button>
                    )}
                  </div>
                </EmptyInline>
              </div>
            ) : (
              <>
                <div className="relative">
                  <div
                    className="absolute top-0 bottom-0 w-px"
                    style={{ left: "2.125rem", backgroundColor: P.sub }}
                  />
                  <div className="space-y-3">
                    {visibleActivity.map((item) => (
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
                </div>
                {loadMoreButton}
              </>
            )}
          </div>
        </>
      )}
    </PullToRefresh>
  );
}
