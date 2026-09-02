import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";

export type CopyMonthSalariesAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "copy_forward_month_salaries",
    args?: Record<string, unknown>,
  ) => Promise<{ data: number | null; error: unknown }>;
};

/**
 * Rolls last month's Sueldo into the current month (and missed months).
 * Idempotent. Extra is never copied. A delete stops future copies.
 */
export async function copyForwardMonthSalariesWithAuth(
  auth: CopyMonthSalariesAuth,
): Promise<NidoResult<{ copied: number }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const { data, error } = await auth.rpc("copy_forward_month_salaries");
  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (data == null) return nidoFail("network");
  return nidoOk({ copied: data });
}
