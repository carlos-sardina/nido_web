import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "./env";
import type { Database } from "./types";

/**
 * Browser Supabase client for Client Components.
 *
 * Safe to import from `"use client"` modules. Uses the public anon key
 * plus the authenticated user's session. All queries remain subject to RLS.
 *
 * `createBrowserClient` already keeps a singleton in the browser. Call this
 * factory from modules, not from inside React component bodies.
 *
 * Do not import `@/lib/supabase/server` from Client Components.
 */
export function createClient() {
  const { url, anonKey } = getPublicSupabaseConfig();
  return createBrowserClient<Database>(url, anonKey);
}
