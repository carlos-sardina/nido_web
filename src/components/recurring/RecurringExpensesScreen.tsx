"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/nido/Button";
import { EmptyState } from "@/components/nido/EmptyState";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
import { Text } from "@/components/nido/Typography";
import {
  formatCompactMoney,
  frequencyLabel,
  isRecurrenceDue,
  recurrenceStatus,
  recurrenceStatusLabel,
  type RecurringExpenseTemplate,
} from "@/lib/nido/financial";
import { fetchRecurringExpenses } from "@/lib/nido/queries/recurring";
import { P } from "@/lib/palette";

export function RecurringExpensesScreen({
  householdId,
  onClose,
  onCreate,
  onOpen,
  refreshKey = 0,
}: {
  householdId: string;
  onClose: () => void;
  onCreate: () => void;
  onOpen: (template: RecurringExpenseTemplate) => void;
  refreshKey?: number;
}) {
  const [templates, setTemplates] = useState<RecurringExpenseTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchRecurringExpenses(householdId);
    if (result.ok === false) {
      setError(result.error.message);
      setTemplates(null);
      setLoading(false);
      return;
    }
    setError(null);
    setTemplates(result.data);
    setLoading(false);
  }, [householdId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <div className="absolute inset-0 z-30">
      <FlowScreen
        lockViewport
        className="h-full min-h-0"
        footer={
          <ScreenFooter>
            <Button onClick={onCreate}>Nueva recurrencia</Button>
          </ScreenFooter>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0">
            <BackLink onClick={onClose} label="Gastos" />
            <ScreenIntro
              className="mb-4"
              title="Gastos recurrentes"
              description="Las plantillas no se suman a tus gastos. Solo cuentan los periodos que registres."
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
            {loading && !templates ? (
              <Text size="caption" tone="muted">Cargando recurrencias…</Text>
            ) : error && !templates ? (
              <div className="rounded-[1.5rem] p-5 shadow-sm" style={{ backgroundColor: P.card }}>
                <Text size="body-sm" tone="danger" className="mb-4">{error}</Text>
                <Button onClick={() => void load()} loading={loading}>Reintentar</Button>
              </div>
            ) : templates && templates.length === 0 ? (
              <EmptyState
                title="Sin gastos recurrentes"
                description="Crea una plantilla para renta, servicios u otras cuotas. No se registra un gasto hasta que confirmes el periodo."
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
                      className="w-full flex items-center gap-3 rounded-2xl p-4 shadow-sm text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{ backgroundColor: P.card }}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                        style={{ backgroundColor: P.sub }}
                      >
                        {template.category?.icon?.trim() || "🔁"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: P.text }}>
                          {template.description?.trim() || template.category?.name || "Gasto recurrente"}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: P.muted }}>
                          {frequencyLabel(template.frequency)}
                          {" · "}
                          {recurrenceStatusLabel(status)}
                          {due ? " · Listo para registrar" : ` · Próximo ${template.nextOccurrence}`}
                        </p>
                      </div>
                      <span className="text-xs font-semibold flex-shrink-0" style={{ color: P.text }}>
                        {formatCompactMoney(template.amount)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </FlowScreen>
    </div>
  );
}
