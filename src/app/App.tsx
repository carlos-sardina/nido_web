"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MainApp } from "@/components/MainApp";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import {
  clearPendingInvitationToken,
  clearPendingOnboardingFlow,
  takePendingInvitationToken,
} from "@/lib/auth/pending-flow";
import { signOut } from "@/lib/auth/session";
import { useAuth } from "@/lib/auth/use-auth";
import { useMyNido } from "@/lib/nido/use-my-nido";
import { isInvitationTokenFormat } from "@/lib/nido/rules";
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

export default function App() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const { user, isLoading: authLoading } = useAuth();
  const nido = useMyNido(user, authLoading);

  useEffect(() => {
    if (authLoading || nido.isLoading || !user) return;

    const token = takePendingInvitationToken();
    if (!token || !isInvitationTokenFormat(token)) return;

    if (nido.status === "active") {
      clearPendingInvitationToken();
      return;
    }

    router.replace(`/join/${encodeURIComponent(token)}`);
  }, [authLoading, nido.isLoading, nido.status, user, router]);

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

  if (user && nido.status === "active" && nido.household && nido.membership) {
    return (
      <MainApp
        user={user}
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
      onComplete={() => {
        void nido.refresh();
      }}
    />
  );
}
