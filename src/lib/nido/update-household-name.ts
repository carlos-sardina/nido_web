import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import { normalizeHouseholdName } from "./rules.ts";
import type { Household } from "./types.ts";

export type UpdateHouseholdNameAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "update_household_name",
    args: { p_name: string },
  ) => Promise<{ data: Household | null; error: unknown }>;
};

/**
 * Domain mutation used by updateHouseholdName().
 * Takes an auth adapter so unit tests do not load the Supabase browser client.
 *
 * The RPC updates households.name only. It does not take a household_id.
 */
export async function updateHouseholdNameWithAuth(
  name: string,
  auth: UpdateHouseholdNameAuth,
): Promise<NidoResult<Household>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const trimmed = normalizeHouseholdName(name);
  if (!trimmed) return nidoFail("invalid_name");

  const { data, error } = await auth.rpc("update_household_name", { p_name: trimmed });
  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk(data);
}

export function canSubmitHouseholdName(submitting: boolean): boolean {
  return !submitting;
}
