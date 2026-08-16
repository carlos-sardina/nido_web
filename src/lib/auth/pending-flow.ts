/**
 * Temporary UI state so onboarding can resume after the Google OAuth redirect.
 *
 * This is not session storage for tokens. Supabase owns the auth session
 * in cookies. This key only remembers whether the user was creating or
 * joining a Nido before leaving for Google.
 */
const PENDING_FLOW_KEY = "nido.pendingOnboardingFlow";

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
