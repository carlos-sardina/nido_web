export type QueryRefreshFlags = {
  initialLoading: boolean;
  refreshing: boolean;
};

export function beginQueryFetch(input: {
  hasData: boolean;
  inFlight: boolean;
}): { accepted: false } | { accepted: true; flags: QueryRefreshFlags } {
  if (input.inFlight) return { accepted: false };
  if (input.hasData) {
    return { accepted: true, flags: { initialLoading: false, refreshing: true } };
  }
  return { accepted: true, flags: { initialLoading: true, refreshing: false } };
}

export function finishQueryFetch<T, E>(input: {
  previous: T | null;
  result: { ok: true; data: T } | { ok: false; error: E };
}): { data: T | null; error: E | null; flags: QueryRefreshFlags } {
  const result = input.result;
  if (result.ok === false) {
    return {
      data: input.previous,
      error: result.error,
      flags: { initialLoading: false, refreshing: false },
    };
  }
  return {
    data: result.data,
    error: null,
    flags: { initialLoading: false, refreshing: false },
  };
}
