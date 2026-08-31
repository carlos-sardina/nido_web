"use client";

import { Button } from "@/components/nido/Button";
import { EmptyState } from "@/components/nido/EmptyState";
import { PullToRefresh } from "@/components/nido/PullToRefresh";
import { Heading, Text } from "@/components/nido/Typography";
import {
  formatCompactMoney,
  formatGoalTargetDate,
  formatWholeMoney,
  goalKindLabel,
  goalScopeLabel,
  isFund,
  sumMoney,
  type GoalProgress,
  type GoalRow,
} from "@/lib/nido/financial";
import type { DashboardQuery } from "@/lib/nido/use-dashboard";
import { P } from "@/lib/palette";

export function GoalsScreen({
  dashboard,
  onOpenGoal,
  onCreateGoal,
}: {
  dashboard: DashboardQuery;
  onOpenGoal: (goal: GoalRow) => void;
  onCreateGoal: () => void;
}) {
  const { isLoading, refreshing, error, model, refresh } = dashboard;
  const goals = model?.goals ?? [];
  const active = model?.activeGoals ?? [];
  const empty = Boolean(model && active.length === 0);
  const funds = active.filter((goal) => isFund(goal));
  const metas = active.filter((goal) => !isFund(goal));
  const totalFunds = sumMoney(funds.map((goal) => goal.contributed));
  const totalMetas = sumMoney(metas.map((goal) => goal.contributed));

  return (
    <PullToRefresh
      onRefresh={refresh}
      refreshing={refreshing}
      className="h-full min-h-0 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden pb-20"
    >
      <div className="px-6 pt-3 pb-1">
        <Heading as="h2" size="h2">
          Metas y fondos
        </Heading>
        <Text size="caption" tone="muted" className="mt-1">
          {empty
            ? "Aún no hay metas ni fondos activos"
            : [
                funds.length === 1 ? "1 fondo" : funds.length > 1 ? `${funds.length} fondos` : null,
                metas.length === 1 ? "1 meta" : metas.length > 1 ? `${metas.length} metas` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
        </Text>
      </div>

      {isLoading && !model ? (
        <div className="px-6 pt-4" aria-busy="true" aria-live="polite">
          <Text size="caption" tone="muted">
            Cargando metas…
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
            title="Sin metas ni fondos todavía"
            description="Crea un fondo para cubrir gastos o una meta para algo que quieren alcanzar."
            actionLabel="Crear una meta o un fondo"
            onAction={onCreateGoal}
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
                disabled={refreshing}
                className="mt-1 text-caption font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                style={{ color: P.danger }}
              >
                Reintentar
              </button>
            </div>
          ) : null}

          {funds.length > 0 ? (
            <div className="rounded-[1.5rem] p-5 shadow-sm" style={{ backgroundColor: P.card }}>
              <Text size="caption" tone="muted">
                Total en fondos
              </Text>
              <p className="mt-1 text-[22px] font-bold font-sans" style={{ color: P.text }}>
                {formatWholeMoney(totalFunds)}
              </p>
            </div>
          ) : null}

          {metas.length > 0 ? (
            <div className="rounded-[1.5rem] p-5 shadow-sm" style={{ backgroundColor: P.card }}>
              <Text size="caption" tone="muted">
                Total en metas
              </Text>
              <p className="mt-1 text-[22px] font-bold font-sans" style={{ color: P.text }}>
                {formatWholeMoney(totalMetas)}
              </p>
            </div>
          ) : null}

          {funds.length > 0 ? (
            <div className="space-y-3">
              <Text size="label" tone="muted">
                Fondos
              </Text>
              {funds.map((progress) => {
                const goal = goals.find((row) => row.id === progress.id);
                if (!goal) return null;
                return (
                  <GoalCard
                    key={progress.id}
                    progress={progress}
                    onOpen={() => onOpenGoal(goal)}
                  />
                );
              })}
            </div>
          ) : null}

          {metas.length > 0 ? (
            <div className="space-y-3">
              <Text size="label" tone="muted">
                Metas
              </Text>
              {metas.map((progress) => {
                const goal = goals.find((row) => row.id === progress.id);
                if (!goal) return null;
                return (
                  <GoalCard
                    key={progress.id}
                    progress={progress}
                    onOpen={() => onOpenGoal(goal)}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </PullToRefresh>
  );
}

function GoalCard({
  progress,
  onOpen,
}: {
  progress: GoalProgress;
  onOpen: () => void;
}) {
  const targetLabel = formatGoalTargetDate(progress.targetDate);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-[1.5rem] p-5 shadow-sm text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ backgroundColor: P.card }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: P.text }}>
            {progress.name}
          </p>
          <Text size="caption" tone="muted" className="mt-0.5">
            {goalKindLabel(progress.goalType)} · {goalScopeLabel(progress.scope)}
            {targetLabel ? ` · ${targetLabel}` : null}
          </Text>
        </div>
        <div className="text-right flex-shrink-0">
          <Text size="caption" tone="muted">
            Objetivo
          </Text>
          <p className="text-sm font-bold font-sans" style={{ color: P.text }}>
            {progress.invalidTarget ? "—" : formatCompactMoney(progress.targetAmount)}
          </p>
        </div>
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-xl font-bold font-sans" style={{ color: P.text }}>
          {formatCompactMoney(progress.contributed)}
        </span>
        <span className="text-[10px]" style={{ color: P.muted }}>
          ahorrados
        </span>
      </div>

      <div
        className="h-1.5 rounded-full overflow-hidden mb-3"
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

      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold"
        style={{ backgroundColor: `${P.sage}22`, color: P.sageDk }}
      >
        {progress.invalidTarget
          ? "—"
          : progress.completed
            ? "Alcanzada"
            : `${progress.percent}% completado`}
      </span>
    </button>
  );
}
