"use client";

import { Button } from "@/components/nido/Button";
import { EmptyState } from "@/components/nido/EmptyState";
import { Heading, Text } from "@/components/nido/Typography";
import {
  formatCompactMoney,
  formatRelativeActivityDate,
  isPersonalExpense,
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
  const { isLoading, error, model, refresh } = dashboard;
  const expenses = model?.periodExpenses ?? [];
  const empty = Boolean(model && expenses.length === 0);

  return (
    <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:hidden">
      <div className="px-6 pt-3 pb-1">
        <Heading as="h2" size="h2">
          Gastos
        </Heading>
        <Text size="caption" tone="muted" className="mt-1">
          {model?.range.label ?? "Este mes"}
        </Text>
      </div>

      {isLoading && !model ? (
        <div className="px-6 pt-4" aria-busy="true" aria-live="polite">
          <Text size="caption" tone="muted">
            Cargando gastos…
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
            title="Sin gastos todavía"
            description="Registra tu primer gasto para verlo aquí y en tus totales."
            actionLabel="Registrar un gasto"
            onAction={onRegisterExpense}
          />
        </div>
      ) : (
        <div className="px-6 pt-3 pb-6 space-y-2">
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
          {expenses.map((expense) => {
            const payer = memberName(expense.payerId, members, expense.payer?.displayName);
            const personal = isPersonalExpense(expense);
            const participantNames = expense.splits
              .map((split) => firstName(memberName(split.memberId, members)))
              .filter(Boolean);

            return (
              <button
                key={expense.id}
                type="button"
                onClick={() => onOpenExpense(expense)}
                className="w-full flex items-center gap-3 rounded-2xl p-4 shadow-sm text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ backgroundColor: P.card }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                  style={{ backgroundColor: P.sub }}
                >
                  {expense.category?.icon?.trim() || "💸"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: P.text }}>
                    {expense.description?.trim() || expense.category?.name || "Gasto"}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: P.muted }}>
                    {expense.category?.name ?? "Categoría"}
                    {" · "}
                    {personal ? "Personal" : "Compartido"}
                    {" · "}
                    {firstName(payer)}
                    {!personal && participantNames.length > 0
                      ? ` · ${participantNames.join(", ")}`
                      : null}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: P.muted }}>
                    {formatRelativeActivityDate(expense.occurredAt, expense.createdAt)}
                  </p>
                </div>
                <span
                  className="text-xs font-semibold flex-shrink-0 font-sans"
                  style={{ color: P.text }}
                >
                  {formatCompactMoney(expense.amount)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
