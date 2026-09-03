"use client";

import { Repeat } from "lucide-react";
import { Button } from "@/components/nido/Button";
import { NavChevron } from "@/components/nido/ClickHint";
import {
  EmeraldHero,
  HeroAmount,
  HeroChip,
  HeroKicker,
  SagePlaceCard,
} from "@/components/nido/DecoratedCard";
import { EmptyState } from "@/components/nido/EmptyState";
import { PullToRefresh } from "@/components/nido/PullToRefresh";
import { BackLink } from "@/components/nido/Screen";
import { TextLink } from "@/components/nido/TextLink";
import { Heading, Text } from "@/components/nido/Typography";
import {
  formatCompactMoney,
  formatRelativeActivityDate,
  isConfirmedFromRecurring,
  periodIncomeTotal,
  type IncomeRow,
} from "@/lib/nido/financial";
import type { DashboardQuery } from "@/lib/nido/use-dashboard";
import type { HouseholdMemberView } from "@/lib/nido/types";
import { P } from "@/lib/palette";

function memberName(
  userId: string,
  members: HouseholdMemberView[],
  fallback?: string | null,
): string {
  return members.find((member) => member.userId === userId)?.displayName
    ?? fallback
    ?? "Un miembro";
}

function firstName(name: string): string {
  return name.split(/\s+/).filter(Boolean)[0] ?? name;
}

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-[1.5rem] ${className}`}
      style={{ backgroundColor: P.sub }}
    />
  );
}

export function IncomesScreen({
  dashboard,
  members,
  onClose,
  onOpenIncome,
  onRegisterIncome,
  onOpenRecurring,
}: {
  dashboard: DashboardQuery;
  members: HouseholdMemberView[];
  onClose: () => void;
  onOpenIncome: (income: IncomeRow) => void;
  onRegisterIncome: () => void;
  onOpenRecurring: () => void;
}) {
  const { isLoading, refreshing, error, model, refresh } = dashboard;
  const incomes = model?.periodIncomes ?? [];
  const empty = Boolean(model && incomes.length === 0);
  const memberChips = members
    .map((member) => {
      const amount = periodIncomeTotal(incomes.filter((row) => row.memberId === member.userId));
      return amount > 0
        ? { id: member.userId, label: firstName(member.displayName), value: formatCompactMoney(amount) }
        : null;
    })
    .filter((chip): chip is { id: string; label: string; value: string } => chip != null);

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
            Ingresos
          </Heading>
        </div>

        {isLoading && !model ? (
          <div className="px-6 pt-1 space-y-3" aria-busy="true" aria-live="polite">
            <Text size="caption" tone="muted">
              Cargando ingresos…
            </Text>
            <SkeletonBlock className="h-36" />
            <SkeletonBlock className="h-16" />
            <SkeletonBlock className="h-16" />
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
          <>
            {error ? (
              <div className="mx-6 mb-3 rounded-2xl px-4 py-3" style={{ backgroundColor: P.dangerBg }}>
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

            <div className="px-6 mb-3">
              <EmeraldHero>
                <HeroKicker trailing={model.range.label}>Entrada al Nido</HeroKicker>
                <div className="mb-3">
                  <HeroAmount value={formatCompactMoney(model.periodIncome)} caption="este mes" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <HeroChip
                    value={String(incomes.length)}
                    label={incomes.length === 1 ? "ingreso" : "ingresos"}
                  />
                  {memberChips.map((chip) => (
                    <HeroChip key={chip.id} value={chip.value} label={chip.label} />
                  ))}
                </div>
              </EmeraldHero>
            </div>

            <div className="px-6 mb-3">
              <SagePlaceCard
                eyebrow="Se confirman solos"
                title="Recurrencias"
                icon={<Repeat size={18} strokeWidth={1.75} color="#E8F4EF" aria-hidden="true" />}
                onClick={onOpenRecurring}
              />
            </div>

            {empty ? (
              <div className="px-6 pt-1 pb-6">
                <EmptyState
                  title="Sin ingresos todavía"
                  description="Registra tu primer ingreso para verlo aquí y en tus totales."
                  actionLabel="Registrar un ingreso"
                  onAction={onRegisterIncome}
                />
              </div>
            ) : (
              <div className="px-6 pt-1 pb-6 space-y-2">
                {incomes.map((income) => {
                  const owner = memberName(income.memberId, members, income.member?.displayName);

                  return (
                    <button
                      key={income.id}
                      type="button"
                      onClick={() => onOpenIncome(income)}
                      className="w-full flex items-center gap-3 rounded-[1.5rem] p-4 shadow-sm text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{ backgroundColor: P.card }}
                    >
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0"
                        style={{ backgroundColor: "#E8F4EF" }}
                      >
                        {income.category?.icon?.trim() || "💰"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: P.text }}>
                            {income.description?.trim() || income.category?.name || "Ingreso"}
                          </p>
                          {isConfirmedFromRecurring(income) ? (
                            <Repeat
                              size={12}
                              strokeWidth={2}
                              className="flex-shrink-0"
                              style={{ color: P.sage }}
                              aria-label="Recurrente"
                            />
                          ) : null}
                        </div>
                        <p className="text-[10px] mt-0.5 truncate" style={{ color: P.muted }}>
                          {income.category?.name ?? "Categoría"}
                          {" · "}
                          {firstName(owner)}
                        </p>
                        <p className="text-[10px] mt-1.5" style={{ color: P.muted }}>
                          {formatRelativeActivityDate(income.occurredAt, income.createdAt)}
                        </p>
                      </div>
                      <span
                        className="text-sm font-bold flex-shrink-0 font-sans"
                        style={{ color: P.sageDk }}
                      >
                        {formatCompactMoney(income.amount)}
                      </span>
                      <NavChevron />
                    </button>
                  );
                })}
                <Button variant="secondary" onClick={onRegisterIncome}>
                  Registrar un ingreso
                </Button>
              </div>
            )}
          </>
        ) : null}
      </PullToRefresh>
    </div>
  );
}
