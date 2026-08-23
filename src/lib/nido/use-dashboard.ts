"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildDashboardViewModel } from "./financial/dashboard.ts";
import { getCurrentMonthRange } from "./financial/dates.ts";
import type { DashboardViewModel } from "./financial/types.ts";
import { NidoError } from "./errors";
import { beginQueryFetch, finishQueryFetch } from "./query-refresh.ts";
import { fetchDashboardSnapshot } from "./queries/dashboard.ts";
import type { HouseholdMemberView } from "./types";

export type DashboardQuery = {
  isLoading: boolean;
  refreshing: boolean;
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<NidoError | null>(null);
  const [model, setModel] = useState<DashboardViewModel | null>(null);
  const key = membersKey(members);
  const membersRef = useRef(members);
  membersRef.current = members;
  const modelRef = useRef(model);
  modelRef.current = model;
  const inFlightRef = useRef(false);
  const generationRef = useRef(0);

  const refresh = useCallback(async () => {
    const started = beginQueryFetch({
      hasData: modelRef.current != null,
      inFlight: inFlightRef.current,
    });
    if (!started.accepted) return;

    const generation = ++generationRef.current;
    inFlightRef.current = true;
    setIsLoading(started.flags.initialLoading);
    setRefreshing(started.flags.refreshing);

    if (!householdId) {
      if (generation !== generationRef.current) return;
      const finished = finishQueryFetch({
        previous: modelRef.current,
        result: { ok: false, error: new NidoError("not_a_member") },
      });
      setError(finished.error);
      if (modelRef.current == null) setModel(null);
      setIsLoading(false);
      setRefreshing(false);
      inFlightRef.current = false;
      return;
    }

    const range = getCurrentMonthRange();
    const result = await fetchDashboardSnapshot(householdId, range);
    if (generation !== generationRef.current) return;
    if (result.ok === false) {
      const finished = finishQueryFetch({
        previous: modelRef.current,
        result: { ok: false, error: result.error },
      });
      setError(finished.error);
      setIsLoading(finished.flags.initialLoading);
      setRefreshing(finished.flags.refreshing);
      inFlightRef.current = false;
      return;
    }

    const finished = finishQueryFetch({
      previous: modelRef.current,
      result: {
        ok: true,
        data: buildDashboardViewModel({
          snapshot: result.data,
          members: membersRef.current,
          range,
        }),
      },
    });
    setError(null);
    setModel(finished.data);
    setIsLoading(finished.flags.initialLoading);
    setRefreshing(finished.flags.refreshing);
    inFlightRef.current = false;
  }, [householdId, key]);

  useEffect(() => {
    inFlightRef.current = false;
    void refresh();
  }, [refresh]);

  return { isLoading, refreshing, error, model, refresh };
}
