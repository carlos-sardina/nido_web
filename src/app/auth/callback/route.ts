import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function redirectWithNoStore(url: string) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

/**
 * Supabase OAuth callback.
 *
 * Exchanges the provider `code` for a session and writes it to cookies
 * through the server Supabase client. Then returns the user to the app.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      const destination = isLocalEnv
        ? `${origin}${next}`
        : forwardedHost
          ? `https://${forwardedHost}${next}`
          : `${origin}${next}`;
      return redirectWithNoStore(destination);
    }

    console.error("OAuth code exchange failed", error.message);
  }

  return redirectWithNoStore(`${origin}/?auth=error`);
}
