import type { NidoResult } from "./errors";
import type { NidoErrorCode } from "./types";

export const MY_NIDO_MAX_ATTEMPTS = 2;
export const MY_NIDO_RETRY_DELAY_MS = 200;

export function isTransientMyNidoError(code: NidoErrorCode): boolean {
  return code === "network" || code === "unauthenticated";
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withTransientRetry<T>(
  run: () => Promise<NidoResult<T>>,
  options?: {
    maxAttempts?: number;
    delayMs?: number;
    isTransient?: (code: NidoErrorCode) => boolean;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<NidoResult<T>> {
  const maxAttempts = options?.maxAttempts ?? MY_NIDO_MAX_ATTEMPTS;
  const delayMs = options?.delayMs ?? MY_NIDO_RETRY_DELAY_MS;
  const isTransient = options?.isTransient ?? isTransientMyNidoError;
  const sleep = options?.sleep ?? defaultSleep;

  let last: NidoResult<T> | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await run();
    if (result.ok === false) {
      last = result;
      if (!isTransient(result.error.code) || attempt === maxAttempts) {
        return result;
      }
      await sleep(delayMs * attempt);
      continue;
    }
    return result;
  }

  return last as NidoResult<T>;
}
