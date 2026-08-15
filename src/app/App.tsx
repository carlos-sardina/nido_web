"use client";

import { useState } from "react";
import { MainApp } from "@/components/MainApp";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import type { AppMode } from "@/lib/types";

export default function App() {
  const [mode, setMode] = useState<AppMode>("onboarding");
  return mode === "onboarding"
    ? <OnboardingFlow onComplete={() => setMode("app")} />
    : <MainApp onLogout={() => setMode("onboarding")} />;
}
