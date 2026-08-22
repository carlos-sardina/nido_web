"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/nido/Button";
import { EmptyState } from "@/components/nido/EmptyState";
import { Heading, Text } from "@/components/nido/Typography";
import {
  formatCompactMoney,
  formatRelativeActivityDate,
} from "@/lib/nido/financial";
import type { DashboardQuery } from "@/lib/nido/use-dashboard";
import { P } from "@/lib/palette";

export function ActivityScreen({ dashboard }: { dashboard: DashboardQuery }) {
  const { isLoading, error, model, refresh } = dashboard;
  const activity = model?.activity ?? [];
  const empty = Boolean(model && activity.length === 0);
  const health = model?.health;
  const chips = health?.available
    ? [
        {
          label: "Ingreso del mes",
          value: formatCompactMoney(model?.periodIncome ?? 0),
        },
        health.savingsRatePercent != null
          ? { label: "Tasa de ahorro", value: `${health.savingsRatePercent}%` }
          : null,
        { label: "Salud", value: health.label },
      ].filter((chip): chip is { label: string; value: string } => chip != null)
    : [];

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden pb-20">
      <div className="px-6 pt-3 pb-1">
        <Heading as="h2" size="h2">
          Actividad
        </Heading>
        <Text size="caption" tone="muted" className="mt-1">
          {model?.range.label ?? "Línea de tiempo del hogar"}
        </Text>
      </div>

      {isLoading && !model ? (
        <div className="px-6 pt-4" aria-busy="true" aria-live="polite">
          <Text size="caption" tone="muted">
            Cargando actividad…
          </Text>
        </div>
      ) : error && !model ? (
        <div className="px-6 pt-4">
          <div className="rounded-[1.5rem] p-5 shadow-sm" style={{ backgroundColor: P.card }}>
            <Text size="body-sm" tone="danger" className="mb-4">
              {error.message}
            </Text>
            <Button onClick={() => void refresh()} loading={isLoading}>
              Reintentar
            </Button>
          </div>
        </div>
      ) : (
        <>
          {error ? (
            <div className="mx-6 mb-3 rounded-2xl px-4 py-3" style={{ backgroundColor: P.dangerBg }}>
              <Text size="caption" tone="danger">
                {error.message}
              </Text>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={isLoading}
                className="mt-1 text-caption font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                style={{ color: P.danger }}
              >
                Reintentar
              </button>
            </div>
          ) : null}

          {chips.length > 0 ? (
            <div
              className="mx-6 my-3 rounded-[1.5rem] overflow-hidden"
              style={{ background: "linear-gradient(135deg, #255D4D 0%, #2F7D66 100%)" }}
            >
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={13} style={{ color: P.sageLt }} />
                  <span
                    className="text-[9px] font-bold uppercase tracking-widest"
                    style={{ color: P.sageLt }}
                  >
                    Bienestar financiero
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {chips.slice(0, 3).map((chip) => (
                    <div
                      key={chip.label}
                      className="rounded-xl p-2.5 text-center"
                      style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
                    >
                      <p className="text-sm font-bold text-white font-sans">{chip.value}</p>
                      <p
                        className="text-[9px] mt-0.5 leading-tight"
                        style={{ color: "rgba(255,255,255,0.4)" }}
                      >
                        {chip.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="px-6 pb-6 relative">
            {empty ? (
              <EmptyState
                title="Todo tranquilo por aquí."
                description="Registra un ingreso o un gasto para comenzar a ver tu actividad."
              />
            ) : (
              <>
                <div
                  className="absolute top-0 bottom-0 w-px"
                  style={{ left: "2.125rem", backgroundColor: P.sub }}
                />
                <div className="space-y-3">
                  {activity.map((item) => (
                    <div key={item.id} className="flex gap-3 items-start">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 z-10 text-sm shadow-sm"
                        style={{ backgroundColor: P.card }}
                      >
                        {item.icon}
                      </div>
                      <div
                        className="flex-1 rounded-2xl p-3 shadow-sm"
                        style={{ backgroundColor: P.card, border: `1px solid ${P.border}` }}
                      >
                        <p className="text-xs font-medium leading-snug" style={{ color: P.text }}>
                          {item.title}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[9px]" style={{ color: P.muted }}>
                            {formatRelativeActivityDate(item.date, item.createdAt)}
                          </span>
                          <span className="text-[10px] font-bold font-sans" style={{ color: P.text }}>
                            {formatCompactMoney(item.amount)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
