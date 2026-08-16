import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { nidoFail, type NidoResult } from "./errors";

export type NidoClient = SupabaseClient<Database>;

export function nidoClient(): NidoClient {
  return createClient();
}

export async function requireUser(
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ supabase: NidoClient; user: User }>> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return nidoFail("unauthenticated");
  }
  return { ok: true, data: { supabase, user: data.user } };
}
