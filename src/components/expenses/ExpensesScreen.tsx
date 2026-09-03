"use client";

import { Repeat } from "lucide-react";
import { Button } from "@/components/nido/Button";
import { NavChevron } from "@/components/nido/ClickHint";
import { EmptyState } from "@/components/nido/EmptyState";
import { PullToRefresh } from "@/components/nido/PullToRefresh";
import { TextLink } from "@/components/nido/TextLink";
import { Heading, Text } from "@/components/nido/Typography";
import {
  expenseHasRefunds,
  expensePayerLabel,
  formatCompactMoney,
  formatRelativeActivityDate,
  householdSpent,
  isPersonalExpense,
  isRecurringExpense,
  isSharedExpense,
  netExpense,
  type ExpenseRow,
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

function ExpensesHero({
  spent,
  rangeLabel,
  count,
  sharedSpent,
  personalSpent,
  budget,
}: {
  spent: number;
  rangeLabel: string;
  count: number;
  sharedSpent: number;
  personalSpent: number;
  budget: {
    hasBudget: boolean;
    totalBudget: number;
    remaining: number;
    over: boolean;
    usagePercent: number | null;
  } | null;
}) {
  const chips = [
    {
      label: count === 1 ? "gasto" : "gastos",
      value: String(count),
    },
    sharedSpent > 0
      ? { label: "Compartido", value: formatCompactMoney(sharedSpent) }
      : null,
    personalSpent > 0
      ? { label: "Personal", value: formatCompactMoney(personalSpent) }
      : null,
  ].filter((chip): chip is { label: string; value: string } => chip != null);

  return (
    <div
      className="mx-6 mb-3 rounded-[1.5rem] overflow-hidden"
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
          <div className="flex items-start justify-between mb-2">
            <p
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              Este mes en el Nido
            </p>
            <span className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>
              {rangeLabel}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-[28px] font-bold font-sans text-white leading-none">
              {formatCompactMoney(spent)}
            </span>
            <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
              gastados
            </span>
          </div>
          {chips.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <div
                  key={chip.label}
                  className="rounded-xl px-3 py-2"
                  style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
                >
                  <p className="text-xs font-bold font-sans text-white">{chip.value}</p>
                  <p className="text-[9px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {chip.label}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
          {budget?.hasBudget ? (
            <div className="mt-4">
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, budget.usagePercent ?? 0)}%`,
                    background: budget.over ? "#F0C4B4" : "rgba(255,255,255,0.85)",
                  }}
                />
              </div>
              <div className="flex justify-between mt-1.5 text-[10px]">
                <span style={{ color: "rgba(255,255,255,0.4)" }}>
                  de {formatCompactMoney(budget.totalBudget)} presupuestado
                </span>
                <span
                  className="font-semibold"
                  style={{ color: budget.over ? "#F0C4B4" : "rgba(255,255,255,0.7)" }}
                >
                  {budget.over
                    ? `${formatCompactMoney(Math.abs(budget.remaining))} sobre el plan`
                    : `${formatCompactMoney(budget.remaining)} disponible`}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ExpensesScreen({
  dashboard,
  members,
  onOpenExpense,
  onRegisterExpense,
}: {
  dashboard: DashboardQuery;
  members: HouseholdMemberView[];
  onOpenExpense: (expense: ExpenseRow) => void;
  onRegisterExpense: () => void;
}) {
  const { isLoading, refreshing, error, model, refresh } = dashboard;
  const expenses = model?.periodExpenses ?? [];
  const empty = Boolean(model && expenses.length === 0);
  const sharedSpent = householdSpent(expenses.filter(isSharedExpense));
  const personalSpent = householdSpent(expenses.filter(isPersonalExpense));
  const categories = (model?.budget.categories ?? [])
    .filter((category) => category.spent > 0)
    .slice()
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 6);

  return (
    <PullToRefresh
      onRefresh={refresh}
      refreshing={refreshing}
      className="h-full min-h-0 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden pb-20"
    >
      <div className="px-6 pt-3 pb-2">
        <Heading as="h2" size="h2">
          Gastos
        </Heading>
      </div>

      {isLoading && !model ? (
        <div className="px-6 pt-1 space-y-3" aria-busy="true" aria-live="polite">
          <Text size="caption" tone="muted">
            Cargando gastos…
          </Text>
          <SkeletonBlock className="h-36" />
          <SkeletonBlock className="h-16" />
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

          <ExpensesHero
            spent={model.periodSpent}
            rangeLabel={model.range.label}
            count={expenses.length}
            sharedSpent={sharedSpent}
            personalSpent={personalSpent}
            budget={model.budget}
          />

          {categories.length > 0 ? (
            <div className="flex gap-2 px-6 mb-3 overflow-x-auto [&::-webkit-scrollbar]:hidden">
              {categories.map((category) => (
                <div
                  key={category.categoryId}
                  className="flex-none min-w-[4.75rem] rounded-2xl px-2.5 py-2 text-center"
                  style={{ backgroundColor: P.card }}
                >
                  <div className="text-sm mb-0.5">{category.icon}</div>
                  <div className="text-[9px] mb-0.5 truncate" style={{ color: P.muted }}>
                    {category.name}
                  </div>
                  <div className="text-[10px] font-bold font-sans truncate" style={{ color: P.text }}>
                    {formatCompactMoney(category.spent)}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {empty ? (
            <div className="px-6 pt-1 pb-6">
              <EmptyState
                title="Sin gastos todavía"
                description="Registra tu primer gasto para verlo aquí y en tus totales."
                actionLabel="Registrar un gasto"
                onAction={onRegisterExpense}
              />
            </div>
          ) : (
            <div className="px-6 pt-1 pb-6 space-y-2">
              {expenses.map((expense) => {
                const payer = expensePayerLabel(expense, members);
                const personal = isPersonalExpense(expense);
                const refunded = expenseHasRefunds(expense);
                const net = netExpense(expense.amount, expense.refunds);
                const participantNames = expense.splits
                  .map((split) => firstName(memberName(split.memberId, members)))
                  .filter(Boolean);

                return (
                  <button
                    key={expense.id}
                    type="button"
                    onClick={() => onOpenExpense(expense)}
                    className="w-full flex items-center gap-3 rounded-[1.5rem] p-4 shadow-sm text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ backgroundColor: P.card }}
                  >
                    <div
                      className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{ backgroundColor: personal ? "#FDEEF1" : "#E8F4EF" }}
                    >
                      {expense.category?.icon?.trim() || "💸"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: P.text }}>
                          {expense.description?.trim() || expense.category?.name || "Gasto"}
                        </p>
                        {isRecurringExpense(expense) ? (
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
                        {expense.category?.name ?? "Categoría"}
                        {" · "}
                        {firstName(payer)}
                        {!personal && participantNames.length > 0
                          ? ` · ${participantNames.join(", ")}`
                          : null}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span
                          className="text-[9px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5"
                          style={{
                            backgroundColor: personal ? "#FDEEF1" : "#E8F4EF",
                            color: personal ? P.brnDp : P.sageDk,
                          }}
                        >
                          {personal ? "Personal" : "Compartido"}
                        </span>
                        <span className="text-[10px]" style={{ color: P.muted }}>
                          {formatRelativeActivityDate(expense.occurredAt, expense.createdAt)}
                        </span>
                        {refunded ? (
                          <span className="text-[10px] font-medium" style={{ color: P.sage }}>
                            Con devolución
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className="text-sm font-bold flex-shrink-0 font-sans"
                      style={{ color: P.text }}
                    >
                      {formatCompactMoney(net)}
                    </span>
                    <NavChevron />
                  </button>
                );
              })}
              <Button variant="secondary" onClick={onRegisterExpense}>
                Registrar un gasto
              </Button>
            </div>
          )}
        </>
      ) : null}
    </PullToRefresh>
  );
}
