"use client";

import { Button } from "@/components/nido/Button";
import { EmptyState } from "@/components/nido/EmptyState";
import { PullToRefresh } from "@/components/nido/PullToRefresh";
import { Heading, Text } from "@/components/nido/Typography";
import {
  formatCompactMoney,
  formatGoalTargetDate,
  formatWholeMoney,
  goalScopeLabel,
  isFund,
  roundMoney,
  sumMoney,
  type GoalProgress,
  type GoalRow,
} from "@/lib/nido/financial";
import type { DashboardQuery } from "@/lib/nido/use-dashboard";
import { P } from "@/lib/palette";
import { goalVisual } from "./visual";

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
        <div className="px-6 pt-4 space-y-3" aria-busy="true" aria-live="polite">
          <Text size="caption" tone="muted">
            Cargando metas…
          </Text>
          <div className="h-36 rounded-[1.5rem] animate-pulse" style={{ backgroundColor: P.sub }} />
          <div className="h-28 rounded-[1.5rem] animate-pulse" style={{ backgroundColor: P.sub }} />
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
        <div className="px-6 pt-3 pb-6 space-y-4">
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

          <GoalsHero
            fundCount={funds.length}
            metaCount={metas.length}
            totalFunds={totalFunds}
            totalMetas={totalMetas}
          />

          {funds.length > 0 ? (
            <section className="space-y-2">
              <SectionTitle>Fondos</SectionTitle>
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
            </section>
          ) : null}

          {metas.length > 0 ? (
            <section className="space-y-2">
              <SectionTitle>Metas</SectionTitle>
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
            </section>
          ) : null}
        </div>
      )}
    </PullToRefresh>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: P.muted }}>
      {children}
    </p>
  );
}

function GoalsHero({
  fundCount,
  metaCount,
  totalFunds,
  totalMetas,
}: {
  fundCount: number;
  metaCount: number;
  totalFunds: number;
  totalMetas: number;
}) {
  const both = fundCount > 0 && metaCount > 0;
  const onlyMetas = fundCount === 0 && metaCount > 0;
  const total = both ? sumMoney([totalFunds, totalMetas]) : onlyMetas ? totalMetas : totalFunds;
  const label = both ? "Ahorrado" : onlyMetas ? "Total en metas" : "Total en fondos";

  return (
    <div
      className="rounded-[1.5rem] overflow-hidden shadow-sm"
      style={{
        background: onlyMetas
          ? "linear-gradient(135deg, #B87485 0%, #D88D9A 100%)"
          : "linear-gradient(135deg, #255D4D 0%, #2F7D66 100%)",
      }}
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
        <p
          className="relative text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          {label}
        </p>
        <p className="relative mt-1 text-[28px] font-bold font-sans leading-none" style={{ color: "#FFFCFA" }}>
          {formatWholeMoney(total)}
        </p>
        {both ? (
          <div className="relative mt-4 grid grid-cols-2 gap-2">
            <HeroChip
              caption={fundCount === 1 ? "1 fondo" : `${fundCount} fondos`}
              value={totalFunds}
            />
            <HeroChip
              caption={metaCount === 1 ? "1 meta" : `${metaCount} metas`}
              value={totalMetas}
            />
          </div>
        ) : (
          <p className="relative mt-2 text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
            {onlyMetas
              ? metaCount === 1
                ? "1 meta activa"
                : `${metaCount} metas activas`
              : fundCount === 1
                ? "1 fondo activo"
                : `${fundCount} fondos activos`}
          </p>
        )}
      </div>
    </div>
  );
}

function HeroChip({
  caption,
  value,
}: {
  caption: string;
  value: number;
}) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
      <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.5)" }}>
        {caption}
      </p>
      <p className="text-sm font-bold font-sans" style={{ color: "#E8F4EF" }}>
        {formatWholeMoney(value)}
      </p>
    </div>
  );
}

function GoalCard({
  progress,
  onOpen,
}: {
  progress: GoalProgress;
  onOpen: () => void;
}) {
  const fund = isFund(progress);
  const visual = goalVisual(progress.goalType);
  const Icon = visual.Icon;
  const targetLabel = formatGoalTargetDate(progress.targetDate);
  const remaining = progress.invalidTarget || progress.completed
    ? null
    : roundMoney(progress.targetAmount - progress.contributed);
  const statusLabel = progress.invalidTarget
    ? null
    : progress.completed
      ? fund
        ? "Fondo alcanzado"
        : "Meta alcanzada"
      : remaining != null
        ? `Faltan ${formatCompactMoney(remaining)}`
        : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-[1.5rem] p-4 text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ backgroundColor: visual.well }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: P.card }}
        >
          <Icon size={18} strokeWidth={1.75} style={{ color: visual.accentDk }} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-bold leading-tight truncate" style={{ color: P.text }}>
              {progress.name}
            </p>
            <span
              className="flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold"
              style={{ backgroundColor: P.card, color: P.muted }}
            >
              {goalScopeLabel(progress.scope)}
            </span>
          </div>
          {targetLabel ? (
            <p className="text-[10px] mt-0.5" style={{ color: P.muted }}>
              {targetLabel}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-xl font-bold font-sans" style={{ color: P.text }}>
            {formatCompactMoney(progress.contributed)}
          </span>
          <span className="text-[10px] truncate" style={{ color: P.muted }}>
            {progress.invalidTarget ? "ahorrados" : `de ${formatCompactMoney(progress.targetAmount)}`}
          </span>
        </div>
        <span className="text-xs font-bold font-sans flex-shrink-0" style={{ color: visual.accentDk }}>
          {progress.invalidTarget ? "—" : `${progress.percent}%`}
        </span>
      </div>

      <div
        className="mt-2 h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: "rgba(47,42,40,0.08)" }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.invalidTarget ? 0 : progress.percent}
        aria-label={
          progress.invalidTarget
            ? "Sin objetivo"
            : `${progress.percent}% completado`
        }
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${progress.percent}%`,
            background: visual.bar,
          }}
        />
      </div>

      {statusLabel ? (
        <p
          className="mt-2 text-[10px] font-semibold"
          style={{ color: progress.completed ? P.sageDk : P.muted }}
        >
          {statusLabel}
        </p>
      ) : null}
    </button>
  );
}
