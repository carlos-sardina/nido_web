import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  isPersonalVisibility,
  type PersonalVisibility,
} from "./personal-visibility.ts";
import type { Profile } from "./types.ts";

export type UpdatePersonalVisibilityAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "update_personal_visibility",
    args: { p_visibility: PersonalVisibility },
  ) => Promise<{ data: Profile | null; error: unknown }>;
};

/**
 * Domain mutation used by updatePersonalVisibility().
 * The RPC updates profiles.personal_visibility for auth.uid() only.
 * It does not take a user id.
 */
export async function updatePersonalVisibilityWithAuth(
  visibility: unknown,
  auth: UpdatePersonalVisibilityAuth,
): Promise<NidoResult<Profile>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  if (!isPersonalVisibility(visibility)) return nidoFail("invalid_visibility");

  const { data, error } = await auth.rpc("update_personal_visibility", {
    p_visibility: visibility,
  });
  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk(data);
}

export function canSubmitPersonalVisibility(submitting: boolean): boolean {
  return !submitting;
}
