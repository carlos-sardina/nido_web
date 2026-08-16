"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MainApp } from "@/components/MainApp";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { resolveAppEntry } from "@/lib/auth/destination";
import {
  clearPendingInvitationToken,
  peekPendingInvitationToken,
  takePendingInvitationToken,
} from "@/lib/auth/pending-flow";
import { signOut } from "@/lib/auth/session";
import { useAuth } from "@/lib/auth/use-auth";
import { isInvitationTokenFormat } from "@/lib/nido/rules";
import { useMyNido } from "@/lib/nido/use-my-nido";
import { clearOnboardingDraft } from "@/lib/onboarding/draft";
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

function readPendingInviteToken() {
  if (typeof window === "undefined") return null;
  const token = peekPendingInvitationToken();
  return token && isInvitationTokenFormat(token) ? token : null;
}

export default function App() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const { user, status, isLoading: authLoading } = useAuth();
  const appUser = status === "authenticated" ? user : null;
  const nido = useMyNido(appUser, authLoading);
  const entry = resolveAppEntry({
    authStatus: status === "loading" ? "unauthenticated" : status,
    membershipStatus: nido.status,
    pendingInviteToken: readPendingInviteToken(),
  });

  useEffect(() => {
    if (authLoading || nido.isLoading || !appUser) return;

    if (entry.kind === "join_invite") {
      takePendingInvitationToken();
      router.replace(`/join/${encodeURIComponent(entry.token)}`);
      return;
    }

    if (entry.kind === "main_app") {
      clearPendingInvitationToken();
    }
  }, [authLoading, nido.isLoading, appUser, entry, router]);

  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const { error } = await signOut();
      if (error) {
        console.error("Sign out failed", error);
        return;
      }
      clearPendingInvitationToken();
      clearOnboardingDraft();
    } catch (error) {
      console.error("Sign out failed", error);
    } finally {
      setSigningOut(false);
    }
  };

  if (signingOut) {
    return <BootScreen message="Cerrando sesión…" />;
  }

  if (authLoading || (appUser && nido.isLoading)) {
    return <BootScreen />;
  }

  if (nido.error && appUser && nido.status !== "active") {
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

  if (entry.kind === "main_app" && appUser && nido.household && nido.membership) {
    return (
      <MainApp
        user={appUser}
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
      key={appUser?.id ?? "guest"}
      user={appUser}
      entry={entry.kind === "nido_selection" ? "select" : "welcome"}
      onComplete={() => {
        void nido.refresh();
      }}
    />
  );
}
