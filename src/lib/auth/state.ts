import type { User } from "@supabase/supabase-js";

/**
 * Discriminated auth status for application routing.
 *
 * A password-recovery session is authenticated with Supabase (the user can
 * call `updateUser({ password })`) but must not be treated as a normal login.
 * Cross-tab `onAuthStateChange` can deliver that session to an unrelated tab;
 * those tabs must keep their existing UI instead of jumping to MainApp.
 */
export type AuthStatus = "unauthenticated" | "authenticated" | "recovery";

export type AuthSnapshot =
  | { status: "unauthenticated"; user: null }
  | { status: "authenticated"; user: User }
  | { status: "recovery"; user: User };

export type AuthChangeEventName =
  | "INITIAL_SESSION"
  | "PASSWORD_RECOVERY"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "USER_DELETED"
  | (string & {});

/**
 * Maps a Supabase auth event (or an initial `getUser()` restore) to the
 * routing status. Pure: no I/O, no cookie writes, no token storage.
 *
 * `isPasswordRecoverySession` is true when this tab observed
 * `PASSWORD_RECOVERY` or the shared recovery marker set by the callback.
 */
export function resolveAuthSnapshot(input: {
  event: AuthChangeEventName | null;
  user: User | null;
  isPasswordRecoverySession: boolean;
  previousStatus: AuthStatus | "loading";
}): AuthSnapshot {
  if (!input.user || input.event === "SIGNED_OUT" || input.event === "USER_DELETED") {
    return { status: "unauthenticated", user: null };
  }

  if (input.event === "USER_UPDATED" && input.previousStatus === "recovery") {
    return { status: "authenticated", user: input.user };
  }

  if (input.previousStatus === "authenticated") {
    return { status: "authenticated", user: input.user };
  }

  if (input.event === "PASSWORD_RECOVERY" || input.isPasswordRecoverySession) {
    return { status: "recovery", user: input.user };
  }

  return { status: "authenticated", user: input.user };
}
