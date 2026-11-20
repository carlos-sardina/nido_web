"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/nido/Button";
import { ChoiceCard } from "@/components/nido/ChoiceCard";
import {
  Field,
  FieldError,
  FieldLabel,
  MoneyField,
  TextInput,
} from "@/components/nido/Field";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
import { Text } from "@/components/nido/Typography";
import { registerPurchasePayments } from "@/lib/nido/compras-actions";
import {
  formatExactMoney,
  openPurchaseBalance,
  parseMoney,
  remainingInstallmentCount,
  resolvePurchaseEmoji,
  sumMoney,
  todayIso,
  unpaidInstallments,
  type PurchasePaymentKind,
  type PurchaseRow,
} from "@/lib/nido/financial";
import type { HouseholdMemberView } from "@/lib/nido/types";
import { P } from "@/lib/palette";

type ItemDraft = {
  selected: boolean;
  kind: PurchasePaymentKind;
  count: number;
  capitalAmount: string;
};

function defaultDraft(purchase: PurchaseRow): ItemDraft {
  const remaining = remainingInstallmentCount(purchase);
  return {
    selected: false,
    kind: remaining > 0 ? "installment" : "payoff",
    count: 1,
    capitalAmount: "",
  };
}

function itemAmount(purchase: PurchaseRow, draft: ItemDraft): number {
  if (!draft.selected) return 0;
  if (draft.kind === "payoff") return openPurchaseBalance(purchase);
  if (draft.kind === "capital") {
    return parseMoney(draft.capitalAmount.replace(",", ".")) ?? 0;
  }
  const unpaid = unpaidInstallments(purchase);
  return sumMoney(unpaid.slice(0, Math.max(1, draft.count)).map((row) => row.amount));
}

