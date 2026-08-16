/**
 * Temporary UI state so a `/join/<token>` invitation can resume after
 * email confirmation or login.
 *
 * This is not session storage for auth tokens. Supabase owns the auth
 * session in cookies. Authentication is independent from Nido creation;
 * this key only remembers the invitation token so `/join/<token>` can
 * continue after the user confirms their email.
 */
const PENDING_INVITE_KEY = "nido.pendingInvitationToken";

export function savePendingInvitationToken(token: string) {
  sessionStorage.setItem(PENDING_INVITE_KEY, token);
}

export function peekPendingInvitationToken(): string | null {
  const value = sessionStorage.getItem(PENDING_INVITE_KEY);
  return value && value.trim() ? value : null;
}

export function takePendingInvitationToken(): string | null {
  const value = peekPendingInvitationToken();
  sessionStorage.removeItem(PENDING_INVITE_KEY);
  return value;
}

export function clearPendingInvitationToken() {
  sessionStorage.removeItem(PENDING_INVITE_KEY);
}
