import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";

/**
 * Refresh the Supabase Auth session cookies on matching requests.
 *
 * This exists only so expired access tokens can be rotated and written
 * back to cookies. Server Components cannot always set cookies, so the
 * official `@supabase/ssr` approach does that work here.
 *
 * It does NOT:
 * - redirect unauthenticated users
 * - protect application routes
 * - inspect household membership
 * - load financial data
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value);
        });
      },
    },
  });

  // Do not insert logic between createServerClient and getUser().
  // getUser() validates the JWT and is what triggers a token refresh.
  await supabase.auth.getUser();

  return supabaseResponse;
}