export function PurchasePaymentFlow({
  householdId,
  members,
  currentUserId,
  purchases,
  initialPurchaseId,
  onClose,
  onDone,
}: {
  householdId: string;
  members: HouseholdMemberView[];
  currentUserId: string | null;
  purchases: PurchaseRow[];
  initialPurchaseId?: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const ids = useId();
  const payable = useMemo(
    () =>
      purchases.filter((purchase) => {
        if (purchase.paymentMethod === "msi") {
          return remainingInstallmentCount(purchase) > 0;
        }
        const paid = sumMoney(purchase.payments.map((row) => row.amount));
        return paid < purchase.grossAmount;
      }),
    [purchases],
  );

  const [memberId, setMemberId] = useState(
    () => currentUserId ?? members[0]?.userId ?? "",
  );
  const [paidAt, setPaidAt] = useState(todayIso);
  const [notes, setNotes] = useState("");
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>(() => {
    const next: Record<string, ItemDraft> = {};
    for (const purchase of purchases) {
      const draft = defaultDraft(purchase);
      if (initialPurchaseId && purchase.id === initialPurchaseId) {
        draft.selected = remainingInstallmentCount(purchase) > 0 || purchase.paymentMethod === "cash";
      }
      next[purchase.id] = draft;
    }
    return next;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPurchases = payable.filter((purchase) => drafts[purchase.id]?.selected);
  const total = sumMoney(
    selectedPurchases.map((purchase) => itemAmount(purchase, drafts[purchase.id] ?? defaultDraft(purchase))),
  );

  const updateDraft = (purchaseId: string, patch: Partial<ItemDraft>) => {
    setDrafts((current) => ({
      ...current,
      [purchaseId]: {
        ...(current[purchaseId] ?? defaultDraft(payable.find((p) => p.id === purchaseId)!)),
        ...patch,
      },
    }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!memberId) {
      setError("Elige quién depositó.");
      return;
    }
    if (selectedPurchases.length === 0) {
      setError("Elige al menos una compra.");
      return;
    }

    for (const purchase of selectedPurchases) {
      const draft = drafts[purchase.id] ?? defaultDraft(purchase);
      const kind =
        remainingInstallmentCount(purchase) === 0 && draft.kind !== "capital"
          ? "payoff"
          : draft.kind;
      if (kind === "capital") {
        const amount = parseMoney(draft.capitalAmount.replace(",", "."));
        const balance = openPurchaseBalance(purchase);
        if (amount == null || amount <= 0) {
          setError(`Ingresa un monto válido para ${purchase.name}.`);
          return;
        }
        if (amount > balance) {
          setError(`El abono de ${purchase.name} no puede ser mayor al saldo pendiente.`);
          return;
        }
      }
    }

    setSubmitting(true);
    setError(null);
    const result = await registerPurchasePayments({
      householdId,
      memberId,
      paidAt,
      notes: notes.trim() || null,
      items: selectedPurchases.map((purchase) => {
        const draft = drafts[purchase.id] ?? defaultDraft(purchase);
        const kind =
          remainingInstallmentCount(purchase) === 0 && draft.kind !== "capital"
            ? "payoff"
            : draft.kind;
        return {
          purchaseId: purchase.id,
          kind,
          count: kind === "installment" ? draft.count : undefined,
          amount:
            kind === "capital"
              ? parseMoney(draft.capitalAmount.replace(",", ".")) ?? undefined
              : undefined,
        };
      }),
    });
    setSubmitting(false);
    if (result.ok === false) {
      setError(result.error.message);
      return;
    }
    onDone();
  };

  return (
    <div className="absolute inset-0 z-40" style={{ backgroundColor: P.bgL }}>
      <FlowScreen
        lockViewport
        header={<BackLink onClick={onClose} />}
        footer={
          <ScreenFooter>
            {error ? (
              <Text size="body-sm" tone="danger" className="mb-3">
                {error}
              </Text>
            ) : null}
            <Button
              form={`${ids}-form`}
              type="submit"
              loading={submitting}
              disabled={selectedPurchases.length === 0 || total <= 0}
            >
              Registrar pago{total > 0 ? ` · ${formatExactMoney(total)}` : ""}
            </Button>
          </ScreenFooter>
        }
      >
        <ScreenIntro
          emoji="💳"
          emojiPlacement="inline"
          title="Registrar un pago"
          description="Cuota, abono a capital u otra liquidación de alguien del Nido."
        />

        <form id={`${ids}-form`} className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <FieldLabel>Quién depositó</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              {members.map((member) => (
                <ChoiceCard
                  key={member.userId}
                  title={member.displayName}
                  selected={memberId === member.userId}
                  onClick={() => setMemberId(member.userId)}
                />
              ))}
            </div>
          </div>

          <Field>
            <FieldLabel htmlFor={`${ids}-date`}>Fecha del pago</FieldLabel>
            <TextInput
              id={`${ids}-date`}
              type="date"
              value={paidAt}
              onChange={(event) => setPaidAt(event.target.value)}
            />
          </Field>

          {payable.length === 0 ? (
            <Text size="body-sm" tone="muted">
              No hay compras con saldo pendiente.
            </Text>
          ) : (
            <div className="space-y-3">
              <FieldLabel>Compras a cubrir</FieldLabel>
              {payable.map((purchase) => {
                const draft = drafts[purchase.id] ?? defaultDraft(purchase);
                const remaining = remainingInstallmentCount(purchase);
                const balance = openPurchaseBalance(purchase);
                const amount = itemAmount(purchase, draft);
                return (
                  <div
                    key={purchase.id}
                    className="rounded-[1.25rem] p-3.5 space-y-3"
                    style={{
                      backgroundColor: draft.selected ? "rgba(47,125,102,0.10)" : P.card,
                      boxShadow: "0 1px 2px rgba(47,42,40,0.04)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => updateDraft(purchase.id, { selected: !draft.selected })}
                      className="w-full flex items-start gap-3 text-left"
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
                        style={{ backgroundColor: P.sub }}
                        aria-hidden="true"
                      >
                        {resolvePurchaseEmoji(purchase.emoji)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold" style={{ color: P.text }}>
                          {purchase.name}
                        </p>
                        <Text size="caption" tone="muted" className="mt-0.5">
                          {remaining > 0
                            ? `${remaining} mensualidades · ${formatExactMoney(balance)}`
                            : `Pendiente · ${formatExactMoney(balance || purchase.grossAmount)}`}
                        </Text>
                      </div>
                      <span
                        className="mt-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                        style={{
                          backgroundColor: draft.selected ? P.sage : P.sub,
                          color: draft.selected ? "#fff" : P.muted,
                        }}
                        aria-hidden="true"
                      >
                        {draft.selected ? "✓" : ""}
                      </span>
                    </button>

                    {draft.selected ? (
                      <div className="space-y-2 pl-1">
                        {remaining > 0 ? (
                          <>
                            <ChoiceCard
                              title="Pagar cuota"
                              description={
                                draft.kind === "installment"
                                  ? draft.count > 1
                                    ? `${draft.count} cuotas · ${formatExactMoney(amount)}`
                                    : `Siguiente cuota · ${formatExactMoney(
                                        itemAmount(purchase, { ...draft, kind: "installment" }),
                                      )}`
                                  : "Cubre la siguiente mensualidad"
                              }
                              selected={draft.kind === "installment"}
                              onClick={() => updateDraft(purchase.id, { kind: "installment" })}
                            />
                            <ChoiceCard
                              title="Otro monto"
                              description="Abonar a capital y acortar el plazo"
                              selected={draft.kind === "capital"}
                              onClick={() => updateDraft(purchase.id, { kind: "capital" })}
                            />
                            <ChoiceCard
                              title="Desparcializar / de contado"
                              description={`Liquidar ${formatExactMoney(balance)} restantes`}
                              selected={draft.kind === "payoff"}
                              onClick={() => updateDraft(purchase.id, { kind: "payoff" })}
                            />
                            {draft.kind === "installment" && remaining > 1 ? (
                              <Field>
                                <FieldLabel htmlFor={`${ids}-count-${purchase.id}`}>
                                  ¿Cuántas cuotas?
                                </FieldLabel>
                                <TextInput
                                  id={`${ids}-count-${purchase.id}`}
                                  type="number"
                                  min={1}
                                  max={remaining}
                                  value={String(draft.count)}
                                  onChange={(event) => {
                                    const next = Number(event.target.value);
                                    updateDraft(purchase.id, {
                                      count: Number.isFinite(next)
                                        ? Math.min(remaining, Math.max(1, Math.trunc(next)))
                                        : 1,
                                    });
                                  }}
                                />
                              </Field>
                            ) : null}
                            {draft.kind === "capital" ? (
                              <div className="space-y-1">
                                <MoneyField
                                  id={`${ids}-capital-${purchase.id}`}
                                  label="Monto a capital"
                                  value={draft.capitalAmount}
                                  onChange={(value) =>
                                    updateDraft(purchase.id, { capitalAmount: value })
                                  }
                                  placeholder={`Máx. ${formatExactMoney(balance)}`}
                                />
                                <Text size="caption" tone="muted">
                                  Se aplica desde las últimas cuotas para reducir el plazo.
                                </Text>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <ChoiceCard
                              title="Otro monto"
                              description="Abonar parte del pendiente"
                              selected={draft.kind === "capital"}
                              onClick={() => updateDraft(purchase.id, { kind: "capital" })}
                            />
                            <ChoiceCard
                              title="Pagar de contado"
                              description={`Liquidar ${formatExactMoney(balance)}`}
                              selected={draft.kind === "payoff"}
                              onClick={() => updateDraft(purchase.id, { kind: "payoff" })}
                            />
                            {draft.kind === "capital" ? (
                              <MoneyField
                                id={`${ids}-capital-${purchase.id}`}
                                label="Monto"
                                value={draft.capitalAmount}
                                onChange={(value) =>
                                  updateDraft(purchase.id, { capitalAmount: value })
                                }
                                placeholder={`Máx. ${formatExactMoney(balance)}`}
                              />
                            ) : (
                              <Text size="caption" tone="muted">
                                Monto: {formatExactMoney(amount)}
                              </Text>
                            )}
                          </>
                        )}
                        {draft.kind === "payoff" && remaining > 0 ? (
                          <Text size="caption" tone="muted">
                            Monto: {formatExactMoney(amount)}
                          </Text>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          <Field>
            <FieldLabel htmlFor={`${ids}-notes`}>Nota (opcional)</FieldLabel>
            <TextInput
              id={`${ids}-notes`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Transferencia, efectivo…"
            />
            {notes.length > 200 ? <FieldError>Máximo 200 caracteres.</FieldError> : null}
          </Field>
        </form>
      </FlowScreen>
    </div>
  );
}
