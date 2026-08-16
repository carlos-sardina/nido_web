/**
 * Public Supabase configuration.
 *
 * Only NEXT_PUBLIC_ values live here. This module is safe to import from
 * both browser and server code. It never reads service_role, secret keys,
 * or database passwords.
 *
 * Values are read when a client is created, not at import time, so
 * `npm run dev` and `npm run build` succeed without a Supabase project.
 */

export type PublicSupabaseConfig = {
  url: string;
  anonKey: string;
};

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local. See docs/supabase.md.",
    );
  }

  return { url, anonKey };
}
