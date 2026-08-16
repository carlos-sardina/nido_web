/**
 * Temporary UI state so onboarding can resume after an email-confirmation
 * or password-recovery redirect.
 *
 * This is not session storage for auth tokens. Supabase owns the auth
 * session in cookies. These keys only remember the create/join choice
 * and, when present, the invitation token so /join/<token> can continue
 * after the user confirms their email.
 */
const PENDING_FLOW_KEY = "nido.pendingOnboardingFlow";
const PENDING_INVITE_KEY = "nido.pendingInvitationToken";

export type PendingOnboardingFlow = "create" | "join";

export function savePendingOnboardingFlow(flow: PendingOnboardingFlow) {
  sessionStorage.setItem(PENDING_FLOW_KEY, flow);
}

export function takePendingOnboardingFlow(): PendingOnboardingFlow | null {
  const value = sessionStorage.getItem(PENDING_FLOW_KEY);
  sessionStorage.removeItem(PENDING_FLOW_KEY);
  if (value === "create" || value === "join") return value;
  return null;
}

export function clearPendingOnboardingFlow() {
  sessionStorage.removeItem(PENDING_FLOW_KEY);
}

export function savePendingInvitationToken(token: string) {
  sessionStorage.setItem(PENDING_INVITE_KEY, token);
}

export function takePendingInvitationToken(): string | null {
  const value = sessionStorage.getItem(PENDING_INVITE_KEY);
  sessionStorage.removeItem(PENDING_INVITE_KEY);
  return value && value.trim() ? value : null;
}

export function clearPendingInvitationToken() {
  sessionStorage.removeItem(PENDING_INVITE_KEY);
}
