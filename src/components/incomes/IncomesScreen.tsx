"use client";

import { Button } from "@/components/nido/Button";
import { EmptyState } from "@/components/nido/EmptyState";
import { PullToRefresh } from "@/components/nido/PullToRefresh";
import { BackLink } from "@/components/nido/Screen";
import { TextLink } from "@/components/nido/TextLink";
import { Heading, Text } from "@/components/nido/Typography";
import {
  formatCompactMoney,
  formatRelativeActivityDate,
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

  return (
    <div className="absolute inset-0 z-30" style={{ backgroundColor: P.bgL }}>
      <PullToRefresh
        onRefresh={refresh}
        refreshing={refreshing}
        className="h-full min-h-0 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden"
      >
        <div className="px-6 pt-3 pb-1">
          <BackLink onClick={onClose} label="Cerrar" />
          <Heading as="h2" size="h2">
            Ingresos
          </Heading>
          <Text size="caption" tone="muted" className="mt-1">
            {model?.range.label ?? "Este mes"}
          </Text>
          <TextLink className="mt-1 px-0 min-h-9" onClick={onOpenRecurring}>
            Recurrencias
          </TextLink>
        </div>

        {isLoading && !model ? (
          <div className="px-6 pt-4" aria-busy="true" aria-live="polite">
            <Text size="caption" tone="muted">
              Cargando ingresos…
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
              title="Sin ingresos todavía"
              description="Registra tu primer ingreso para verlo aquí y en tus totales."
              actionLabel="Registrar un ingreso"
              onAction={onRegisterIncome}
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
                  disabled={refreshing}
                  className="mt-1 text-caption font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  style={{ color: P.danger }}
                >
                  Reintentar
                </button>
              </div>
            ) : null}
            {incomes.map((income) => {
              const owner = memberName(income.memberId, members, income.member?.displayName);

              return (
                <button
                  key={income.id}
                  type="button"
                  onClick={() => onOpenIncome(income)}
                  className="w-full flex items-center gap-3 rounded-2xl p-4 shadow-sm text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ backgroundColor: P.card }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                    style={{ backgroundColor: P.sub }}
                  >
                    {income.category?.icon?.trim() || "💰"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: P.text }}>
                      {income.description?.trim() || income.category?.name || "Ingreso"}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: P.muted }}>
                      {income.category?.name ?? "Categoría"}
                      {" · "}
                      {firstName(owner)}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: P.muted }}>
                      {formatRelativeActivityDate(income.occurredAt, income.createdAt)}
                    </p>
                  </div>
                  <span
                    className="text-xs font-semibold flex-shrink-0 font-sans"
                    style={{ color: P.text }}
                  >
                    {formatCompactMoney(income.amount)}
                  </span>
                </button>
              );
            })}
            <Button variant="ghost" onClick={onRegisterIncome}>
              Registrar un ingreso
            </Button>
          </div>
        )}
      </PullToRefresh>
    </div>
  );
}
