"use client";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/nido/Button";
import { EmeraldHero, HeroAmount, HeroChip, HeroKicker } from "@/components/nido/DecoratedCard";
import { EmptyState } from "@/components/nido/EmptyState";
import { PullToRefresh } from "@/components/nido/PullToRefresh";
import { BackLink } from "@/components/nido/Screen";
import { TextLink } from "@/components/nido/TextLink";
import { Heading, Text } from "@/components/nido/Typography";
import { trackEvent } from "@/lib/analytics";
import {
  confirmMonthlyBalance,
  canSubmitBalancePayment,
} from "@/lib/nido/monthly-balance";
import {
  compactBalanceCopy,
  formatCompactMoney,
  formatExactMoney,
  formatSignedMoney,
  getCurrentMonthRange,
  shortMemberName,
  sumMoney,
  type MonthRange,
  type MonthlyBalance,
} from "@/lib/nido/financial";
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
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="rounded-[1.5rem] p-4 shadow-sm" style={{ backgroundColor: P.card }}>
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{
              backgroundColor: balance < 0 ? "#FDEEF1" : "#E8F4EF",
              color: tone,
            }}
          >
            {initial}
          </div>
          <p className="text-sm font-semibold truncate" style={{ color: P.text }}>
            {name}
          </p>
        </div>
        <p className="text-sm font-bold font-sans flex-shrink-0" style={{ color: tone }}>
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

  if (balance.status === "paid") {
    return (
      <EmptyState
        title="Deuda pagada"
        description="Todos confirmaron el pago. El saldo de este mes quedó en $0."
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
          style={{ background: "linear-gradient(135deg, #E8F4EF 0%, #F4EFE6 58%, #FAF4EC 100%)" }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: P.sage }}>
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

function memberLabel(
  memberId: string,
  members: HouseholdMemberView[],
  currentUserId: string | null,
): string {
  if (currentUserId && memberId === currentUserId) return "Tú";
  const listed = members.find((member) => member.userId === memberId);
  return shortMemberName(listed?.displayName);
}

function PaymentPanel({
  balance,
  members,
  currentUserId,
  paying,
  error,
  onPay,
}: {
  balance: MonthlyBalance;
  members: HouseholdMemberView[];
  currentUserId: string | null;
  paying: boolean;
  error: string | null;
  onPay: () => void;
}) {
  if (balance.status !== "unsettled") return null;

  const confirmed = new Set(balance.payment?.confirmedUserIds ?? []);
  const alreadyConfirmed = Boolean(currentUserId && confirmed.has(currentUserId));
  const pendingNames = (balance.payment?.pendingUserIds ?? [])
    .filter((id) => id !== currentUserId)
    .map((id) => memberLabel(id, members, currentUserId));
  const waitingCopy =
    pendingNames.length === 0
      ? "Falta que confirmes tú para saldar este mes."
      : pendingNames.length === 1
        ? `Falta que ${pendingNames[0]} confirme desde su cuenta.`
        : `Falta que confirmen: ${pendingNames.join(", ")}.`;

  return (
    <div className="rounded-[1.5rem] p-5 shadow-sm" style={{ backgroundColor: P.card }}>
      <p
        className="text-[10px] font-semibold uppercase tracking-widest mb-2"
        style={{ color: P.sage }}
      >
        Saldar el mes
      </p>
      <p className="text-sm leading-relaxed mb-4" style={{ color: P.text }}>
        {alreadyConfirmed
          ? waitingCopy
          : "Para considerar la deuda pagada, cada persona tiene que darle a Pagar desde su cuenta."}
      </p>
      <div className="space-y-2 mb-4">
        {members.map((member) => {
          const done = confirmed.has(member.userId);
          return (
            <div key={member.userId} className="flex items-center justify-between gap-3">
              <span className="text-sm" style={{ color: P.text }}>
                {memberLabel(member.userId, members, currentUserId)}
              </span>
              <span
                className="inline-flex items-center gap-1 text-[11px] font-semibold"
                style={{ color: done ? P.sageDk : P.muted }}
              >
                {done ? <Check size={14} aria-hidden="true" /> : null}
                {done ? "Confirmó" : "Pendiente"}
              </span>
            </div>
          );
        })}
      </div>
      {error ? (
        <Text size="caption" tone="danger" className="mb-3">
          {error}
        </Text>
      ) : null}
      {alreadyConfirmed ? null : (
        <Button
          onClick={onPay}
          loading={paying}
          disabled={!canSubmitBalancePayment(paying, alreadyConfirmed)}
        >
          Pagar
        </Button>
      )}
    </div>
  );
}

export function BalanceScreen({
  householdId,
  members,
  currentUserId,
  initialRange,
  onClose,
  onConfirmed,
}: {
  householdId: string;
  members: HouseholdMemberView[];
  currentUserId: string | null;
  initialRange?: MonthRange;
  onClose: () => void;
  onConfirmed?: () => void;
}) {
  const query = useMonthlyBalance(
    householdId,
    members,
    true,
    getCurrentMonthRange(),
    initialRange,
  );
  const { isLoading, refreshing, error, balance, range, canGoNext, goPrev, goNext, refresh } = query;
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  async function handlePay() {
    if (!canSubmitBalancePayment(paying, false)) return;
    setPaying(true);
    setPayError(null);
    const result = await confirmMonthlyBalance({ year: range.year, month: range.month });
    if (result.ok === false) {
      setPayError(result.error.message);
      setPaying(false);
      return;
    }
    const settlementTotal = balance?.settlements.reduce((sum, row) => sum + row.amount, 0) ?? 0;
    await refresh();
    trackEvent("Monthly balance confirmed", {
      year: range.year,
      month: range.month,
      amount: settlementTotal,
      shared: balance?.sharedNet ?? null,
      settlements: balance?.settlements.length ?? 0,
    });
    onConfirmed?.();
    setPaying(false);
  }

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
          <div className="px-6 pt-1 space-y-3" aria-busy="true" aria-live="polite">
            <Text size="caption" tone="muted">
              Cargando el balance…
            </Text>
            <div className="h-36 rounded-[1.5rem] animate-pulse" style={{ backgroundColor: P.sub }} />
            <div className="h-20 rounded-[1.5rem] animate-pulse" style={{ backgroundColor: P.sub }} />
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
              <HeroKicker trailing={range.label}>Entre el Nido</HeroKicker>
              {balance.status === "unsettled" ? (
                <div className="mb-2">
                  <HeroAmount
                    value={formatCompactMoney(sumMoney(balance.settlements.map((row) => row.amount)))}
                    caption="por saldar"
                  />
                </div>
              ) : (
                <p
                  className="text-[28px] font-bold leading-none mb-2"
                  style={{ fontFamily: "Fraunces, serif", color: "#FFFCFA" }}
                >
                  {balance.status === "empty" ? "En calma" : balance.status === "paid" ? "Pagado" : "Al día"}
                </p>
              )}
              <p className="text-[11px] mb-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                {compactBalanceCopy(balance, currentUserId).headline}
              </p>
              <div className="flex flex-wrap gap-2">
                <HeroChip value={formatCompactMoney(balance.incomeTotal)} label="Ingresos" />
                <HeroChip value={formatCompactMoney(balance.sharedNet)} label="Gastos netos" />
              </div>
            </EmeraldHero>

            <div className="rounded-[1.5rem] p-5 shadow-sm" style={{ backgroundColor: P.card }}>
              <p
                className="text-[10px] font-semibold uppercase tracking-widest mb-3"
                style={{ color: P.sage }}
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

            <PaymentPanel
              balance={balance}
              members={members}
              currentUserId={currentUserId}
              paying={paying}
              error={payError}
              onPay={() => void handlePay()}
            />

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
