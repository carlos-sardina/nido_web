"use client";

import { useEffect } from "react";
import {
  applyAppViewport,
  isViewportZoomed,
  readAppViewport,
  resolveShellOffsetTop,
} from "@/lib/nido/viewport";

function syncAppViewport() {
  const metrics = readAppViewport(window.visualViewport, window.innerHeight);
  applyAppViewport(document.documentElement, {
    height: metrics.height,
    offsetTop: resolveShellOffsetTop(metrics),
  });
  if (isViewportZoomed(metrics.scale)) {
    window.scrollTo(0, 0);
  }
}

export function ViewportLock() {
  useEffect(() => {
    const root = document.documentElement;
    syncAppViewport();

    const visual = window.visualViewport;
    visual?.addEventListener("resize", syncAppViewport);
    visual?.addEventListener("scroll", syncAppViewport);
    window.addEventListener("resize", syncAppViewport);
    window.addEventListener("orientationchange", syncAppViewport);

    const blockGesture = (event: Event) => {
      event.preventDefault();
    };

    document.addEventListener("gesturestart", blockGesture, { passive: false });
    document.addEventListener("gesturechange", blockGesture, { passive: false });
    document.addEventListener("gestureend", blockGesture, { passive: false });

    return () => {
      visual?.removeEventListener("resize", syncAppViewport);
      visual?.removeEventListener("scroll", syncAppViewport);
      window.removeEventListener("resize", syncAppViewport);
      window.removeEventListener("orientationchange", syncAppViewport);
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
      document.removeEventListener("gestureend", blockGesture);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-offset-top");
    };
  }, []);

  return null;
}
