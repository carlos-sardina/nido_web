import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors";
import { nidoClient, requireUser, type NidoClient } from "./session";
import type { Profile } from "./types";

export async function getMyProfile(
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<Pick<Profile, "id" | "display_name" | "avatar_url"> | null>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  const { data, error } = await auth.data.supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
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

  const trimmed = displayName.trim();
  if (!trimmed) return nidoFail("invalid_name", "El nombre no puede estar vacío.");

  const { data, error } = await auth.data.supabase
    .from("profiles")
    .update({ display_name: trimmed })
    .eq("id", auth.data.user.id)
    .select("id, display_name")
    .maybeSingle();

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk(data);
}
