/**
 * Environment-aware auth redirect URL for email confirmation and
 * password recovery. Google OAuth is not used in this iteration.
 *
 * Uses the current origin so local development resolves to
 * http://localhost:3000/auth/callback and production uses the deployed host.
 * Do not hardcode a production domain here.
 */
export function getAuthRedirectTo(origin: string, next?: string): string {
  const normalized = origin.replace(/\/$/, "");
  const callback = `${normalized}/auth/callback`;
  const safeNext = safeNextPath(next);
  if (!next || safeNext === "/") return callback;
  return `${callback}?next=${encodeURIComponent(safeNext)}`;
}

/**
 * Only allow same-origin relative paths after the auth callback.
 * Rejects protocol-relative and absolute URLs to prevent open redirects.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("://")) {
    return "/";
  }
  return next;
}
