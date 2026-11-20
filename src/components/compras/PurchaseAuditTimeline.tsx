"use client";

import { useEffect, useState } from "react";
import { Heading, Text } from "@/components/nido/Typography";
import {
  formatExactMoney,
  formatRelativeActivityDate,
  purchaseAuditActionLabel,
  purchaseAuditEntityLabel,
  type PurchaseAuditEvent,
} from "@/lib/nido/financial";
import { fetchPurchaseAuditEvents } from "@/lib/nido/queries/compras";
import { P } from "@/lib/palette";

function metaLine(event: PurchaseAuditEvent): string | null {
  const meta = event.meta;
  const bits: string[] = [];
  const memberName = typeof meta.member_name === "string" ? meta.member_name : null;
  const paidAt = typeof meta.paid_at === "string" ? meta.paid_at : null;
  const kind = typeof meta.kind === "string" ? meta.kind : null;
  const notes = typeof meta.notes === "string" && meta.notes.trim() ? meta.notes.trim() : null;
  const installmentNumber =
    typeof meta.installment_number === "number" ? meta.installment_number : null;

  if (event.entityType === "purchase_payment") {
    if (memberName) bits.push(`Depositó ${memberName}`);
    if (paidAt) bits.push(`día ${paidAt}`);
    if (kind === "capital") bits.push("abono a capital");
    if (kind === "payoff") bits.push("liquidación");
    if (kind === "installment") bits.push("cuota(s)");
    if (notes) bits.push(notes);
  } else if (event.entityType === "purchase_installment" && installmentNumber != null) {
    bits.push(`Cuota ${installmentNumber}`);
    if (paidAt) bits.push(`día ${paidAt}`);
  } else if (event.entityType === "purchase_share") {
    const shareMember = typeof meta.member_name === "string" ? meta.member_name : null;
    const percent = typeof meta.percent === "number" ? meta.percent : null;
    if (shareMember) bits.push(shareMember);
    if (percent != null) bits.push(`${percent}%`);
  }

  return bits.length > 0 ? bits.join(" · ") : null;
}

export function PurchaseAuditTimeline({
  householdId,
  purchaseId,
  refreshKey = 0,
  title = "Historial / auditoría",
  emptyLabel = "Todavía no hay movimientos registrados en esta compra.",
  limit = 60,
  onSelectPurchase,
}: {
  householdId: string;
  purchaseId?: string | null;
  refreshKey?: number;
  title?: string;
  emptyLabel?: string;
  limit?: number;
  onSelectPurchase?: (purchaseId: string) => void;
}) {
  const [events, setEvents] = useState<PurchaseAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchPurchaseAuditEvents({
      householdId,
      purchaseId: purchaseId ?? null,
      limit,
    }).then((result) => {
      if (cancelled) return;
      if (result.ok === false) {
        setError(result.error.message);
        setEvents([]);
        setLoading(false);
        return;
      }
      setEvents(result.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [householdId, purchaseId, refreshKey, limit]);

  return (
    <div className="mt-5">
      <Heading as="h3" size="h3">
        {title}
      </Heading>
      <Text size="caption" tone="muted" className="mt-1">
        Solo lectura: altas, pagos, deshacer, bonos recibidos, cuotas, participaciones y ediciones. No se borra al deshacer.
      </Text>

      {loading ? (
        <Text size="caption" tone="muted" className="mt-3">
          Cargando historial…
        </Text>
      ) : null}

      {error ? (
        <Text size="caption" className="mt-3" style={{ color: P.brnDk }}>
          {error}
        </Text>
      ) : null}

      {!loading && !error && events.length === 0 ? (
        <Text size="caption" tone="muted" className="mt-3">
          {emptyLabel}
        </Text>
      ) : null}

      {!loading && events.length > 0 ? (
        <div className="mt-3 space-y-2">
          {events.map((event) => {
            const extra = metaLine(event);
            const occurredDate = event.occurredAt.slice(0, 10);
            const canOpen =
              Boolean(onSelectPurchase) &&
              Boolean(event.purchaseId) &&
              event.entityType !== "payment_card";
            const body = (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-left">
                  <p className="text-sm font-semibold" style={{ color: P.text }}>
                    {(event.icon ? `${event.icon} ` : "") + event.label}
                  </p>
                  <Text size="caption" tone="muted">
                    {[
                      purchaseAuditActionLabel(event.action),
                      purchaseAuditEntityLabel(event.entityType),
                      event.actorName ? `por ${event.actorName}` : null,
                      formatRelativeActivityDate(occurredDate, event.occurredAt),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  {event.detail ? (
                    <Text size="caption" className="mt-1" style={{ color: P.text }}>
                      {event.detail}
                    </Text>
                  ) : null}
                  {extra ? (
                    <Text size="caption" tone="muted" className="mt-1">
                      {extra}
                    </Text>
                  ) : null}
                </div>
                {event.amount != null ? (
                  <p className="text-sm font-bold font-sans shrink-0" style={{ color: P.text }}>
                    {formatExactMoney(event.amount)}
                  </p>
                ) : null}
              </div>
            );
            if (canOpen && event.purchaseId) {
              return (
                <button
                  key={event.id}
                  type="button"
                  className="w-full rounded-2xl p-4 text-left transition-all active:scale-[0.99]"
                  style={{ backgroundColor: P.card }}
                  onClick={() => onSelectPurchase?.(event.purchaseId!)}
                >
                  {body}
                </button>
              );
            }
            return (
              <div key={event.id} className="rounded-2xl p-4" style={{ backgroundColor: P.card }}>
                {body}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
