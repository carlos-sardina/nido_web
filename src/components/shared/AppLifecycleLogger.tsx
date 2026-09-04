"use client";

import { useEffect } from "react";
import { prefetchAnalyticsActor, trackEvent, trackEventImmediate } from "@/lib/analytics";
import { readAnalyticsClientContext } from "@/lib/analytics-device";

let loadLogged = false;
let unmountTimer: number | undefined;

/**
 * Logs app start and leave for Vercel Analytics / Logs.
 * `pagehide` covers tab close and PWA swipe-away. React unmount is debounced
 * so Strict Mode remounts in development do not look like a real leave.
 */
export function AppLifecycleLogger() {
  useEffect(() => {
    if (unmountTimer !== undefined) {
      window.clearTimeout(unmountTimer);
      unmountTimer = undefined;
    }

    prefetchAnalyticsActor();

    if (!loadLogged) {
      loadLogged = true;
      trackEvent("App loaded", readAnalyticsClientContext());
    }

    let sent = false;
    const dismount = (reason: "unmount" | "pagehide") => {
      if (sent) return;
      sent = true;
      trackEventImmediate("App dismounted", {
        ...readAnalyticsClientContext(),
        reason,
      });
    };

    const onPageHide = () => dismount("pagehide");
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      unmountTimer = window.setTimeout(() => dismount("unmount"), 50);
    };
  }, []);

  return null;
}
