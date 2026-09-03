"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/nido/Button";
import { NavChevron } from "@/components/nido/ClickHint";
import { EmeraldHero, HeroAmount, HeroChip, HeroKicker } from "@/components/nido/DecoratedCard";
import { EmptyState } from "@/components/nido/EmptyState";
import { PullToRefresh } from "@/components/nido/PullToRefresh";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
import { Text } from "@/components/nido/Typography";
import {
  formatCompactMoney,
  frequencyLabel,
  isRecurrenceDue,
  recurrenceStatus,
  recurrenceStatusLabel,
  type RecurringIncomeTemplate,
} from "@/lib/nido/financial";
import { fetchRecurringIncomes } from "@/lib/nido/queries/recurring";
import { P } from "@/lib/palette";

export function RecurringIncomesScreen({
  householdId,
  onClose,
  onCreate,
  onOpen,
  refreshKey = 0,
}: {
  householdId: string;
  onClose: () => void;
  onCreate: () => void;
  onOpen: (template: RecurringIncomeTemplate) => void;
  refreshKey?: number;
}) {
  const [templates, setTemplates] = useState<RecurringIncomeTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const inFlightRef = useRef(false);
  const templatesRef = useRef(templates);
  templatesRef.current = templates;

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const hasData = templatesRef.current != null;
    if (hasData) setRefreshing(true);
    else setLoading(true);
    const result = await fetchRecurringIncomes(householdId);
    if (result.ok === false) {
      setError(result.error.message);
      if (!hasData) setTemplates(null);
      setLoading(false);
      setRefreshing(false);
      inFlightRef.current = false;
      return;
    }
    setError(null);
    setTemplates(result.data);
    setLoading(false);
    setRefreshing(false);
    inFlightRef.current = false;
  }, [householdId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <div className="absolute inset-0 z-30 overflow-hidden">
      <FlowScreen
        lockViewport
        className="h-full min-h-0"
        header={<BackLink onClick={onClose} label="Ingresos" />}
        footer={
          <ScreenFooter>
            <Button onClick={onCreate}>Nueva recurrencia</Button>
          </ScreenFooter>
        }
      >
        <PullToRefresh
          onRefresh={load}
          refreshing={refreshing}
        >
          <ScreenIntro
            className="mb-4"
            title="Ingresos recurrentes"
            description="El sueldo se confirma por periodo. El extra se registra como ingreso cada vez que entra."
          />
            {templates && templates.length > 0 ? (
              <div className="mb-4">
                <EmeraldHero>
                  <HeroKicker>Se confirman solos</HeroKicker>
                  <div className="mb-3">
                    <HeroAmount
                      value={String(templates.length)}
                      caption={templates.length === 1 ? "plantilla" : "plantillas"}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <HeroChip
                      value={String(templates.filter((row) => isRecurrenceDue(row)).length)}
                      label="listas para registrar"
                    />
                    <HeroChip
                      value={String(templates.filter((row) => row.isActive).length)}
                      label="activas"
                    />
                  </div>
                </EmeraldHero>
              </div>
            ) : null}
            {loading && !templates ? (
              <Text size="caption" tone="muted">Cargando recurrencias…</Text>
            ) : error && !templates ? (
              <div className="rounded-[1.5rem] p-5 shadow-sm" style={{ backgroundColor: P.card }}>
                <Text size="body-sm" tone="danger" className="mb-4">{error}</Text>
                <Button onClick={() => void load()} loading={loading}>Reintentar</Button>
              </div>
            ) : templates && templates.length === 0 ? (
              <EmptyState
                title="Sin ingresos recurrentes"
                description="Crea una plantilla para tu sueldo. El extra no es recurrente: regístralo como ingreso cuando entre."
                actionLabel="Nueva recurrencia"
                onAction={onCreate}
              />
            ) : (
              <div className="space-y-2">
                {templates?.map((template) => {
                  const status = recurrenceStatus(template);
                  const due = isRecurrenceDue(template);
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => onOpen(template)}
                      className="w-full flex items-center gap-3 rounded-[1.5rem] p-4 shadow-sm text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{ backgroundColor: P.card }}
                    >
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0"
                        style={{ backgroundColor: due ? "#E8F4EF" : P.sub }}
                      >
                        {template.category?.icon?.trim() || "🔁"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: P.text }}>
                          {template.description?.trim() || template.category?.name || "Ingreso recurrente"}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: P.muted }}>
                          {frequencyLabel(template.frequency)}
                          {" · "}
                          {recurrenceStatusLabel(status)}
                          {due ? " · Listo para registrar" : ` · Próximo ${template.nextOccurrence}`}
                        </p>
                        {due ? (
                          <span
                            className="inline-block mt-1.5 text-[9px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5"
                            style={{ backgroundColor: "#E8F4EF", color: P.sageDk }}
                          >
                            Listo
                          </span>
                        ) : null}
                      </div>
                      <span className="text-sm font-bold flex-shrink-0 font-sans" style={{ color: P.sageDk }}>
                        {formatCompactMoney(template.amount)}
                      </span>
                      <NavChevron />
                    </button>
                  );
                })}
              </div>
            )}
          </PullToRefresh>
      </FlowScreen>
    </div>
  );
}
