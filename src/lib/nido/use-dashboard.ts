"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildDashboardViewModel } from "./financial/dashboard.ts";
import { getCurrentMonthRange } from "./financial/dates.ts";
import type { DashboardViewModel } from "./financial/types.ts";
import { NidoError } from "./errors";
import { fetchDashboardSnapshot } from "./queries/dashboard.ts";
import type { HouseholdMemberView } from "./types";

export type DashboardQuery = {
  isLoading: boolean;
  error: NidoError | null;
  model: DashboardViewModel | null;
  refresh: () => Promise<void>;
};

function membersKey(members: HouseholdMemberView[]): string {
  return members.map((member) => `${member.userId}:${member.displayName}`).join("|");
}

export function useDashboard(
  householdId: string | null,
  members: HouseholdMemberView[],
): DashboardQuery {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<NidoError | null>(null);
  const [model, setModel] = useState<DashboardViewModel | null>(null);
  const key = membersKey(members);
  const membersRef = useRef(members);
  membersRef.current = members;

  const refresh = useCallback(async () => {
    if (!householdId) {
      setModel(null);
      setError(new NidoError("not_a_member"));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const range = getCurrentMonthRange();
    const result = await fetchDashboardSnapshot(householdId, range);
    if (result.ok === false) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    setError(null);
    setModel(
      buildDashboardViewModel({
        snapshot: result.data,
        members: membersRef.current,
        range,
      }),
    );
    setIsLoading(false);
  }, [householdId, key]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { isLoading, error, model, refresh };
}
