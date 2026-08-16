import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 15 session-refresh middleware for Supabase SSR.
 *
 * Official Supabase docs for newer Next.js versions call this a "proxy".
 * This project is on Next.js 15, which still uses `middleware.ts`.
 *
 * Purpose: keep auth cookies fresh across page loads. No authorization,
 * household routing, or business logic lives here.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
