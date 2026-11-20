"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PaymentCardRow, PurchaseRow } from "./financial/compras.ts";
import { NidoError } from "./errors";
import { beginQueryFetch, finishQueryFetch } from "./query-refresh.ts";
import { fetchComprasSnapshot, type ComprasSnapshot } from "./queries/compras.ts";

export type ComprasQuery = {
  isLoading: boolean;
  refreshing: boolean;
  error: NidoError | null;
  cards: PaymentCardRow[];
  purchases: PurchaseRow[];
  refresh: () => Promise<void>;
};

export function useCompras(householdId: string | null): ComprasQuery {
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<NidoError | null>(null);
  const [cards, setCards] = useState<PaymentCardRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const inFlightRef = useRef(false);
  const snapshotRef = useRef<ComprasSnapshot | null>(null);
  const householdRef = useRef(householdId);

  if (householdRef.current !== householdId) {
    householdRef.current = householdId;
    snapshotRef.current = null;
  }

  const refresh = useCallback(async () => {
    const started = beginQueryFetch({
      hasData: snapshotRef.current != null,
      inFlight: inFlightRef.current,
    });
    if (!started.accepted) return;

    inFlightRef.current = true;
    setIsLoading(started.flags.initialLoading);
    setRefreshing(started.flags.refreshing);

    if (!householdId) {
      snapshotRef.current = null;
      setCards([]);
      setPurchases([]);
      setError(null);
      setIsLoading(false);
      setRefreshing(false);
      inFlightRef.current = false;
      return;
    }

    const result = await fetchComprasSnapshot(householdId);
    const finished = finishQueryFetch({
      previous: snapshotRef.current,
      result:
        result.ok === true
          ? { ok: true as const, data: result.data }
          : { ok: false as const, error: result.error },
    });

    if (finished.data) {
      snapshotRef.current = finished.data;
      setCards(finished.data.cards);
      setPurchases(finished.data.purchases);
    }
    setError(finished.error);
    setIsLoading(finished.flags.initialLoading);
    setRefreshing(finished.flags.refreshing);
    inFlightRef.current = false;
  }, [householdId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    isLoading,
    refreshing,
    error,
    cards,
    purchases,
    refresh,
  };
}
