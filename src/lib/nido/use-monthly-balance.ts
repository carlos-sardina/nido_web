"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { calculateMonthlyBalance } from "./financial/balance.ts";
import { getCurrentMonthRange, isSameMonth, shiftMonth, type MonthRange } from "./financial/dates.ts";
import type { MonthlyBalance } from "./financial/types.ts";
import { NidoError } from "./errors";
import { beginQueryFetch, finishQueryFetch } from "./query-refresh.ts";
import { fetchDashboardSnapshot } from "./queries/dashboard.ts";
import type { HouseholdMemberView } from "./types";

export type MonthlyBalanceQuery = {
  isLoading: boolean;
  refreshing: boolean;
  error: NidoError | null;
  balance: MonthlyBalance | null;
  range: MonthRange;
  canGoNext: boolean;
  goPrev: () => void;
  goNext: () => void;
  refresh: () => Promise<void>;
};

function membersKey(members: HouseholdMemberView[]): string {
  return members.map((member) => `${member.userId}:${member.displayName}`).join("|");
}

export function useMonthlyBalance(
  householdId: string | null,
  members: HouseholdMemberView[],
  enabled: boolean,
  currentRange: MonthRange = getCurrentMonthRange(),
): MonthlyBalanceQuery {
  const [range, setRange] = useState<MonthRange>(currentRange);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<NidoError | null>(null);
  const [balance, setBalance] = useState<MonthlyBalance | null>(null);
  const key = membersKey(members);
  const membersRef = useRef(members);
  membersRef.current = members;
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  const inFlightRef = useRef(false);
  const generationRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled || !householdId) {
      if (!householdId) {
        setBalance(null);
        setError(new NidoError("not_a_member"));
      }
      setIsLoading(false);
      setRefreshing(false);
      inFlightRef.current = false;
      return;
    }

    const started = beginQueryFetch({
      hasData: balanceRef.current != null,
      inFlight: inFlightRef.current,
    });
    if (!started.accepted) return;

    const generation = ++generationRef.current;
    inFlightRef.current = true;
    setIsLoading(started.flags.initialLoading);
    setRefreshing(started.flags.refreshing);

    const result = await fetchDashboardSnapshot(householdId, range);
    if (generation !== generationRef.current) return;
    if (result.ok === false) {
      const finished = finishQueryFetch({
        previous: balanceRef.current,
        result: { ok: false, error: result.error },
      });
      setError(finished.error);
      setIsLoading(finished.flags.initialLoading);
      setRefreshing(finished.flags.refreshing);
      inFlightRef.current = false;
      return;
    }

    const finished = finishQueryFetch({
      previous: balanceRef.current,
      result: {
        ok: true,
        data: calculateMonthlyBalance({
          expenses: result.data.periodExpenses,
          incomes: result.data.periodIncomes,
          members: membersRef.current,
          range,
          householdId: result.data.householdId,
        }),
      },
    });
    setError(null);
    setBalance(finished.data);
    setIsLoading(finished.flags.initialLoading);
    setRefreshing(finished.flags.refreshing);
    inFlightRef.current = false;
  }, [enabled, householdId, key, range]);

  useEffect(() => {
    inFlightRef.current = false;
    void refresh();
  }, [refresh]);

  return {
    isLoading,
    refreshing,
    error,
    balance,
    range,
    canGoNext: !isSameMonth(range, currentRange),
    goPrev: () => setRange((current) => shiftMonth(current, -1)),
    goNext: () =>
      setRange((current) => {
        const next = shiftMonth(current, 1);
        const afterCurrent =
          next.year > currentRange.year ||
          (next.year === currentRange.year && next.month > currentRange.month);
        return afterCurrent ? current : next;
      }),
    refresh,
  };
}
