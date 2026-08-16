"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MainApp } from "@/components/MainApp";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { resolveAppEntry } from "@/lib/auth/destination";
import {
  clearPendingInvitationToken,
  clearPendingOnboardingFlow,
  peekPendingInvitationToken,
  peekPendingOnboardingFlow,
  takePendingInvitationToken,
  takePendingOnboardingFlow,
} from "@/lib/auth/pending-flow";
import { signOut } from "@/lib/auth/session";
import { useAuth } from "@/lib/auth/use-auth";
import { isInvitationTokenFormat } from "@/lib/nido/rules";
import { useMyNido } from "@/lib/nido/use-my-nido";
import { P } from "@/lib/palette";

function BootScreen({ message = "Cargando…" }: { message?: string }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: P.bgL, fontFamily: "Figtree, sans-serif" }}
    >
      <p className="text-sm" style={{ color: P.muted }}>{message}</p>
    </div>
  );
}

function readPending() {
  if (typeof window === "undefined") {
    return { flow: null, token: null };
  }
  const token = peekPendingInvitationToken();
  return {
    flow: peekPendingOnboardingFlow(),
    token: token && isInvitationTokenFormat(token) ? token : null,
  };
}

export default function App() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const { user, isLoading: authLoading } = useAuth();
  const nido = useMyNido(user, authLoading);
  const pending = readPending();
  const entry = resolveAppEntry({
    authenticated: Boolean(user),
    membershipStatus: nido.status,
    pendingFlow: pending.flow,
    pendingInviteToken: pending.token,
  });

  useEffect(() => {
    if (authLoading || nido.isLoading || !user) return;

    if (entry.kind === "join_invite") {
      takePendingInvitationToken();
      takePendingOnboardingFlow();
      router.replace(`/join/${encodeURIComponent(entry.token)}`);
      return;
    }

    if (entry.kind === "main_app") {
      clearPendingInvitationToken();
      clearPendingOnboardingFlow();
      return;
    }

    if (entry.kind === "create_nido" || entry.kind === "join_code") {
      takePendingOnboardingFlow();
    }
  }, [authLoading, nido.isLoading, user, entry, router]);

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      const { error } = await signOut();
      if (error) {
        console.error("Sign out failed", error);
        return;
      }
      clearPendingOnboardingFlow();
      clearPendingInvitationToken();
    } catch (error) {
      console.error("Sign out failed", error);
    } finally {
      setSigningOut(false);
    }
  };

  if (authLoading || (user && nido.isLoading)) {
    return <BootScreen />;
  }

  if (nido.error && user && nido.status !== "active") {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6"
        style={{ backgroundColor: P.bgL, fontFamily: "Figtree, sans-serif" }}
      >
        <p className="text-sm text-center mb-4" style={{ color: P.danger }}>
          {nido.error.message}
        </p>
        <button
          onClick={() => void nido.refresh()}
          className="text-xs font-semibold"
          style={{ color: P.brnDk }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (entry.kind === "join_invite") {
    return <BootScreen />;
  }

  if (entry.kind === "main_app" && nido.household && nido.membership) {
    return (
      <MainApp
        user={user!}
        household={nido.household}
        membership={nido.membership}
        members={nido.members}
        profile={nido.profile}
        signingOut={signingOut}
        onLogout={handleLogout}
        onNidoChanged={nido.refresh}
      />
    );
  }

  return (
    <OnboardingFlow
      user={user}
      entry={
        entry.kind === "join_code" ? "join" : entry.kind === "create_nido" ? "create" : "welcome"
      }
      onComplete={() => {
        void nido.refresh();
      }}
    />
  );
}
