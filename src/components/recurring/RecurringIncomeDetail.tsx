"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/nido/Button";
import { FieldError } from "@/components/nido/Field";
import { TextLink } from "@/components/nido/TextLink";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
import { Text } from "@/components/nido/Typography";
import {
  canMutateRecurrence,
  formatCompactMoney,
  frequencyLabel,
  isRecurrenceDue,
  recurrenceStatus,
  recurrenceStatusLabel,
  type RecurringIncomeTemplate,
} from "@/lib/nido/financial";
import { canSubmitRecurrence, materializeRecurringIncome, setRecurringIncomeActive } from "@/lib/nido/recurring-incomes";
import { P } from "@/lib/palette";

export function RecurringIncomeDetail({
  template,
  currentUserId,
  onClose,
  onEdit,
  onChanged,
}: {
  template: RecurringIncomeTemplate;
  currentUserId: string | null;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const ids = useId();
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canMutate = canMutateRecurrence(template, currentUserId);
  const status = recurrenceStatus(template);
  const due = isRecurrenceDue(template);

  const run = async (action: () => Promise<{ ok: true } | { ok: false; error: { message: string } }>) => {
    if (!canSubmitRecurrence(submitting) || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    const result = await action();
    if (result.ok === false) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(result.error.message);
      return;
    }
    onChanged();
  };

  return (
    <div className="absolute inset-0 z-30">
      <FlowScreen
        lockViewport
        className="h-full min-h-0"
        footer={
          canMutate ? (
            <ScreenFooter>
              <div className="space-y-2">
                {due ? (
                  <Button
                    loading={submitting}
                    onClick={() => void run(() => materializeRecurringIncome(template.id, template.nextOccurrence))}
                  >
                    Registrar este periodo
                  </Button>
                ) : null}
                {status !== "ended" ? (
                  <Button
                    variant={due ? "ghost" : "primary"}
                    loading={submitting}
                    onClick={() =>
                      void run(() => setRecurringIncomeActive(template.id, !template.isActive))
                    }
                  >
                    {template.isActive ? "Pausar plantilla" : "Reactivar plantilla"}
                  </Button>
                ) : null}
              </div>
            </ScreenFooter>
          ) : undefined
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0">
            <BackLink onClick={onClose} label="Recurrencias" />
            <ScreenIntro
              className="mb-4"
              title={template.description?.trim() || template.category?.name || "Ingreso recurrente"}
              description="Plantilla. No es un ingreso contabilizado."
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6 space-y-3">
            {error ? <FieldError id={`${ids}-error`}>{error}</FieldError> : null}

            <div className="rounded-2xl p-4" style={{ backgroundColor: P.card }}>
              <Text size="caption" tone="muted">Monto</Text>
              <p className="text-lg font-semibold" style={{ color: P.text }}>
                {formatCompactMoney(template.amount)}
              </p>
              <Text size="caption" tone="muted" className="mt-3">
                {template.category?.name ?? "Categoría"} · {frequencyLabel(template.frequency)} ·{" "}
                {recurrenceStatusLabel(status)}
              </Text>
              <Text size="caption" tone="muted" className="mt-2">
                Próximo movimiento: {template.nextOccurrence}
              </Text>
              {due ? (
                <Text size="caption" className="mt-2" tone="muted">
                  Este periodo ya se puede registrar. Hasta entonces no entra en tus totales.
                </Text>
              ) : (
                <Text size="caption" className="mt-2" tone="muted">
                  El próximo periodo se podrá registrar a partir de esa fecha. Guardar la plantilla no crea ingresos futuros.
                </Text>
              )}
            </div>

            {canMutate ? (
              <TextLink onClick={onEdit}>Editar plantilla</TextLink>
            ) : (
              <Text size="caption" tone="muted">
                Solo quien creó esta recurrencia puede editarla o registrarla.
              </Text>
            )}
          </div>
        </div>
      </FlowScreen>
    </div>
  );
}
