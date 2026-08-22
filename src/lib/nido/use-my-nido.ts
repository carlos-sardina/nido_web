"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { NidoError } from "./errors";
import { getMyNidoState } from "./membership";
import { withTransientRetry } from "./transient-retry";
import type { MyNidoState } from "./types";

export type MyNidoView =
  | { isLoading: true; error: null; status: "loading"; household: null; membership: null; members: []; profile: null; historicalCount: 0; refresh: () => Promise<void> }
  | ({ isLoading: false; error: NidoError | null; refresh: () => Promise<void> } & MyNidoState)
  | { isLoading: false; error: null; status: "unauthenticated"; household: null; membership: null; members: []; profile: null; historicalCount: 0; refresh: () => Promise<void> };

const empty = {
  household: null,
  membership: null,
  members: [] as [],
  profile: null,
  historicalCount: 0 as const,
};

export function useMyNido(user: User | null, authLoading: boolean): MyNidoView {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<NidoError | null>(null);
  const [state, setState] = useState<MyNidoState | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setState(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const result = await withTransientRetry(() => getMyNidoState());
    if (result.ok === false) {
      setError(result.error);
      setState(null);
      setIsLoading(false);
      return;
    }

    setError(null);
    setState(result.data);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  if (authLoading || (user && isLoading && !state && !error)) {
    return { isLoading: true, error: null, status: "loading", ...empty, refresh };
  }

  if (!user) {
    return { isLoading: false, error: null, status: "unauthenticated", ...empty, refresh };
  }

  if (error && !state) {
    return {
      isLoading: false,
      error,
      status: "no_nido",
      household: null,
      membership: null,
      members: [],
      profile: null,
      historicalCount: 0,
      refresh,
    };
  }

  if (!state) {
    return { isLoading: true, error: null, status: "loading", ...empty, refresh };
  }

  return { isLoading: false, error, ...state, refresh };
}
