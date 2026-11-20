"use client";

import { useRef, useState, type ReactNode } from "react";
import { P } from "@/lib/palette";

const ACTION_WIDTH = 88;
const OPEN_THRESHOLD = 48;

export function SwipeToDelete({
  children,
  onDelete,
  disabled = false,
  label = "Eliminar",
}: {
  children: ReactNode;
  onDelete: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const axisLocked = useRef<"h" | "v" | null>(null);
  const [offset, setOffset] = useState(0);

  const close = () => setOffset(0);

  const onTouchStart = (event: React.TouchEvent) => {
    if (disabled) return;
    const touch = event.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    dragging.current = true;
    axisLocked.current = null;
  };

  const onTouchMove = (event: React.TouchEvent) => {
    if (!dragging.current || disabled) return;
    const touch = event.touches[0];
    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;

    if (axisLocked.current == null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axisLocked.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (axisLocked.current !== "h") return;

    // Swipe right → reveal delete on the left.
    const next = Math.max(0, Math.min(ACTION_WIDTH, dx));
    setOffset(next);
  };

  const onTouchEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setOffset((value) => (value >= OPEN_THRESHOLD ? ACTION_WIDTH : 0));
  };

  return (
    <div className="relative overflow-hidden rounded-[1.25rem]">
      <button
        type="button"
        aria-label={label}
        onClick={() => {
          close();
          onDelete();
        }}
        className="absolute inset-y-0 left-0 flex items-center justify-center text-xs font-semibold text-white"
        style={{
          width: ACTION_WIDTH,
          backgroundColor: P.danger,
        }}
      >
        {label}
      </button>
      <div
        className="relative touch-pan-y"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging.current ? "none" : "transform 160ms ease",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
