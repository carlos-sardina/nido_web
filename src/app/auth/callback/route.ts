import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { completeAuthCallback } from "@/lib/auth/callback";
import { recoveryMarkerCookiesForNext } from "@/lib/auth/recovery";
import { resolveCallbackRedirectUrl, safeNextPath } from "@/lib/auth/redirect";
import { getPublicSupabaseConfig } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

function redirectWithNoStore(url: string) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

/**
 * Supabase Auth callback for email confirmation and password recovery.
 *
 * Exchanges the PKCE `code` for a session and writes auth cookies onto the
 * same redirect `NextResponse` the browser follows. Next.js 15 does not
 * reliably copy `cookies().set()` onto a later `NextResponse.redirect()`.
 *
 * Uses the public anon key — not the service role. Tokens stay in cookies,
 * never in the URL. A safe explicit `next` path is preserved (join or
 * password update). Password recovery also sets a non-secret marker cookie
 * so other tabs do not treat the recovery session as a normal login.
 * This route does not inspect household membership; the app shell decides
 * landing vs Nido selection vs MainApp.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get("next");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  const cookieStore = await cookies();

  const destination = {
    origin,
    next,
    forwardedHost,
    isLocalEnv,
  };

  return completeAuthCallback({
    code: searchParams.get("code"),
    successUrl: resolveCallbackRedirectUrl({ ...destination, kind: "success" }),
    errorUrl: resolveCallbackRedirectUrl({ ...destination, kind: "error" }),
    createRedirect: redirectWithNoStore,
    readCookies: () => cookieStore.getAll(),
    writeRequestCookie: (name, value, options) => {
      cookieStore.set(name, value, options);
    },
    successCookies: recoveryMarkerCookiesForNext(safeNextPath(next)),
    exchangeCodeForSession: async (code, cookieAdapter) => {
      const { url, anonKey } = getPublicSupabaseConfig();
      const supabase = createServerClient<Database>(url, anonKey, {
        cookies: cookieAdapter,
      });
      return supabase.auth.exchangeCodeForSession(code);
    },
  });
}
