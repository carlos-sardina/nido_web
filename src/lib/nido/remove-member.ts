import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import { canRemoveMember } from "./rules.ts";
import type { HouseholdRole } from "./types.ts";

export type RemoveMemberRequest = {
  targetUserId: string;
  actorRole: HouseholdRole | null;
  isActiveMember: boolean;
  targetIsActiveSameHousehold: boolean;
  targetRole: HouseholdRole | null;
};

export type RemoveMemberAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "remove_household_member",
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

/**
 * Domain mutation used by removeHouseholdMember().
 * Takes an auth adapter so unit tests do not load the Supabase browser client.
 *
 * household_id, owner_id, and user_id are never sent as authorization.
 * The RPC derives the actor from auth.uid() and the Nido from that membership.
 */
export async function removeMemberWithAuth(
  input: RemoveMemberRequest,
  auth: RemoveMemberAuth,
): Promise<NidoResult<null>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const issue = canRemoveMember({
    actorUserId: userId,
    actorRole: input.actorRole,
    isActiveMember: input.isActiveMember,
    targetUserId: input.targetUserId,
    targetIsActiveSameHousehold: input.targetIsActiveSameHousehold,
    targetRole: input.targetRole,
  });
  if (issue) return nidoFail(issue);

  const { error } = await auth.rpc("remove_household_member", {
    p_target_user_id: input.targetUserId,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  return nidoOk(null);
}

export function canSubmitRemove(submitting: boolean): boolean {
  return !submitting;
}
