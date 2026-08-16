import { createClient } from "@/lib/supabase/client";
import { normalizeEmail } from "./credentials";
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
    redirectTo: getAuthRedirectTo(window.location.origin, "/auth/update-password"),
  });
}

export async function updatePassword(password: string) {
  const supabase = createClient();
  return supabase.auth.updateUser({ password });
}

export async function signOut() {
  const supabase = createClient();
  return supabase.auth.signOut();
}
