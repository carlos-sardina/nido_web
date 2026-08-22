import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import { canLeaveHousehold } from "./rules.ts";
import type { HouseholdRole } from "./types.ts";

export type LeaveHouseholdRequest = {
  isActiveMember: boolean;
  role: HouseholdRole | null;
  activeOwnerCount: number;
};

export type LeaveHouseholdAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "leave_household",
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

/**
 * Domain mutation used by leaveHousehold().
 * Takes an auth adapter so unit tests do not load the Supabase browser client.
 *
 * household_id and user_id are never sent. The RPC uses auth.uid() only.
 */
export async function leaveHouseholdWithAuth(
  input: LeaveHouseholdRequest,
  auth: LeaveHouseholdAuth,
): Promise<NidoResult<null>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const issue = canLeaveHousehold(input);
  if (issue) return nidoFail(issue);

  const { error } = await auth.rpc("leave_household", {});
  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  return nidoOk(null);
}

export function canSubmitLeave(submitting: boolean): boolean {
  return !submitting;
}
