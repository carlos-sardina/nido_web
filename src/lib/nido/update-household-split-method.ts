import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import { isHouseholdSplitMethod, type HouseholdSplitMethod } from "./split-method.ts";
import type { Household } from "./types.ts";

export type UpdateHouseholdSplitMethodAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "update_household_default_split_method",
    args: { p_method: HouseholdSplitMethod },
  ) => Promise<{ data: Household | null; error: unknown }>;
};

/**
 * Domain mutation used by updateHouseholdSplitMethod().
 * The RPC updates households.default_split_method only. It does not take a household_id.
 */
export async function updateHouseholdSplitMethodWithAuth(
  method: unknown,
  auth: UpdateHouseholdSplitMethodAuth,
): Promise<NidoResult<Household>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  if (!isHouseholdSplitMethod(method)) return nidoFail("invalid_split");

  const { data, error } = await auth.rpc("update_household_default_split_method", {
    p_method: method,
  });
  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk(data);
}

export function canSubmitHouseholdSplitMethod(submitting: boolean): boolean {
  return !submitting;
}
