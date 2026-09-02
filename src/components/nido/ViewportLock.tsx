"use client";

import { useEffect } from "react";
import {
  applyAppViewport,
  applyKeyboardOpenState,
  isSoftKeyboardOpen,
  isViewportZoomed,
  readAppViewport,
  resolveShellOffsetTop,
} from "@/lib/nido/viewport";

let restingVisualHeight = 0;

function syncAppViewport() {
  const root = document.documentElement;
  const layoutHeight = window.innerHeight;
  const metrics = readAppViewport(window.visualViewport, layoutHeight);
  const keyboardOpen = isSoftKeyboardOpen({
    visualHeight: metrics.height,
    layoutHeight,
    restingVisualHeight,
  });
  if (!keyboardOpen) {
    restingVisualHeight = Math.max(restingVisualHeight, metrics.height);
  }

  applyAppViewport(root, {
    height: metrics.height,
    offsetTop: resolveShellOffsetTop(metrics, keyboardOpen),
  });
  applyKeyboardOpenState(root, keyboardOpen);
  if (isViewportZoomed(metrics.scale)) {
    window.scrollTo(0, 0);
  }
}

export function ViewportLock() {
  useEffect(() => {
    const root = document.documentElement;
    restingVisualHeight = 0;
    syncAppViewport();

    const visual = window.visualViewport;
    visual?.addEventListener("resize", syncAppViewport);
    visual?.addEventListener("scroll", syncAppViewport);
    window.addEventListener("resize", syncAppViewport);
    const onOrientation = () => {
      restingVisualHeight = 0;
      syncAppViewport();
    };
    window.addEventListener("orientationchange", onOrientation);

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
      window.removeEventListener("orientationchange", onOrientation);
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
      document.removeEventListener("gestureend", blockGesture);
      applyKeyboardOpenState(root, false);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-offset-top");
    };
  }, []);

  return null;
}
