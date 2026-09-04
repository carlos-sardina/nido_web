"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { rememberAnalyticsActor } from "@/lib/analytics";
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
  const stateRef = useRef(state);
  stateRef.current = state;
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setState(null);
      setError(null);
      setIsLoading(false);
      inFlightRef.current = false;
      pendingRef.current = false;
      return;
    }

    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }

    inFlightRef.current = true;
    do {
      pendingRef.current = false;
      const hasData = stateRef.current != null;
      if (!hasData) setIsLoading(true);

      const result = await withTransientRetry(() => getMyNidoState());
      if (result.ok === false) {
        setError(result.error);
        if (!hasData) setState(null);
        setIsLoading(false);
        continue;
      }

      setError(null);
      setState(result.data);
      rememberAnalyticsActor({ username: result.data.profile?.display_name });
      setIsLoading(false);
    } while (pendingRef.current);
    inFlightRef.current = false;
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
