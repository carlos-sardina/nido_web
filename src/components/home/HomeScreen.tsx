"use client";

import { ChevronRight, Settings, Shield } from "lucide-react";
import type { AuthIdentity } from "@/lib/auth/identity";
import {
  compactBalanceCopy,
  formatCompactMoney,
  formatRelativeActivityDate,
  formatWholeMoney,
  type BudgetItemView,
} from "@/lib/nido/financial";
import type { DashboardQuery } from "@/lib/nido/use-dashboard";
import { formatHomeNidoName } from "@/lib/nido/format-nido-name";
import { P } from "@/lib/palette";
import type { Tab } from "@/lib/types";
import { Button } from "@/components/nido/Button";
import { EmptyState } from "@/components/nido/EmptyState";
import { PullToRefresh } from "@/components/nido/PullToRefresh";
import { Text } from "@/components/nido/Typography";
import { HealthGauge } from "@/components/home/HealthGauge";

const GOAL_STYLES = [
  { color: P.sage, bg: "#E8F4EF" },
  { color: P.brn, bg: "#FDEEF1" },
  { color: P.sageLt, bg: "#EFF5EE" },
  { color: P.warn, bg: "#FAF0EC" },
] as const;

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-[1.5rem] ${className}`}
      style={{ backgroundColor: P.sub }}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="px-6 pt-3 space-y-3" aria-busy="true" aria-live="polite">
      <Text size="caption" tone="muted">
        Cargando tu Nido…
      </Text>
      <SkeletonBlock className="h-36" />
      <SkeletonBlock className="h-40" />
      <SkeletonBlock className="h-24" />
      <SkeletonBlock className="h-28" />
    </div>
  );
}

export function HomeScreen({
  identity,
  householdName,
  dashboard,
  onProfileOpen,
  onSettingsOpen,
  onNavigate,
  onOpenBudgets,
  onOpenIncomes,
  onOpenBudget,
  onCreateBudget,
  onOpenBalance,
  currentUserId,
}: {
  identity: AuthIdentity | null;
  householdName: string;
  dashboard: DashboardQuery;
  onProfileOpen: () => void;
  onSettingsOpen: () => void;
  onNavigate: (tab: Tab) => void;
  onOpenBudgets: () => void;
  onOpenIncomes: () => void;
  onOpenBudget: (budget: BudgetItemView) => void;
  onCreateBudget: () => void;
  onOpenBalance: () => void;
  currentUserId: string | null;
}) {
  const { isLoading, refreshing, error, model, refresh } = dashboard;
  const nidoLabel = householdName ? formatHomeNidoName(householdName) : "";

  return (
    <PullToRefresh
      onRefresh={refresh}
      refreshing={refreshing}
      className="h-full min-h-0 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden pb-20"
    >
      <div className="px-6 pt-3 pb-1 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium" style={{ color: P.muted }}>
            {model?.greeting ?? "Buenos días"}
          </p>
          <h1
            className="text-[22px] font-bold truncate"
            style={{ fontFamily: "Fraunces, serif", color: P.text }}
          >
            {identity ? `${identity.firstName} 👋` : "Hola 👋"}
          </h1>
          {nidoLabel ? (
            <p
              className="text-[11px] mt-0.5 break-words [overflow-wrap:anywhere] line-clamp-2"
              title={nidoLabel}
              style={{ color: P.muted }}
            >
              {nidoLabel}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onSettingsOpen}
            aria-label="Abrir configuración"
            className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ backgroundColor: P.sub }}
          >
            <Settings size={18} strokeWidth={1.75} style={{ color: P.text }} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onProfileOpen}
            aria-label="Abrir perfil"
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm active:scale-95 transition-transform overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ backgroundColor: P.sage }}
          >
            {identity?.avatarUrl ? (
              <img src={identity.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              (identity?.initials ?? "?")
            )}
          </button>
        </div>
      </div>

      {isLoading && !model ? (
        <DashboardSkeleton />
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
      ) : model ? (
        <DashboardBody
          model={model}
          error={error}
          onRetry={() => void refresh()}
          retrying={refreshing}
          onNavigate={onNavigate}
          onOpenBudgets={onOpenBudgets}
          onOpenIncomes={onOpenIncomes}
          onOpenBudget={onOpenBudget}
          onCreateBudget={onCreateBudget}
          onOpenBalance={onOpenBalance}
          currentUserId={currentUserId}
        />
      ) : null}
    </PullToRefresh>
  );
}

function DashboardBody({
  model,
  error,
  onRetry,
  retrying,
  onNavigate,
  onOpenBudgets,
  onOpenIncomes,
  onOpenBudget,
  onCreateBudget,
  onOpenBalance,
  currentUserId,
}: {
  model: NonNullable<DashboardQuery["model"]>;
  error: DashboardQuery["error"];
  onRetry: () => void;
  retrying: boolean;
  onNavigate: (tab: Tab) => void;
  onOpenBudgets: () => void;
  onOpenIncomes: () => void;
  onOpenBudget: (budget: BudgetItemView) => void;
  onCreateBudget: () => void;
  onOpenBalance: () => void;
  currentUserId: string | null;
}) {
  const { health, budget, featuredGoal, activeGoals, activity, empty, range, monthlyBalance } = model;
  const balanceCopy = compactBalanceCopy(monthlyBalance, currentUserId);
  const diff = Math.abs(budget.remaining);

  return (
    <>
      {error ? (
        <div className="mx-6 mb-3 rounded-2xl px-4 py-3" style={{ backgroundColor: P.dangerBg }}>
          <Text size="caption" tone="danger">
            {error.message}
          </Text>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-1 text-caption font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            style={{ color: P.danger }}
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {health.available ? (
        <div
          className="mx-6 mb-3 rounded-[1.5rem] overflow-hidden"
          style={{ background: "linear-gradient(135deg, #255D4D 0%, #2F7D66 100%)" }}
        >
          <div className="p-5">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p
                  className="text-[10px] font-semibold uppercase tracking-widest mb-0.5"
                  style={{ color: "rgba(255,255,255,0.45)" }}
                >
                  Salud Financiera
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: P.sageLt }}>
                    {health.label}
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>
                {range.label}
              </span>
            </div>
            <div className="flex items-end justify-between gap-4">
              <HealthGauge score={health.score} />
              <div className="flex flex-col gap-2">
                {[
                  health.savingsRatePercent != null
                    ? { label: "Tasa ahorro", value: `${health.savingsRatePercent}%` }
                    : null,
                  health.emergencyMonths != null
                    ? { label: "Fondo compart.", value: `${health.emergencyMonths} mes` }
                    : null,
                  health.budgetUsagePercent != null
                    ? { label: "Presupuesto", value: `${health.budgetUsagePercent}%` }
                    : null,
                  health.activeGoalCount > 0
                    ? {
                        label: health.activeGoalCount === 1 ? "meta activa" : "metas activas",
                        value: String(health.activeGoalCount),
                      }
                    : null,
                ]
                  .filter((chip): chip is { label: string; value: string } => chip != null)
                  .slice(0, 2)
                  .map((chip) => (
                    <div
                      key={chip.label}
                      className="rounded-xl px-3 py-2 flex items-center gap-2.5"
                      style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
                    >
                      <span className="text-xs font-bold font-sans" style={{ color: P.sageLt }}>
                        {chip.value}
                      </span>
                      <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {chip.label}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-6 mb-3">
          <div
            className="rounded-[1.5rem] p-5"
            style={{ background: "linear-gradient(135deg, #255D4D 0%, #2F7D66 100%)" }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              Salud Financiera
            </p>
            <p className="text-sm font-semibold text-white mb-1">Aún no hay datos</p>
            <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
              Agrega tus ingresos para tener una mejor visión de su patrimonio.
            </p>
          </div>
        </div>
      )}

      <div className="mx-6 mb-3 rounded-[1.5rem] p-5 shadow-sm" style={{ backgroundColor: P.card }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold" style={{ color: P.text }}>
            Ingresos del mes
          </h3>
          <button
            type="button"
            onClick={onOpenIncomes}
            className="text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            style={{ color: P.brnDk }}
          >
            Ver ingresos →
          </button>
        </div>
        {empty.incomes ? (
          <EmptyState
            plain
            title="Aún no hay ingresos."
            description="Registra un ingreso para ver el total de este mes."
            actionLabel="Ver ingresos"
            onAction={onOpenIncomes}
          />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-[22px] font-bold font-sans" style={{ color: P.text }}>
              {formatCompactMoney(model.periodIncome)}
            </span>
            <span className="text-xs" style={{ color: P.muted }}>
              este mes
            </span>
          </div>
        )}
      </div>

      <div className="mx-6 mb-3 rounded-[1.5rem] p-5 shadow-sm" style={{ backgroundColor: P.card }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold" style={{ color: P.text }}>
            Presupuesto del mes
          </h3>
          {empty.budget ? (
            <span className="text-[10px]" style={{ color: P.muted }}>
              {range.label}
            </span>
          ) : (
            <button
              type="button"
              onClick={onOpenBudgets}
              className="inline-flex items-center gap-0.5 text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              style={{ color: P.brnDk }}
            >
              Ver presupuestos
              <ChevronRight size={12} aria-hidden="true" />
            </button>
          )}
        </div>
        {empty.budget ? (
          <EmptyState
            plain
            title="Sin presupuesto este mes"
            description="Crea un límite por categoría. El gasto se calcula de tus gastos reales."
            actionLabel="Crear un presupuesto"
            onAction={onCreateBudget}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={onOpenBudgets}
              className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
            >
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-[22px] font-bold font-sans" style={{ color: P.text }}>
                  {formatCompactMoney(budget.totalSpent)}
                </span>
                {budget.hasBudget ? (
                  <span className="text-xs" style={{ color: P.muted }}>
                    de {formatCompactMoney(budget.totalBudget)}
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: P.muted }}>
                    gastados este mes
                  </span>
                )}
              </div>
              {budget.hasBudget ? (
                <>
                  <div className="h-2 rounded-full overflow-hidden mb-2" style={{ backgroundColor: P.sub }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, budget.usagePercent ?? 0)}%`,
                        background: budget.over
                          ? P.danger
                          : `linear-gradient(90deg, ${P.sage}, ${P.sageDk})`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span style={{ color: P.muted }}>Gastado este mes</span>
                    <span
                      className="font-semibold"
                      style={{ color: budget.over ? P.danger : P.sageDk }}
                    >
                      {budget.over
                        ? `$${diff.toLocaleString("es-MX")} sobre el plan`
                        : `$${diff.toLocaleString("es-MX")} disponible`}
                    </span>
                  </div>
                </>
              ) : null}
            </button>
            {budget.categories.length > 0 ? (
              <div className="flex gap-2 mt-4 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                {budget.categories.slice(0, 5).map((category) => {
                  const item = budget.items.find((row) => row.categoryId === category.categoryId);
                  return (
                    <button
                      key={category.categoryId}
                      type="button"
                      onClick={() => {
                        if (item) onOpenBudget(item);
                        else onOpenBudgets();
                      }}
                      aria-label={`Ver presupuesto de ${category.name}`}
                      className="flex-shrink-0 rounded-xl px-3 py-2 text-center min-w-[68px] active:scale-[0.97] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{ backgroundColor: P.sub }}
                    >
                      <div className="text-sm mb-0.5">{category.icon}</div>
                      <div className="text-[9px] mb-0.5" style={{ color: P.muted }}>
                        {category.name.split(" ")[0]}
                      </div>
                      <div
                        className="text-[10px] font-bold font-sans"
                        style={{
                          color:
                            category.budget > 0 && category.spent > category.budget
                              ? P.danger
                              : P.text,
                        }}
                      >
                        {formatCompactMoney(category.spent)}
                      </div>
                      <span
                        className="mt-1 inline-flex items-center justify-center gap-0.5 text-[9px] font-semibold"
                        style={{ color: P.brnDk }}
                      >
                        Ver
                        <ChevronRight size={10} aria-hidden="true" />
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="mx-6 mb-3">
      <button
        type="button"
        onClick={onOpenBalance}
        className="w-full rounded-[1.5rem] p-5 shadow-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ backgroundColor: P.card }}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold" style={{ color: P.text }}>
            Balance
          </h3>
          <span className="text-[10px] font-semibold" style={{ color: P.brnDk }}>
            Ver balance →
          </span>
        </div>
        <p
          className="text-sm font-semibold"
          style={{ color: balanceCopy.hasObligation ? P.text : P.muted }}
        >
          {balanceCopy.headline}
        </p>
      </button>
      </div>

      {featuredGoal ? (
        <div className="mx-6 mb-3 rounded-[1.5rem] p-4 shadow-sm" style={{ backgroundColor: P.card }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: "#E8F4EF" }}
              >
                <Shield size={17} style={{ color: P.sageDk }} />
              </div>
              <div>
                <p className="text-[10px]" style={{ color: P.muted }}>
                  {featuredGoal.name}
                </p>
                <p className="text-base font-bold font-sans" style={{ color: P.text }}>
                  {formatWholeMoney(featuredGoal.contributed)}
                </p>
              </div>
            </div>
            {featuredGoal.emergencyMonths != null ? (
              <div className="text-right">
                <p className="text-[10px]" style={{ color: P.muted }}>
                  Cubre
                </p>
                <p className="text-sm font-bold font-sans" style={{ color: P.sageDk }}>
                  {featuredGoal.emergencyMonths} {featuredGoal.emergencyMonths === 1 ? "mes" : "meses"}
                </p>
              </div>
            ) : null}
          </div>
          <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: P.sub }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${featuredGoal.percent}%`,
                background: `linear-gradient(90deg, ${P.sage}, ${P.sageDk})`,
              }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[9px]" style={{ color: P.muted }}>
            <span>
              {formatCompactMoney(featuredGoal.contributed)} de{" "}
              {featuredGoal.invalidTarget ? "—" : formatCompactMoney(featuredGoal.targetAmount)}
            </span>
            <span>{featuredGoal.invalidTarget ? "—" : `${featuredGoal.percent}%`}</span>
          </div>
        </div>
      ) : null}

      <div className="mb-3">
        <div className="flex items-center justify-between px-6 mb-2">
          <h3 className="text-xs font-semibold" style={{ color: P.text }}>
            Metas y fondos
          </h3>
          <button
            type="button"
            onClick={() => onNavigate("goals")}
            className="text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            style={{ color: P.brnDk }}
          >
            Ver todas →
          </button>
        </div>
        {empty.goals ? (
          <div className="px-6">
            <EmptyState
              title="¿Tienen algo en mente?"
              description="Crea un fondo para cubrir gastos o una meta para algo que quieren alcanzar."
              actionLabel="Ver metas y fondos"
              onAction={() => onNavigate("goals")}
            />
          </div>
        ) : (
          <div className="flex gap-3 px-6 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-1">
            {activeGoals.map((goal, index) => {
              const style = GOAL_STYLES[index % GOAL_STYLES.length];
              return (
                <div
                  key={goal.id}
                  className="flex-shrink-0 w-36 rounded-2xl p-3.5"
                  style={{ backgroundColor: style.bg }}
                >
                  <div className="text-2xl mb-1.5">{goal.goalType === "purchase" ? "🎯" : "🛡️"}</div>
                  <p className="text-[10px] font-semibold leading-tight mb-2" style={{ color: P.text }}>
                    {goal.name}
                  </p>
                  <div
                    className="h-1 rounded-full overflow-hidden mb-1"
                    style={{ backgroundColor: "rgba(0,0,0,0.06)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${goal.percent}%`, backgroundColor: style.color }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] font-sans" style={{ color: P.muted }}>
                    <span>{goal.invalidTarget ? "—" : `${goal.percent}%`}</span>
                    <span>
                      {goal.targetDate
                        ? new Intl.DateTimeFormat("es-MX", {
                            month: "short",
                            year: "numeric",
                            timeZone: "UTC",
                          }).format(new Date(`${goal.targetDate}T00:00:00Z`))
                        : formatCompactMoney(goal.contributed)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-6 mb-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold" style={{ color: P.text }}>
            Actividad reciente
          </h3>
          <button
            type="button"
            onClick={() => onNavigate("activity")}
            className="text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            style={{ color: P.brnDk }}
          >
            Ver todo →
          </button>
        </div>
        {empty.activity ? (
          <EmptyState
            title="Todo tranquilo por aquí."
            description="Registra tu primer gasto para comenzar a ver tu actividad."
          />
        ) : (
          <div className="space-y-2">
            {activity.slice(0, 3).map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-2xl p-3 shadow-sm"
                style={{ backgroundColor: P.card }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                  style={{ backgroundColor: P.sub }}
                >
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: P.text }}>
                    {item.title}
                  </p>
                  <p className="text-[10px]" style={{ color: P.muted }}>
                    {formatRelativeActivityDate(item.date, item.createdAt)}
                  </p>
                </div>
                <span className="text-xs font-semibold flex-shrink-0 font-sans" style={{ color: P.text }}>
                  {formatCompactMoney(item.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
