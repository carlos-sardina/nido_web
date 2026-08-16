/**
 * Environment-aware OAuth callback URL.
 *
 * Uses the current origin so local development resolves to
 * http://localhost:3000/auth/callback and production uses the deployed host.
 * Do not hardcode a production domain here.
 */
export function getOAuthRedirectTo(origin: string): string {
  const normalized = origin.replace(/\/$/, "");
  return `${normalized}/auth/callback`;
}

/**
 * Only allow same-origin relative paths after the OAuth callback.
 * Rejects protocol-relative and absolute URLs to prevent open redirects.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("://")) {
    return "/";
  }
  return next;
}
