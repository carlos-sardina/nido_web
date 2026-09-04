"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { clearAnalyticsActor, rememberAnalyticsActor } from "@/lib/analytics";
import { identityFromUser } from "@/lib/auth/identity";
import {
  clearPasswordRecoveryMarker,
  hasPasswordRecoveryMarker,
  markPasswordRecovery,
} from "@/lib/auth/recovery";
import { resolveAuthSnapshot, type AuthSnapshot, type AuthStatus } from "@/lib/auth/state";
import { createClient } from "@/lib/supabase/client";

export type { AuthStatus };

type AuthHookState = AuthSnapshot | { status: "loading"; user: null };

export type AuthValue =
  | { status: "loading"; user: null; isLoading: true }
  | { status: "unauthenticated"; user: null; isLoading: false }
  | { status: "authenticated"; user: User; isLoading: false }
  | { status: "recovery"; user: User; isLoading: false };

/**
 * Restores the Supabase session and stays in sync with auth changes.
 *
 * Distinguishes a password-recovery session from a normal login so the app
 * shell does not treat `PASSWORD_RECOVERY` (or a recovery session synced to
 * another tab) as `SIGNED_IN` routing.
 *
 * Used once at the app root. Do not call this hook in multiple trees —
 * that would create duplicate `onAuthStateChange` subscriptions.
 */
export function useAuth(): AuthValue {
  const [snapshot, setSnapshot] = useState<AuthHookState>({ status: "loading", user: null });
  const statusRef = useRef<AuthStatus | "loading">("loading");
  statusRef.current = snapshot.status;

  useEffect(() => {
    let cancelled = false;

    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch (error) {
      console.error("Supabase is not configured", error);
      setSnapshot({ status: "unauthenticated", user: null });
      return;
    }

    const apply = (event: string | null, user: User | null, isPasswordRecoverySession: boolean) => {
      if (cancelled) return;
      const previousStatus = statusRef.current;
      const next = resolveAuthSnapshot({
        event,
        user,
        isPasswordRecoverySession,
        previousStatus,
      });
      if (event === "SIGNED_OUT" || event === "USER_DELETED") {
        clearPasswordRecoveryMarker();
      } else if (next.status === "authenticated" && previousStatus === "recovery") {
        clearPasswordRecoveryMarker();
      }
      if (user) {
        const identity = identityFromUser(user);
        rememberAnalyticsActor({
          email: identity?.email,
          username: identity?.displayName,
        });
      } else {
        clearAnalyticsActor();
      }
      setSnapshot(next);
    };

    supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error("Failed to restore auth session", error);
        apply("INITIAL_SESSION", null, false);
        return;
      }
      apply("INITIAL_SESSION", data.user, hasPasswordRecoveryMarker());
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY") {
        markPasswordRecovery();
      }
      apply(event, session?.user ?? null, event === "PASSWORD_RECOVERY" || hasPasswordRecoveryMarker());
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (snapshot.status === "loading") {
    return { status: "loading", user: null, isLoading: true };
  }
  if (snapshot.status === "unauthenticated") {
    return { status: "unauthenticated", user: null, isLoading: false };
  }
  return { status: snapshot.status, user: snapshot.user, isLoading: false };
}
