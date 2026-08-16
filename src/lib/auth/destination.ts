import type { MembershipStatus } from "../nido/types";
import type { AuthStatus } from "./state";

export type { AuthStatus } from "./state";

/**
 * Post-auth screen decision. Membership status comes from useMyNido /
 * classifyMemberships — this helper does not query the database.
 *
 * `/` is the application shell. This function decides what that shell shows.
 * Authentication and Nido selection are separate: a session never implies
 * "create a Nido", and registration never skips the selection screen.
 * A password-recovery session is not a normal login: it stays on landing
 * until `updateUser({ password })` completes.
 * Pass `pendingInviteToken` only after invitation-token format validation.
 */
export type AppEntry =
  | { kind: "landing" }
  | { kind: "main_app" }
  | { kind: "nido_selection" }
  | { kind: "join_invite"; token: string };

export type NidoChoice = "create" | "join";
export type NidoOnboardingStart =
  | { kind: "create_nido" }
  | { kind: "join_code" };

export function resolveAppEntry(input: {
  authStatus: AuthStatus;
  membershipStatus: MembershipStatus | "unauthenticated" | "loading";
  pendingInviteToken: string | null;
}): AppEntry {
  if (input.authStatus !== "authenticated" || input.membershipStatus === "unauthenticated") {
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

  return { kind: "nido_selection" };
}

/**
 * Explicit create/join choice on the authenticated Nido selection screen.
 * Not inferred from registration or login.
 */
export function resolveNidoChoice(choice: NidoChoice): NidoOnboardingStart {
  return choice === "join" ? { kind: "join_code" } : { kind: "create_nido" };
}
