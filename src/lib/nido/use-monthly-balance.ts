"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { calculateMonthlyBalance } from "./financial/balance.ts";
import { getCurrentMonthRange, isSameMonth, shiftMonth, type MonthRange } from "./financial/dates.ts";
import type { MonthlyBalance } from "./financial/types.ts";
import { NidoError } from "./errors";
import { fetchDashboardSnapshot } from "./queries/dashboard.ts";
import type { HouseholdMemberView } from "./types";

export type MonthlyBalanceQuery = {
  isLoading: boolean;
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
  const [error, setError] = useState<NidoError | null>(null);
  const [balance, setBalance] = useState<MonthlyBalance | null>(null);
  const key = membersKey(members);
  const membersRef = useRef(members);
  membersRef.current = members;

  const refresh = useCallback(async () => {
    if (!enabled || !householdId) {
      if (!householdId) {
        setBalance(null);
        setError(new NidoError("not_a_member"));
      }
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const result = await fetchDashboardSnapshot(householdId, range);
    if (result.ok === false) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    setError(null);
    setBalance(
      calculateMonthlyBalance({
        expenses: result.data.periodExpenses,
        incomes: result.data.periodIncomes,
        members: membersRef.current,
        range,
        householdId: result.data.householdId,
      }),
    );
    setIsLoading(false);
  }, [enabled, householdId, key, range]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    isLoading,
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
