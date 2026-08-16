import { createClient } from "@/lib/supabase/client";
import { normalizeEmail } from "./credentials";
import { PASSWORD_RECOVERY_PATH, clearPasswordRecoveryMarker } from "./recovery";
import { getAuthRedirectTo } from "./redirect";

export async function signInWithPassword(email: string, password: string) {
  const supabase = createClient();
  return supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });
}

export async function signUpWithPassword(
  email: string,
  password: string,
  options?: { next?: string },
) {
  const supabase = createClient();
  return supabase.auth.signUp({
    email: normalizeEmail(email),
    password,
    options: {
      emailRedirectTo: getAuthRedirectTo(window.location.origin, options?.next),
    },
  });
}

export async function requestPasswordReset(email: string) {
  const supabase = createClient();
  return supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
    redirectTo: getAuthRedirectTo(window.location.origin, PASSWORD_RECOVERY_PATH),
  });
}

export async function updatePassword(password: string) {
  const supabase = createClient();
  const result = await supabase.auth.updateUser({ password });
  if (!result.error) {
    clearPasswordRecoveryMarker();
  }
  return result;
}

export async function signOut() {
  clearPasswordRecoveryMarker();
  const supabase = createClient();
  return supabase.auth.signOut();
}
