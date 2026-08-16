import { createClient } from "@/lib/supabase/client";
import { getOAuthRedirectTo } from "./redirect";

export async function signInWithGoogle() {
  const supabase = createClient();
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getOAuthRedirectTo(window.location.origin),
    },
  });
}

export async function signOut() {
  const supabase = createClient();
  return supabase.auth.signOut();
}
