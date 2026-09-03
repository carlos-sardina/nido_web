"use client";

import type { BudgetCreateTarget } from "@/components/flows/BudgetFlow";
import { Button } from "@/components/nido/Button";
import { NavChevron } from "@/components/nido/ClickHint";
import { EmeraldHero, HeroAmount, HeroChip, HeroKicker } from "@/components/nido/DecoratedCard";
import { EmptyState } from "@/components/nido/EmptyState";
import { PullToRefresh } from "@/components/nido/PullToRefresh";
import { BackLink } from "@/components/nido/Screen";
import { TextLink } from "@/components/nido/TextLink";
import { Heading, Text } from "@/components/nido/Typography";
import {
  formatCompactMoney,
  formatMonthLabel,
  isNidoBudget,
  isPersonalBudget,
  type BudgetCategoryView,
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

function firstName(name: string | null): string | null {
  if (!name?.trim()) return null;
  return name.trim().split(/\s+/).filter(Boolean)[0] ?? name;
}

function personalCaption(item: BudgetItemView, currentUserId: string | null): string {
  if (item.memberId && item.memberId === currentUserId) return "Tú";
  return firstName(item.memberName) ?? "Personal";
}

function consumptionCaption(item: BudgetItemView): string {
  const percent = item.usagePercent != null ? `${item.usagePercent}%` : null;
  if (item.over) {
    const over = `Restante ${formatCompactMoney(item.remaining)}`;
    return percent ? `${percent} · ${over}` : over;
  }
  if (item.nearLimit) {
    const near = `Cerca del límite · ${formatCompactMoney(item.remaining)} restante`;
    return percent ? `${percent} · ${near}` : near;
  }
  const rest = `${formatCompactMoney(item.remaining)} restante · ${periodLabel(item)}`;
  return percent ? `${percent} · ${rest}` : rest;
}

export function BudgetScreen({
  dashboard,
  currentUserId,
  onClose,
  onOpenBudget,
  onCreateBudget,
  onCopyPreviousMonthBudgets,
}: {
  dashboard: DashboardQuery;
  currentUserId: string | null;
  onClose: () => void;
  onOpenBudget: (budget: BudgetItemView) => void;
  onCreateBudget: (category?: BudgetCreateTarget) => void;
  onCopyPreviousMonthBudgets?: () => void;
}) {
  const { isLoading, refreshing, error, model, refresh } = dashboard;
  const budgets = model?.periodBudgets ?? [];
  const nidoBudgets = budgets.filter(isNidoBudget);
  const personalBudgets = budgets.filter(isPersonalBudget);
  const unbudgeted = model?.budget.unbudgetedCategories ?? [];
  const empty = Boolean(model && budgets.length === 0 && unbudgeted.length === 0);
  const summary = model?.budget;

  return (
    <div className="absolute inset-0 z-30 flex flex-col overflow-hidden" style={{ backgroundColor: P.bgL }}>
      <div className="relative z-10 shrink-0 px-6 pt-[max(0.75rem,env(safe-area-inset-top))]" style={{ backgroundColor: P.bgL }}>
        <BackLink onClick={onClose} label="Cerrar" />
      </div>
      <PullToRefresh
        onRefresh={refresh}
        refreshing={refreshing}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden pb-[var(--app-screen-bottom)]"
      >
        <div className="px-6 pb-2">
          <Heading as="h2" size="h2">
            Presupuestos
          </Heading>
        </div>

        {isLoading && !model ? (
          <div className="px-6 pt-1 space-y-3" aria-busy="true" aria-live="polite">
            <Text size="caption" tone="muted">
              Cargando presupuestos…
            </Text>
            <div className="h-36 rounded-[1.5rem] animate-pulse" style={{ backgroundColor: P.sub }} />
            <div className="h-16 rounded-[1.5rem] animate-pulse" style={{ backgroundColor: P.sub }} />
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
        ) : model ? (
          <div className="px-6 pt-1 pb-6 space-y-3">
            {error ? (
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: P.dangerBg }}>
                <Text size="caption" tone="danger">
                  {error.message}
                </Text>
                <TextLink
                  tone="danger"
                  disabled={refreshing}
                  className="mt-1 px-0 min-h-0 h-auto text-caption"
                  onClick={() => void refresh()}
                >
                  Reintentar
                </TextLink>
              </div>
            ) : null}

            <EmeraldHero>
              <HeroKicker trailing={model.range.label}>El plan del Nido</HeroKicker>
              <div className="mb-3">
                <HeroAmount
                  value={formatCompactMoney(summary?.totalSpent ?? model.periodSpent)}
                  caption={summary?.hasBudget ? `de ${formatCompactMoney(summary.totalBudget)}` : "gastados"}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <HeroChip
                  value={String(nidoBudgets.length)}
                  label={nidoBudgets.length === 1 ? "presupuesto" : "presupuestos"}
                />
                {personalBudgets.length > 0 ? (
                  <HeroChip
                    value={String(personalBudgets.length)}
                    label={personalBudgets.length === 1 ? "personal" : "personales"}
                  />
                ) : null}
                {unbudgeted.length > 0 ? (
                  <HeroChip
                    value={String(unbudgeted.length)}
                    label={unbudgeted.length === 1 ? "sin presupuesto" : "sin presupuesto"}
                  />
                ) : null}
              </div>
              {summary?.hasBudget ? (
                <div className="mt-4">
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, summary.usagePercent ?? 0)}%`,
                        background: summary.over ? "#F0C4B4" : "rgba(255,255,255,0.85)",
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5 text-[10px]">
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>
                      {summary.over ? "Sobre el plan" : "Disponible"}
                    </span>
                    <span
                      className="font-semibold"
                      style={{ color: summary.over ? "#F0C4B4" : "rgba(255,255,255,0.7)" }}
                    >
                      {summary.over
                        ? `${formatCompactMoney(Math.abs(summary.remaining))} de más`
                        : formatCompactMoney(summary.remaining)}
                    </span>
                  </div>
                </div>
              ) : null}
            </EmeraldHero>

            {empty ? (
              <EmptyState
                title="Sin presupuestos este mes"
                description="Crea un límite por categoría. El gasto se calcula de tus gastos reales."
                actionLabel="Crear un presupuesto"
                onAction={onCreateBudget}
                secondaryActionLabel={onCopyPreviousMonthBudgets ? "Copiar del mes pasado" : undefined}
                onSecondaryAction={onCopyPreviousMonthBudgets}
              />
            ) : (
              <>
                {nidoBudgets.length > 0 || personalBudgets.length > 0 ? (
                  <>
                    <BudgetSection
                      title="Presupuestos del Nido"
                      emptyLabel="No hay presupuestos del Nido este mes."
                      items={nidoBudgets}
                      currentUserId={currentUserId}
                      onOpenBudget={onOpenBudget}
                    />
                    <BudgetSection
                      title="Presupuestos personales"
                      emptyLabel="No hay presupuestos personales visibles este mes."
                      items={personalBudgets}
                      currentUserId={currentUserId}
                      onOpenBudget={onOpenBudget}
                    />
                  </>
                ) : null}
                {unbudgeted.length > 0 ? (
                  <UnbudgetedSection items={unbudgeted} onCreateBudget={onCreateBudget} />
                ) : null}
                <Button variant="secondary" onClick={() => onCreateBudget()}>
                  {budgets.length === 0 ? "Crear un presupuesto" : "Crear otro presupuesto"}
                </Button>
                {budgets.length === 0 && onCopyPreviousMonthBudgets ? (
                  <Button variant="ghost" onClick={onCopyPreviousMonthBudgets}>
                    Copiar del mes pasado
                  </Button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </PullToRefresh>
    </div>
  );
}

function BudgetSection({
  title,
  emptyLabel,
  items,
  currentUserId,
  onOpenBudget,
}: {
  title: string;
  emptyLabel: string;
  items: BudgetItemView[];
  currentUserId: string | null;
  onOpenBudget: (budget: BudgetItemView) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: P.muted }}>
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-[11px]" style={{ color: P.muted }}>
          {emptyLabel}
        </p>
      ) : (
        items.map((item) => (
          <BudgetCard
            key={item.id}
            item={item}
            currentUserId={currentUserId}
            onOpen={() => onOpenBudget(item)}
          />
        ))
      )}
    </div>
  );
}

function BudgetCard({
  item,
  currentUserId,
  onOpen,
}: {
  item: BudgetItemView;
  currentUserId: string | null;
  onOpen: () => void;
}) {
  const ratio = Math.min(100, item.usagePercent ?? 0);
  const personal = isPersonalBudget(item);
  const who = personal ? personalCaption(item, currentUserId) : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-[1.5rem] p-4 shadow-sm text-left active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ backgroundColor: P.card }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0"
          style={{ backgroundColor: personal ? "#FDEEF1" : "#E8F4EF" }}
        >
          {item.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <div className="min-w-0">
              <span className="text-sm font-semibold truncate block" style={{ color: P.text }}>
                {item.name}
              </span>
              <span
                className="inline-block mt-1 text-[9px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5"
                style={{
                  backgroundColor: personal ? "#FDEEF1" : "#E8F4EF",
                  color: personal ? P.brnDp : P.sageDk,
                }}
              >
                {personal ? who ?? "Personal" : "Nido"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span
                className="text-sm font-bold font-sans"
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
            {consumptionCaption(item)}
          </p>
        </div>
        <NavChevron />
      </div>
    </button>
  );
}

function UnbudgetedSection({
  items,
  onCreateBudget,
}: {
  items: BudgetCategoryView[];
  onCreateBudget: (category?: BudgetCreateTarget) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: P.warn }}>
        Gastos sin presupuesto
      </p>
      <p className="text-[11px]" style={{ color: P.muted }}>
        Cuentan en el total del mes. Créales un límite para verlos en el plan.
      </p>
      {items.map((item) => (
        <UnbudgetedCard
          key={item.categoryId}
          item={item}
          onCreate={() =>
            onCreateBudget({
              categoryId: item.categoryId,
              name: item.name,
              icon: item.icon,
            })
          }
        />
      ))}
    </div>
  );
}

function UnbudgetedCard({
  item,
  onCreate,
}: {
  item: BudgetCategoryView;
  onCreate: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCreate}
      className="w-full rounded-[1.5rem] p-4 text-left active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        backgroundColor: P.warnBg,
        boxShadow: `inset 0 0 0 1px rgba(201, 120, 93, 0.28)`,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0"
          style={{ backgroundColor: "#F6E4DC" }}
        >
          {item.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <div className="min-w-0">
              <span className="text-sm font-semibold truncate block" style={{ color: P.text }}>
                {item.name}
              </span>
              <span
                className="inline-block mt-1 text-[9px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5"
                style={{ backgroundColor: "#F6E4DC", color: P.warn }}
              >
                Sin presupuesto
              </span>
            </div>
            <span className="text-sm font-bold font-sans flex-shrink-0" style={{ color: P.warn }}>
              {formatCompactMoney(item.spent)}
            </span>
          </div>
          <p className="text-[10px]" style={{ color: P.warn }}>
            Crear presupuesto
          </p>
        </div>
        <NavChevron />
      </div>
    </button>
  );
}
