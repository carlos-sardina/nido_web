"use client";

import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import { cn } from "@/app/components/ui/utils";
import { FlowScrollRefContext } from "@/components/nido/Screen";
import {
  applyPullResistance,
  canBeginPull,
  nextPullPhase,
  pullProgress,
  shouldTriggerRefresh,
} from "@/lib/nido/pull-to-refresh";
import { P } from "@/lib/palette";

const INDICATOR_REST_PX = 48;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable=true]"));
}

export function PullToRefresh({
  onRefresh,
  refreshing,
  className,
  children,
}: {
  onRefresh: () => void | Promise<void>;
  refreshing: boolean;
  className?: string;
  children: ReactNode;
}) {
  const flowScrollRef = useContext(FlowScrollRefContext);
  const localRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const trackingRef = useRef(false);
  const startYRef = useRef(0);
  const pullRef = useRef(0);
  const refreshingRef = useRef(refreshing);
  const onRefreshRef = useRef(onRefresh);
  refreshingRef.current = refreshing;
  onRefreshRef.current = onRefresh;

  const phase = nextPullPhase({
    refreshing,
    tracking: trackingRef.current || pullDistance > 0,
    pullDistance,
  });

  useEffect(() => {
    if (!refreshing) {
      pullRef.current = 0;
      trackingRef.current = false;
      setPullDistance(0);
    }
  }, [refreshing]);

  useEffect(() => {
    const el = flowScrollRef?.current ?? localRef.current;
    if (!el) return;

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      if (isEditableTarget(event.target)) return;
      if (!canBeginPull({ scrollTop: el.scrollTop, refreshing: refreshingRef.current })) {
        trackingRef.current = false;
        return;
      }
      trackingRef.current = true;
      startYRef.current = event.touches[0].clientY;
      pullRef.current = 0;
    };

    const onMove = (event: TouchEvent) => {
      if (!trackingRef.current || refreshingRef.current) return;
      if (el.scrollTop !== 0) {
        trackingRef.current = false;
        pullRef.current = 0;
        setPullDistance(0);
        return;
      }
      const deltaY = event.touches[0].clientY - startYRef.current;
      if (deltaY <= 0) {
        pullRef.current = 0;
        setPullDistance(0);
        return;
      }
      if (event.cancelable) event.preventDefault();
      const next = applyPullResistance(deltaY);
      pullRef.current = next;
      setPullDistance(next);
    };

    const onEnd = () => {
      if (!trackingRef.current) return;
      trackingRef.current = false;
      const shouldRefresh = shouldTriggerRefresh({
        scrollTop: el.scrollTop,
        pullDistance: pullRef.current,
        refreshing: refreshingRef.current,
      });
      if (shouldRefresh) {
        void Promise.resolve(onRefreshRef.current()).finally(() => {
          if (!refreshingRef.current) {
            pullRef.current = 0;
            setPullDistance(0);
          }
        });
        return;
      }
      pullRef.current = 0;
      setPullDistance(0);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [flowScrollRef]);

  const progress = pullProgress(pullDistance);
  const indicatorHeight = refreshing
    ? INDICATOR_REST_PX
    : Math.min(pullDistance, INDICATOR_REST_PX + 16);
  const visible = refreshing || pullDistance > 0;

  return (
    <div ref={flowScrollRef ? undefined : localRef} className={cn(flowScrollRef ? undefined : className)}>
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{
          height: indicatorHeight,
          opacity: visible ? 1 : 0,
          transition: trackingRef.current ? "none" : "height 180ms ease, opacity 180ms ease",
        }}
        aria-hidden={!visible}
        aria-live={refreshing ? "polite" : undefined}
        data-pull-phase={phase}
      >
        {refreshing ? (
          <Loader2
            size={18}
            className="animate-spin"
            style={{ color: P.sage }}
            aria-label="Actualizando"
          />
        ) : (
          <ArrowDown
            size={18}
            aria-hidden="true"
            style={{
              color: phase === "armed" ? P.sage : P.muted,
              opacity: 0.4 + progress * 0.6,
              transform: `rotate(${progress * 180}deg)`,
            }}
          />
        )}
      </div>
      {children}
    </div>
  );
}
