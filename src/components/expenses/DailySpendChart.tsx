"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  dailySpendSeries,
  formatExactMoney,
  todayIso,
  type ExpenseRow,
  type MonthRange,
} from "@/lib/nido/financial";
import { P } from "@/lib/palette";

const WEEKDAY_LABELS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;
const TRACK_PX = 112;

function shiftCalendarDate(iso: string, deltaDays: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays));
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function weekdayLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return WEEKDAY_LABELS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
}

function selectionCaption(date: string, today: string): string {
  if (date === today) return "Hoy";
  if (date === shiftCalendarDate(today, -1)) return "Ayer";
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(year, month - 1, day)))
    .replace(/\./g, "");
}

function accessibleDayLabel(date: string, amount: number, today: string): string {
  const when =
    date === today
      ? "Hoy"
      : new Intl.DateTimeFormat("es-MX", {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "UTC",
        }).format(
          new Date(
            Date.UTC(
              Number(date.slice(0, 4)),
              Number(date.slice(5, 7)) - 1,
              Number(date.slice(8, 10)),
            ),
          ),
        );
  return `${when}, ${formatExactMoney(amount)}`;
}

function barPercent(amount: number, max: number): number {
  if (amount <= 0 || max <= 0) return 0;
  return Math.max(14, Math.round((amount / max) * 100));
}

function scrollEdges(el: HTMLElement): { left: boolean; right: boolean } {
  return {
    left: el.scrollLeft > 8,
    right: el.scrollLeft + el.clientWidth < el.scrollWidth - 8,
  };
}

export function DailySpendChart({
  expenses,
  range,
}: {
  expenses: ExpenseRow[];
  range: MonthRange;
}) {
  const series = useMemo(() => dailySpendSeries(expenses, range), [expenses, range]);
  const today = todayIso(new Date(), range.timeZone);
  const [selectedDate, setSelectedDate] = useState(today);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: true });

  const selected =
    series.find((point) => point.date === selectedDate) ??
    series.find((point) => point.date === today) ??
    series[series.length - 1];
  const max = series.reduce((peak, point) => Math.max(peak, point.amount), 0);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = scroller.querySelector<HTMLElement>(`[data-date="${today}"]`);
    if (!target) return;
    const left = target.offsetLeft - (scroller.clientWidth - target.offsetWidth) / 2;
    scroller.scrollLeft = Math.max(0, left);
    setEdges(scrollEdges(scroller));
  }, [today, range.start, series.length]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const sync = () => setEdges(scrollEdges(scroller));
    sync();
    scroller.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [range.start, series.length]);

  if (!selected) return null;

  const focusDay = (date: string) => {
    setSelectedDate(date);
    const scroller = scrollerRef.current;
    const button = scroller?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`);
    if (!scroller || !button) return;
    button.focus({ preventScroll: true });
    const left = button.offsetLeft - (scroller.clientWidth - button.offsetWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  };

  return (
    <div className="mx-6 mb-3 rounded-[1.5rem] px-5 pt-5 pb-3 shadow-sm" style={{ backgroundColor: P.card }}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold" style={{ color: P.text }}>
            Gastos por día
          </h3>
          <p className="text-[10px] mt-0.5" style={{ color: P.muted }}>
            {selectionCaption(selected.date, today)}
          </p>
        </div>
        <span
          className="text-[22px] font-bold font-sans tabular-nums leading-none"
          style={{ color: P.text }}
        >
          {formatExactMoney(selected.amount)}
        </span>
      </div>

      <div className="relative -mx-5">
        {edges.left ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6"
            style={{ background: `linear-gradient(to right, ${P.card}, transparent)` }}
          />
        ) : null}
        {edges.right ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8"
            style={{ background: `linear-gradient(to left, ${P.card}, transparent)` }}
          />
        ) : null}
        <div
          ref={scrollerRef}
          role="group"
          aria-label="Gastos por día del mes. Desliza horizontalmente para ver más días."
          className="flex items-end gap-1 overflow-x-auto overscroll-x-contain px-4 py-1 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {series.map((point, index) => {
            const isSelected = point.date === selected.date;
            const isToday = point.date === today;
            const isFuture = point.date > today;
            const percent = barPercent(point.amount, max);
            return (
              <button
                key={point.date}
                type="button"
                data-date={point.date}
                aria-pressed={isSelected}
                aria-label={accessibleDayLabel(point.date, point.amount, today)}
                onClick={() => setSelectedDate(point.date)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                  event.preventDefault();
                  const next = series[index + (event.key === "ArrowRight" ? 1 : -1)];
                  if (next) focusDay(next.date);
                }}
                className="flex-none w-12 rounded-2xl px-1 pt-1 pb-1.5 flex flex-col items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ backgroundColor: isSelected ? P.bg : "transparent" }}
              >
                <span
                  className="relative w-5 rounded-full overflow-hidden"
                  style={{
                    height: TRACK_PX,
                    backgroundColor: isFuture ? "rgba(237,231,224,0.55)" : P.sub,
                  }}
                  aria-hidden="true"
                >
                  {percent > 0 ? (
                    <span
                      className="absolute inset-x-0 bottom-0 rounded-t-full"
                      style={{
                        height: `${percent}%`,
                        backgroundColor: isSelected ? P.sageDk : P.sage,
                      }}
                    />
                  ) : null}
                </span>
                <span className="flex flex-col items-center leading-none">
                  <span
                    className="text-[11px] font-semibold tabular-nums"
                    style={{ color: isToday || isSelected ? P.text : isFuture ? "rgba(116,108,103,0.45)" : P.muted }}
                  >
                    {point.day}
                  </span>
                  <span
                    className="text-[9px] mt-0.5"
                    style={{
                      color: isToday ? P.sage : isFuture ? "rgba(116,108,103,0.45)" : P.muted,
                      fontWeight: isToday ? 700 : 500,
                    }}
                  >
                    {isToday ? "hoy" : weekdayLabel(point.date)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
