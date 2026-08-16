import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicSupabaseConfig } from "./env";
import type { Database } from "./types";

/**
 * Server Supabase client for Server Components, Server Actions, and Route Handlers.
 *
 * SERVER-ONLY. Do not import this module from Client Components or any
 * browser bundle. It uses `next/headers` cookies to attach the current
 * user's session.
 *
 * Uses the public anon key — not the service role — so RLS still applies.
 * Create a new client per request. Do not reuse it across requests.
 *
 * Session-refresh middleware is deferred until Phase 7 (Authentication).
 */
export async function createClient() {
  const { url, anonKey } = getPublicSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies. Session refresh
          // middleware is intentionally not added in this phase.
        }
      },
    },
  });
}
