"use client";

import { useRef, useState, type ReactNode } from "react";
import type { BudgetCreateTarget } from "@/components/flows/BudgetFlow";
import { Button } from "@/components/nido/Button";
import { ScopeTag } from "@/components/nido/ScopeTag";
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
  personalBudgetOwnerLabel,
  type BudgetCategoryView,
  type BudgetItemView,
  type BudgetPlanSummary,
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

function personalCaption(item: BudgetItemView, currentUserId: string | null): string {
  return personalBudgetOwnerLabel(item.memberId, item.memberName, currentUserId);
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

            {nidoBudgets.length > 0 || personalBudgets.length > 0 ? (
              <PlanSlider
                label="Progreso de presupuestos"
                slides={[
                  {
                    id: "nido",
                    label: "Plan del Nido",
                    card: (
                      <PlanHero
                        kicker="El plan del Nido"
                        trailing={model.range.label}
                        amount={
                          summary?.nidoPlan.hasBudget
                            ? summary.nidoPlan.totalSpent
                            : 0
                        }
                        caption={
                          summary?.nidoPlan.hasBudget
                            ? `de ${formatCompactMoney(summary.nidoPlan.totalBudget)}`
                            : "sin presupuestos del Nido"
                        }
                        plan={summary?.nidoPlan.hasBudget ? summary.nidoPlan : null}
                        emptyHint={
                          summary?.nidoPlan.hasBudget
                            ? null
                            : "Este mes el plan del Nido todavía no tiene límites."
                        }
                        chips={
                          <>
                            <HeroChip
                              value={String(nidoBudgets.length)}
                              label={nidoBudgets.length === 1 ? "presupuesto" : "presupuestos"}
                            />
                            {unbudgeted.length > 0 ? (
                              <HeroChip
                                value={String(unbudgeted.length)}
                                label={unbudgeted.length === 1 ? "sin presupuesto" : "sin presupuesto"}
                              />
                            ) : null}
                          </>
                        }
                      />
                    ),
                  },
                  {
                    id: "inclusive",
                    label: "Plan con personales",
                    card: (
                      <PlanHero
                        kicker="Nido y personales"
                        trailing={model.range.label}
                        tone="deep"
                        amount={
                          summary?.inclusivePlan.hasBudget
                            ? summary.inclusivePlan.totalSpent
                            : 0
                        }
                        caption={
                          summary?.inclusivePlan.hasBudget
                            ? `de ${formatCompactMoney(summary.inclusivePlan.totalBudget)}`
                            : "sin presupuestos"
                        }
                        plan={summary?.inclusivePlan.hasBudget ? summary.inclusivePlan : null}
                        emptyHint={null}
                        chips={
                          <>
                            <HeroChip
                              value={String(nidoBudgets.length)}
                              label="del Nido"
                            />
                            <HeroChip
                              value={String(personalBudgets.length)}
                              label={personalBudgets.length === 1 ? "personal" : "personales"}
                            />
                          </>
                        }
                      />
                    ),
                  },
                ]}
              />
            ) : (
              <EmeraldHero>
                <HeroKicker trailing={model.range.label}>El plan del Nido</HeroKicker>
                <div className="mb-3">
                  <HeroAmount
                    value={formatCompactMoney(summary?.totalSpent ?? model.periodSpent)}
                    caption="gastados"
                  />
                </div>
                {unbudgeted.length > 0 ? (
                  <HeroChip
                    value={String(unbudgeted.length)}
                    label={unbudgeted.length === 1 ? "sin presupuesto" : "sin presupuesto"}
                  />
                ) : null}
              </EmeraldHero>
            )}

            {empty ? (
              <EmptyState
                title="Sin presupuestos este mes"
                description="Cada presupuesto tiene nombre y límite. El gasto se calcula de tus gastos reales."
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

function PlanHero({
  kicker,
  trailing,
  tone = "emerald",
  amount,
  caption,
  plan,
  emptyHint,
  chips,
}: {
  kicker: string;
  trailing: string;
  tone?: "emerald" | "deep";
  amount: number;
  caption: string;
  plan: BudgetPlanSummary | null;
  emptyHint: string | null;
  chips: ReactNode;
}) {
  return (
    <EmeraldHero tone={tone} className="h-full">
      <HeroKicker trailing={trailing}>{kicker}</HeroKicker>
      <div className="mb-3">
        <HeroAmount value={formatCompactMoney(amount)} caption={caption} />
      </div>
      <div className="flex flex-wrap gap-2">{chips}</div>
      {plan ? <PlanProgress plan={plan} /> : null}
      {emptyHint ? (
        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
          {emptyHint}
        </p>
      ) : null}
    </EmeraldHero>
  );
}

function PlanProgress({ plan }: { plan: BudgetPlanSummary }) {
  const width = Math.min(100, Math.max(0, plan.usagePercent ?? 0));
  return (
    <div className="mt-4">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={width}
        aria-label={plan.usagePercent != null ? `${plan.usagePercent}% del plan` : "Sin plan"}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${width}%`,
            background: plan.over ? "#F0C4B4" : "rgba(255,255,255,0.85)",
          }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px]">
        <span style={{ color: "rgba(255,255,255,0.4)" }}>
          {plan.over ? "Sobre el plan" : "Disponible"}
          {plan.usagePercent != null ? ` · ${plan.usagePercent}%` : ""}
        </span>
        <span
          className="font-semibold"
          style={{ color: plan.over ? "#F0C4B4" : "rgba(255,255,255,0.7)" }}
        >
          {plan.over
            ? `${formatCompactMoney(Math.abs(plan.remaining))} de más`
            : formatCompactMoney(plan.remaining)}
        </span>
      </div>
    </div>
  );
}

function PlanSlider({
  label,
  slides,
}: {
  label: string;
  slides: { id: string; label: string; card: ReactNode }[];
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  function syncIndex(el: HTMLDivElement) {
    const cards = [...el.children] as HTMLElement[];
    const center = el.scrollLeft + el.clientWidth / 2;
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    cards.forEach((card, i) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const distance = Math.abs(cardCenter - center);
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    });
    setIndex((current) => (current === nearest ? current : nearest));
  }

  function scrollToIndex(next: number) {
    const el = scrollerRef.current;
    const card = el?.children.item(next) as HTMLElement | null;
    if (!el || !card) return;
    el.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
    setIndex(next);
  }

  return (
    <div>
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ touchAction: "pan-x" }}
        role="region"
        aria-roledescription="carrusel"
        aria-label={label}
        tabIndex={0}
        onScroll={(event) => syncIndex(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            scrollToIndex(Math.min(index + 1, slides.length - 1));
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            scrollToIndex(Math.max(index - 1, 0));
          }
        }}
      >
        {slides.map((slide) => (
          <div
            key={slide.id}
            data-plan-slide=""
            className="w-[88%] shrink-0 snap-start"
            role="group"
            aria-roledescription="diapositiva"
            aria-label={slide.label}
          >
            {slide.card}
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex justify-center gap-1.5" role="tablist" aria-label={label}>
        {slides.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={slide.label}
            onClick={() => scrollToIndex(i)}
            className="h-1.5 rounded-full transition-all"
            style={{
              width: i === index ? 16 : 6,
              backgroundColor: i === index ? P.sage : P.sub,
            }}
          />
        ))}
      </div>
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
              <span className="inline-block mt-1">
                <ScopeTag
                  kind={personal ? "personal" : "nido"}
                  label={personal ? who ?? "Personal" : "Nido"}
                />
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
        No entran en la barra del plan. Créales un límite para incluirlos.
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
