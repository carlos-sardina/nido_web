import type { MembershipStatus } from "../nido/types";
import type { PendingOnboardingFlow } from "./pending-flow";

/**
 * Post-auth screen decision. Membership status comes from useMyNido /
 * classifyMemberships — this helper does not query the database.
 *
 * `/` is the application shell. This function decides what that shell shows.
 * Pass `pendingInviteToken` only after invitation-token format validation.
 */
export type AppEntry =
  | { kind: "landing" }
  | { kind: "main_app" }
  | { kind: "create_nido" }
  | { kind: "join_invite"; token: string }
  | { kind: "join_code" };

export function resolveAppEntry(input: {
  authenticated: boolean;
  membershipStatus: MembershipStatus | "unauthenticated" | "loading";
  pendingFlow: PendingOnboardingFlow | null;
  pendingInviteToken: string | null;
}): AppEntry {
  if (!input.authenticated || input.membershipStatus === "unauthenticated") {
    return { kind: "landing" };
  }

  if (input.membershipStatus === "active") {
    return { kind: "main_app" };
  }

  if (input.membershipStatus === "loading") {
    return { kind: "landing" };
  }

  const token = input.pendingInviteToken?.trim() ?? "";
  if (token) {
    return { kind: "join_invite", token };
  }

  if (input.pendingFlow === "join") {
    return { kind: "join_code" };
  }

  return { kind: "create_nido" };
}
