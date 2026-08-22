import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors";
import type { PersonalVisibility } from "./personal-visibility";
import { nidoClient, requireUser, type NidoClient } from "./session";
import type { Profile } from "./types";
import {
  canSubmitDisplayName,
  updateMyDisplayNameWithAuth,
} from "./update-display-name";
import {
  canSubmitPersonalVisibility,
  updatePersonalVisibilityWithAuth,
} from "./update-personal-visibility";

export { canSubmitDisplayName, canSubmitPersonalVisibility, updateMyDisplayNameWithAuth };

export async function getMyProfile(
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<Pick<Profile, "id" | "display_name" | "avatar_url" | "personal_visibility"> | null>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  const { data, error } = await auth.data.supabase
    .from("profiles")
    .select("id, display_name, avatar_url, personal_visibility")
    .eq("id", auth.data.user.id)
    .maybeSingle();

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  return nidoOk(data);
}

export async function updateMyDisplayName(
  displayName: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<Pick<Profile, "id" | "display_name">>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return updateMyDisplayNameWithAuth(displayName, {
    getUserId: async () => auth.data.user.id,
    updateSelfDisplayName: async (payload) => {
      const { data, error } = await auth.data.supabase
        .from("profiles")
        .update(payload)
        .eq("id", auth.data.user.id)
        .select("id, display_name")
        .maybeSingle();
      return { data, error };
    },
  });
}

export async function updatePersonalVisibility(
  visibility: PersonalVisibility,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<Profile>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return updatePersonalVisibilityWithAuth(visibility, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args),
  });
}
