import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import { canTransferOwnership } from "./rules.ts";
import type { HouseholdRole } from "./types.ts";

export type TransferOwnershipRequest = {
  newOwnerId: string;
  actorRole: HouseholdRole | null;
  isActiveMember: boolean;
  targetIsActiveSameHousehold: boolean;
  targetRole: HouseholdRole | null;
};

export type TransferOwnershipAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "transfer_household_ownership",
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

/**
 * Domain mutation used by transferHouseholdOwnership().
 * Takes an auth adapter so unit tests do not load the Supabase browser client.
 *
 * household_id, owner_id, and user_id are never sent as authorization.
 * The RPC derives the actor from auth.uid() and the Nido from that membership.
 */
export async function transferOwnershipWithAuth(
  input: TransferOwnershipRequest,
  auth: TransferOwnershipAuth,
): Promise<NidoResult<null>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const issue = canTransferOwnership({
    actorUserId: userId,
    actorRole: input.actorRole,
    isActiveMember: input.isActiveMember,
    targetUserId: input.newOwnerId,
    targetIsActiveSameHousehold: input.targetIsActiveSameHousehold,
    targetRole: input.targetRole,
  });
  if (issue) return nidoFail(issue);

  const { error } = await auth.rpc("transfer_household_ownership", {
    p_new_owner_id: input.newOwnerId,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  return nidoOk(null);
}

export function canSubmitTransfer(submitting: boolean): boolean {
  return !submitting;
}
