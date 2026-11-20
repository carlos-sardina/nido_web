"use client";

import { useState } from "react";
import { PurchaseAuditTimeline } from "@/components/compras/PurchaseAuditTimeline";
import { Button } from "@/components/nido/Button";
import { ChoiceCard } from "@/components/nido/ChoiceCard";
import {
  Field,
  FieldLabel,
  MoneyField,
  TextInput,
} from "@/components/nido/Field";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
import { Heading, Text } from "@/components/nido/Typography";
import {
  createPurchaseBonus,
  markInstallmentPaid,
  softDeletePurchase,
  softDeletePurchasePayment,
  updatePurchaseBonus,
} from "@/lib/nido/compras-actions";
import {
  bonusTypeLabel,
  formatExactMoney,
  installmentHasLedgerPayment,
  isPurchaseBonusType,
  memberPaymentTotals,
  netPurchaseCost,
  openPurchaseBalance,
  parseMoney,
  paymentMethodLabel,
  purchasePaymentKindLabel,
  remainingInstallmentCount,
  remainingMonthsCaption,
  resolvePurchaseEmoji,
  sharesCaption,
  todayIso,
  type PurchaseBonusType,
  type PurchaseRow,
} from "@/lib/nido/financial";
import { P } from "@/lib/palette";

export function PurchaseDetail({
  purchase,
  onClose,
  onChanged,
  onDeleted,
  onRegisterPayment,
}: {
  purchase: PurchaseRow;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
  onRegisterPayment?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBonus, setShowBonus] = useState(false);
  const [bonusType, setBonusType] = useState<PurchaseBonusType>("cashback");
  const [bonusLabel, setBonusLabel] = useState("");
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusExpected, setBonusExpected] = useState("");
  const [auditKey, setAuditKey] = useState(0);
  const bumpAudit = () => setAuditKey((value) => value + 1);
  const net = netPurchaseCost(purchase.grossAmount, purchase.bonuses);
  const remaining = remainingInstallmentCount(purchase);
  const remainingBalance = openPurchaseBalance(purchase);
  const canRegisterPayment = remainingBalance > 0;
  const remainingCaption = remainingMonthsCaption(purchase);
  const payerTotals = memberPaymentTotals(purchase.payments);

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await softDeletePurchase(purchase.id);
    setBusy(false);
    if (result.ok === false) {
      setError(result.error.message);
      return;
    }
    onDeleted();
  };

  const togglePaid = async (installmentId: string, paidAt: string | null) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await markInstallmentPaid(installmentId, paidAt ? null : todayIso());
    setBusy(false);
    if (result.ok === false) {
      setError(result.error.message);
      return;
    }
    bumpAudit();
    onChanged();
  };

  const markBonusReceived = async (
    bonusId: string,
    label: string,
    amount: number,
    expectedAt: string,
    notes: string | null,
    receivedAt: string | null,
  ) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await updatePurchaseBonus({
      bonusId,
      label,
      amount,
      expectedAt,
      receivedAt: receivedAt ? null : todayIso(),
      notes,
    });
    setBusy(false);
    if (result.ok === false) {
      setError(result.error.message);
      return;
    }
    bumpAudit();
    onChanged();
  };

  const addBonus = async () => {
    if (busy) return;
    const amount = parseMoney(bonusAmount.replace(",", "."));
    if (!bonusLabel.trim() || amount == null || !bonusExpected.trim()) {
      setError("Completa la bonificación.");
      return;
    }
    if (!isPurchaseBonusType(bonusType)) {
      setError("Elige el tipo de bonificación.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createPurchaseBonus({
      purchaseId: purchase.id,
      bonusType,
      label: bonusLabel,
      amount,
      expectedAt: bonusExpected,
    });
    setBusy(false);
    if (result.ok === false) {
      setError(result.error.message);
      return;
    }
    setShowBonus(false);
    setBonusLabel("");
    setBonusAmount("");
    setBonusExpected("");
    bumpAudit();
    onChanged();
  };

  const undoPayment = async (paymentId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await softDeletePurchasePayment(paymentId);
    setBusy(false);
    if (result.ok === false) {
      setError(result.error.message);
      return;
    }
    bumpAudit();
    onChanged();
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
            {onRegisterPayment && canRegisterPayment ? (
              <Button className="mb-2" onClick={onRegisterPayment}>
                Registrar pago / desparcializar
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => void handleDelete()} loading={busy}>
              Eliminar compra a plazos
            </Button>
          </ScreenFooter>
        }
      >
        <ScreenIntro
          emoji={resolvePurchaseEmoji(purchase.emoji)}
          title={purchase.name}
          description={[
            paymentMethodLabel(purchase.paymentMethod),
            purchase.msiMonths ? `${purchase.msiMonths} MSI` : null,
            remainingCaption,
            purchase.store,
            purchase.purchasedAt,
          ]
            .filter(Boolean)
            .join(" · ")}
        />

        <div className="rounded-[1.5rem] p-5 shadow-sm space-y-2" style={{ backgroundColor: P.card }}>
          <div className="flex justify-between gap-3">
            <Text size="caption" tone="muted">Precio</Text>
            <p className="text-sm font-bold font-sans" style={{ color: P.text }}>
              {formatExactMoney(purchase.grossAmount)}
            </p>
          </div>
          <div className="flex justify-between gap-3">
            <Text size="caption" tone="muted">Neto con bono</Text>
            <p className="text-sm font-bold font-sans" style={{ color: P.sageDk }}>
              {formatExactMoney(net)}
            </p>
          </div>
          {canRegisterPayment ? (
            <div className="flex justify-between gap-3">
              <Text size="caption" tone="muted">Por depositar</Text>
              <p className="text-sm font-bold font-sans" style={{ color: P.text }}>
                {formatExactMoney(remainingBalance)}
              </p>
            </div>
          ) : null}
          {purchase.cardLabel ? (
            <div className="flex justify-between gap-3">
              <Text size="caption" tone="muted">Tarjeta</Text>
              <Text size="body-sm">
                {purchase.cardLabel}
                {purchase.cardOwnerName ? ` · ${purchase.cardOwnerName}` : ""}
              </Text>
            </div>
          ) : null}
          <div className="pt-1">
            <Text size="caption" tone="muted">{sharesCaption(purchase.shares)}</Text>
          </div>
          {purchase.description ? (
            <Text size="body-sm" className="pt-1">{purchase.description}</Text>
          ) : null}
        </div>

        <div className="mt-5">
          <Heading as="h3" size="h3">Quién ha depositado</Heading>
          {payerTotals.length === 0 ? (
            <Text size="caption" tone="muted" className="mt-2">
              Todavía no hay pagos registrados de miembros del Nido.
            </Text>
          ) : (
            <div className="mt-3 space-y-2">
              {payerTotals.map((payer) => (
                <div
                  key={payer.memberId}
                  className="rounded-2xl p-4 flex items-center justify-between gap-3"
                  style={{ backgroundColor: "rgba(47,125,102,0.10)" }}
                >
                  <p className="text-sm font-semibold" style={{ color: P.text }}>
                    {payer.memberName ?? "Miembro"}
                  </p>
                  <p className="text-sm font-bold font-sans" style={{ color: P.sageDk }}>
                    {formatExactMoney(payer.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {purchase.payments.length > 0 ? (
            <div className="mt-3 space-y-2">
              {purchase.payments.map((payment) => (
                <div key={payment.id} className="rounded-2xl p-4" style={{ backgroundColor: P.card }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: P.text }}>
                        {payment.memberName ?? "Miembro"}
                      </p>
                      <Text size="caption" tone="muted">
                        {purchasePaymentKindLabel(payment.kind)} · {payment.paidAt}
                        {payment.installmentIds.length > 0
                          ? ` · ${payment.installmentIds.length} cuota${payment.installmentIds.length === 1 ? "" : "s"}`
                          : ""}
                      </Text>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold font-sans" style={{ color: P.text }}>
                        {formatExactMoney(payment.amount)}
                      </p>
                      <button
                        type="button"
                        className="mt-1 text-xs font-semibold"
                        style={{ color: P.brnDk }}
                        onClick={() => void undoPayment(payment.id)}
                      >
                        Deshacer
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {purchase.installments.length > 0 ? (
          <div className="mt-5">
            <div className="flex items-end justify-between gap-3">
              <Heading as="h3" size="h3">Cuotas MSI</Heading>
              {remainingCaption ? (
                <Text size="caption" tone="muted">{remainingCaption}</Text>
              ) : null}
            </div>
            <div className="mt-3 space-y-2">
              {purchase.installments.map((installment) => {
                const linkedToPayment = installmentHasLedgerPayment(
                  installment.id,
                  purchase.payments,
                );
                // Ledger payments are undone from "Quién ha depositado".
                // Orphan paid_at (no ledger) can still be cleared here.
                const canClearOrphan = Boolean(installment.paidAt) && !linkedToPayment;
                return (
                  <div
                    key={installment.id}
                    className="rounded-2xl p-4 flex items-center justify-between gap-3"
                    style={{ backgroundColor: P.card }}
                  >
                    <div>
                      <p className="text-sm font-semibold" style={{ color: P.text }}>
                        Cuota {installment.installmentNumber}
                      </p>
                      <Text size="caption" tone="muted">
                        Vence {installment.dueDate}
                        {installment.paidAt ? ` · pagada ${installment.paidAt}` : " · pendiente"}
                      </Text>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold font-sans" style={{ color: P.text }}>
                        {formatExactMoney(installment.amount)}
                      </p>
                      {canClearOrphan ? (
                        <button
                          type="button"
                          className="mt-1 text-xs font-semibold"
                          style={{ color: P.brnDk }}
                          onClick={() => void togglePaid(installment.id, installment.paidAt)}
                        >
                          Marcar pendiente
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <Heading as="h3" size="h3">Bonificaciones</Heading>
            <button
              type="button"
              className="text-xs font-semibold"
              style={{ color: P.brnDk }}
              onClick={() => setShowBonus((value) => !value)}
            >
              {showBonus ? "Cancelar" : "Agregar"}
            </button>
          </div>

          {showBonus ? (
            <div className="mt-3 space-y-3 rounded-[1.5rem] p-4" style={{ backgroundColor: P.card }}>
              <ChoiceCard
                title="Cashback"
                description="Regresa a la tarjeta después"
                selected={bonusType === "cashback"}
                onClick={() => setBonusType("cashback")}
              />
              <ChoiceCard
                title="Descuento diferido"
                description="Bonificación o precio final más adelante"
                selected={bonusType === "deferred_discount"}
                onClick={() => setBonusType("deferred_discount")}
              />
              <Field>
                <FieldLabel htmlFor="bonus-label">Nombre</FieldLabel>
                <TextInput id="bonus-label" value={bonusLabel} onChange={(event) => setBonusLabel(event.target.value)} />
              </Field>
              <MoneyField
                id="bonus-amount"
                label="Monto"
                value={bonusAmount}
                onChange={setBonusAmount}
              />
              <Field>
                <FieldLabel htmlFor="bonus-expected">Fecha esperada</FieldLabel>
                <TextInput id="bonus-expected" type="date" value={bonusExpected} onChange={(event) => setBonusExpected(event.target.value)} />
              </Field>
              <Button onClick={() => void addBonus()} loading={busy}>Guardar bonificación</Button>
            </div>
          ) : null}

          <div className="mt-3 space-y-2">
            {purchase.bonuses.length === 0 ? (
              <Text size="caption" tone="muted">Todavía no hay bonificaciones.</Text>
            ) : (
              purchase.bonuses.map((bonus) => (
                <div key={bonus.id} className="rounded-2xl p-4" style={{ backgroundColor: P.card }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: P.text }}>{bonus.label}</p>
                      <Text size="caption" tone="muted">
                        {bonusTypeLabel(bonus.bonusType)} · espera {bonus.expectedAt}
                        {bonus.receivedAt ? ` · recibida ${bonus.receivedAt}` : " · pendiente"}
                      </Text>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold font-sans" style={{ color: P.sageDk }}>
                        −{formatExactMoney(bonus.amount)}
                      </p>
                      <button
                        type="button"
                        className="mt-1 text-xs font-semibold"
                        style={{ color: P.brnDk }}
                        onClick={() =>
                          void markBonusReceived(
                            bonus.id,
                            bonus.label,
                            bonus.amount,
                            bonus.expectedAt,
                            bonus.notes,
                            bonus.receivedAt,
                          )
                        }
                      >
                        {bonus.receivedAt ? "Marcar pendiente" : "Marcar recibida"}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <PurchaseAuditTimeline
          householdId={purchase.householdId}
          purchaseId={purchase.id}
          refreshKey={auditKey}
        />
      </FlowScreen>
    </div>
  );
}
