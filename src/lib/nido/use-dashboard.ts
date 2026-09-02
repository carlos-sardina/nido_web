"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ACTIVITY_PAGE_SIZE } from "./financial/activity.ts";
import { buildDashboardViewModel } from "./financial/dashboard.ts";
import { getCurrentMonthRange } from "./financial/dates.ts";
import type { DashboardViewModel } from "./financial/types.ts";
import { NidoError } from "./errors";
import { beginQueryFetch, finishQueryFetch } from "./query-refresh.ts";
import { fetchDashboardSnapshot } from "./queries/dashboard.ts";
import { nidoClient } from "./session";
import type { HouseholdMemberView } from "./types";

export type DashboardQuery = {
  isLoading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: NidoError | null;
  model: DashboardViewModel | null;
  activityHasMore: boolean;
  refresh: () => Promise<void>;
  loadMoreActivity: () => Promise<void>;
};

function membersKey(members: HouseholdMemberView[]): string {
  return members.map((member) => `${member.userId}:${member.displayName}`).join("|");
}

function snapshotLooksTruncated(
  snapshot: {
    expenses: unknown[];
    incomes: unknown[];
    contributions: unknown[];
  },
  recentLimit: number,
): boolean {
  return (
    snapshot.expenses.length >= recentLimit ||
    snapshot.incomes.length >= recentLimit ||
    snapshot.contributions.length >= recentLimit
  );
}

export function useDashboard(
  householdId: string | null,
  members: HouseholdMemberView[],
): DashboardQuery {
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<NidoError | null>(null);
  const [model, setModel] = useState<DashboardViewModel | null>(null);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const key = membersKey(members);
  const membersRef = useRef(members);
  membersRef.current = members;
  const modelRef = useRef(model);
  modelRef.current = model;
  const inFlightRef = useRef(false);
  const generationRef = useRef(0);
  const activityLimitRef = useRef(ACTIVITY_PAGE_SIZE);
  const householdRef = useRef(householdId);

  if (householdRef.current !== householdId) {
    householdRef.current = householdId;
    activityLimitRef.current = ACTIVITY_PAGE_SIZE;
  }

  const refresh = useCallback(async (opts?: { loadMore?: boolean }) => {
    const started = beginQueryFetch({
      hasData: modelRef.current != null,
      inFlight: inFlightRef.current,
    });
    if (!started.accepted) return;

    if (opts?.loadMore) {
      activityLimitRef.current += ACTIVITY_PAGE_SIZE;
    }

    const generation = ++generationRef.current;
    inFlightRef.current = true;
    if (opts?.loadMore) {
      setLoadingMore(true);
    } else {
      setIsLoading(started.flags.initialLoading);
      setRefreshing(started.flags.refreshing);
    }

    if (!householdId) {
      if (generation !== generationRef.current) return;
      const finished = finishQueryFetch({
        previous: modelRef.current,
        result: { ok: false, error: new NidoError("not_a_member") },
      });
      setError(finished.error);
      if (modelRef.current == null) setModel(null);
      setActivityHasMore(false);
      setIsLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      inFlightRef.current = false;
      return;
    }

    const range = getCurrentMonthRange();
    const recentLimit = activityLimitRef.current;
    const result = await fetchDashboardSnapshot(
      householdId,
      range,
      nidoClient(),
      recentLimit,
    );
    if (generation !== generationRef.current) return;
    if (result.ok === false) {
      if (opts?.loadMore) {
        activityLimitRef.current = Math.max(
          ACTIVITY_PAGE_SIZE,
          activityLimitRef.current - ACTIVITY_PAGE_SIZE,
        );
      }
      const finished = finishQueryFetch({
        previous: modelRef.current,
        result: { ok: false, error: result.error },
      });
      setError(finished.error);
      setIsLoading(finished.flags.initialLoading);
      setRefreshing(finished.flags.refreshing);
      setLoadingMore(false);
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
    setActivityHasMore(snapshotLooksTruncated(result.data, recentLimit));
    setIsLoading(finished.flags.initialLoading);
    setRefreshing(finished.flags.refreshing);
    setLoadingMore(false);
    inFlightRef.current = false;
  }, [householdId, key]);

  const loadMoreActivity = useCallback(async () => {
    await refresh({ loadMore: true });
  }, [refresh]);

  useEffect(() => {
    inFlightRef.current = false;
    void refresh();
  }, [refresh]);

  return {
    isLoading,
    refreshing,
    loadingMore,
    error,
    model,
    activityHasMore,
    refresh,
    loadMoreActivity,
  };
}
