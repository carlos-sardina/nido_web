"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/nido/Button";
import { EmptyState } from "@/components/nido/EmptyState";
import { PullToRefresh } from "@/components/nido/PullToRefresh";
import { BackLink } from "@/components/nido/Screen";
import { Heading, Text } from "@/components/nido/Typography";
import {
  formatExactMoney,
  formatSignedMoney,
  getCurrentMonthRange,
} from "@/lib/nido/financial";
import type { MonthlyBalance } from "@/lib/nido/financial";
import { useMonthlyBalance } from "@/lib/nido/use-monthly-balance";
import type { HouseholdMemberView } from "@/lib/nido/types";
import { P } from "@/lib/palette";

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: P.muted }}>
        {label}
      </span>
      <span className="text-sm font-semibold font-sans" style={{ color: P.text }}>
        {formatExactMoney(value)}
      </span>
    </div>
  );
}

function MemberCard({
  name,
  paid,
  owed,
  balance,
}: {
  name: string;
  paid: number;
  owed: number;
  balance: number;
}) {
  const tone = balance > 0 ? P.sageDk : balance < 0 ? P.danger : P.text;
  return (
    <div className="rounded-[1.5rem] p-4 shadow-sm" style={{ backgroundColor: P.card }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold" style={{ color: P.text }}>
          {name}
        </p>
        <p className="text-sm font-bold font-sans" style={{ color: tone }}>
          {formatSignedMoney(balance)}
        </p>
      </div>
      <div className="space-y-1.5">
        <SummaryRow label="Pagó" value={paid} />
        <SummaryRow label="Le correspondía" value={owed} />
      </div>
    </div>
  );
}

function Settlements({ balance }: { balance: MonthlyBalance }) {
  if (balance.status === "empty") {
    return (
      <EmptyState
        title="Sin gastos compartidos"
        description="Cuando registren un gasto compartido, aquí verán quién le debe a quién."
      />
    );
  }

  if (balance.status === "settled") {
    return (
      <EmptyState
        title="Todo está equilibrado"
        description="Los gastos compartidos de este mes ya no dejan deudas entre ustedes."
      />
    );
  }

  return (
    <div className="space-y-2">
      {balance.settlements.map((row) => (
        <div
          key={`${row.fromMemberId}-${row.toMemberId}`}
          className="rounded-[1.5rem] p-4 shadow-sm"
          style={{ backgroundColor: P.card }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: P.muted }}>
            {row.fromName} le debe a {row.toName}
          </p>
          <p className="text-[22px] font-bold font-sans" style={{ color: P.text }}>
            {formatExactMoney(row.amount)}
          </p>
        </div>
      ))}
    </div>
  );
}

export function BalanceScreen({
  householdId,
  members,
  onClose,
}: {
  householdId: string;
  members: HouseholdMemberView[];
  onClose: () => void;
}) {
  const query = useMonthlyBalance(householdId, members, true, getCurrentMonthRange());
  const { isLoading, refreshing, error, balance, range, canGoNext, goPrev, goNext, refresh } = query;

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
            Balance
          </Heading>
          <div className="mt-3 flex items-center justify-between rounded-2xl px-2 py-1" style={{ backgroundColor: P.sub }}>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Mes anterior"
              className="w-10 h-10 flex items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft size={18} style={{ color: P.text }} />
            </button>
            <p className="text-sm font-semibold" style={{ color: P.text }}>
              {range.label}
            </p>
            <button
              type="button"
              onClick={goNext}
              disabled={!canGoNext}
              aria-label="Mes siguiente"
              className="w-10 h-10 flex items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30"
            >
              <ChevronRight size={18} style={{ color: P.text }} />
            </button>
          </div>
        </div>

        {isLoading && !balance ? (
          <div className="px-6 pt-4" aria-busy="true" aria-live="polite">
            <Text size="caption" tone="muted">
              Cargando el balance…
            </Text>
          </div>
        ) : error && !balance ? (
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
        ) : balance ? (
          <div className="px-6 pt-3 pb-8 space-y-3">
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

            <div className="rounded-[1.5rem] p-5 shadow-sm" style={{ backgroundColor: P.card }}>
              <p
                className="text-[10px] font-semibold uppercase tracking-widest mb-3"
                style={{ color: P.muted }}
              >
                Resumen de {range.label}
              </p>
              <div className="space-y-2">
                <SummaryRow label="Ingresos" value={balance.incomeTotal} />
                <SummaryRow label="Gastos compartidos" value={balance.sharedGross} />
                <SummaryRow label="Gastos netos" value={balance.sharedNet} />
              </div>
              {balance.memberIncomes.length > 0 ? (
                <div className="mt-4 pt-3 space-y-1.5" style={{ borderTop: `1px solid ${P.border}` }}>
                  {balance.memberIncomes.map((row) => (
                    <SummaryRow key={row.memberId} label={row.displayName} value={row.amount} />
                  ))}
                </div>
              ) : null}
            </div>

            {balance.status !== "empty" ? (
              <div className="space-y-2">
                {balance.members.map((row) => (
                  <MemberCard
                    key={row.memberId}
                    name={row.displayName}
                    paid={row.paid}
                    owed={row.owed}
                    balance={row.balance}
                  />
                ))}
              </div>
            ) : null}

            <div>
              <h3 className="text-xs font-semibold mb-2" style={{ color: P.text }}>
                Quién le debe a quién
              </h3>
              <Settlements balance={balance} />
            </div>
          </div>
        ) : null}
      </PullToRefresh>
    </div>
  );
}
