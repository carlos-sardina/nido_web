"use client";

import { useState } from "react";
import { MainApp } from "@/components/MainApp";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { clearPendingOnboardingFlow } from "@/lib/auth/pending-flow";
import { signOut } from "@/lib/auth/session";
import { useAuth } from "@/lib/auth/use-auth";
import type { AppMode } from "@/lib/types";

export default function App() {
  const [mode, setMode] = useState<AppMode>("onboarding");
  const [signingOut, setSigningOut] = useState(false);
  const { user } = useAuth();

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      const { error } = await signOut();
      if (error) {
        console.error("Sign out failed", error);
        return;
      }
      clearPendingOnboardingFlow();
      setMode("onboarding");
    } catch (error) {
      console.error("Sign out failed", error);
    } finally {
      setSigningOut(false);
    }
  };

  return mode === "onboarding"
    ? <OnboardingFlow user={user} onComplete={() => setMode("app")} />
    : <MainApp user={user} signingOut={signingOut} onLogout={handleLogout} />;
}
