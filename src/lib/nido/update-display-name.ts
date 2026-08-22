import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import { normalizeDisplayName } from "./rules.ts";
import type { Profile } from "./types.ts";

export type UpdateDisplayNameAuth = {
  getUserId: () => Promise<string | null>;
  updateSelfDisplayName: (payload: {
    display_name: string;
  }) => Promise<{ data: Pick<Profile, "id" | "display_name"> | null; error: unknown }>;
};

/**
 * Domain mutation used by updateMyDisplayName().
 * Takes an auth adapter so unit tests do not load the Supabase browser client.
 *
 * Authorization is the caller's session. The adapter must UPDATE the row
 * for auth.uid() only — never a user_id from the UI.
 */
export async function updateMyDisplayNameWithAuth(
  displayName: string,
  auth: UpdateDisplayNameAuth,
): Promise<NidoResult<Pick<Profile, "id" | "display_name">>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const trimmed = normalizeDisplayName(displayName);
  if (!trimmed) return nidoFail("invalid_name", "El nombre no es válido.");

  const { data, error } = await auth.updateSelfDisplayName({ display_name: trimmed });
  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk(data);
}

export function canSubmitDisplayName(submitting: boolean): boolean {
  return !submitting;
}
