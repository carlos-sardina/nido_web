"use client";

import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/nido/Button";
import { ChoiceCard } from "@/components/nido/ChoiceCard";
import { CategoryEmojiPicker } from "@/components/nido/CategoryEmojiField";
import {
  Field,
  FieldError,
  FieldLabel,
  MoneyField,
  TextInput,
} from "@/components/nido/Field";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
import { Text } from "@/components/nido/Typography";
import { canSubmitPurchase, createPurchase } from "@/lib/nido/compras-actions";
import {
  buildMsiInstallmentPlan,
  DEFAULT_PURCHASE_EMOJI,
  msiFirstDueDate,
  parseMoney,
  purchaseAmountMessage,
  purchaseDateMessage,
  purchaseNameMessage,
  QUICK_PURCHASE_EMOJIS,
  sharesMessage,
  todayIso,
  type PaymentCardRow,
  type PurchaseBonusInput,
  type PurchaseBonusType,
  type PurchasePaymentMethod,
} from "@/lib/nido/financial";
import type { HouseholdMemberView } from "@/lib/nido/types";
import { P } from "@/lib/palette";

type FieldErrors = {
  name?: string;
  amount?: string;
  date?: string;
  method?: string;
  card?: string;
  months?: string;
  shares?: string;
  bonus?: string;
  form?: string;
};

export function PurchaseFlow({
  householdId,
  members,
  cards,
  onClose,
  onDone,
  onNeedCard,
}: {
  householdId: string;
  members: HouseholdMemberView[];
  cards: PaymentCardRow[];
  onClose: () => void;
  onDone: () => void;
  onNeedCard: () => void;
}) {
  const ids = useId();
  const submittingRef = useRef(false);
  const equalShare = members.length > 0 ? Math.round((10000 / members.length)) / 100 : 100;
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(DEFAULT_PURCHASE_EMOJI);
  const [store, setStore] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(todayIso());
  const [method, setMethod] = useState<PurchasePaymentMethod>("msi");
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [msiMonths, setMsiMonths] = useState("12");
  const [shares, setShares] = useState(() =>
    members.map((member) => ({ memberId: member.userId, percent: equalShare })),
  );
  const [includeBonus, setIncludeBonus] = useState(false);
  const [bonusType, setBonusType] = useState<PurchaseBonusType>("cashback");
  const [bonusLabel, setBonusLabel] = useState("Bonificación Buen Fin");
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusExpected, setBonusExpected] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const selectedCard = cards.find((card) => card.id === cardId) ?? null;
  const preview = useMemo(() => {
    const parsed = parseMoney(amount);
    const months = Number(msiMonths);
    if (method !== "msi" || parsed == null || !selectedCard || !Number.isInteger(months) || months < 2) {
      return null;
    }
    const first = msiFirstDueDate(purchasedAt, selectedCard.cutDay, selectedCard.paymentDay);
    if (!first) return null;
    return buildMsiInstallmentPlan(parsed, months, first);
  }, [amount, method, msiMonths, purchasedAt, selectedCard]);

  const setSharePercent = (memberId: string, raw: string) => {
    const value = Number(raw);
    setShares((current) =>
      current.map((share) =>
        share.memberId === memberId
          ? { ...share, percent: Number.isFinite(value) ? value : 0 }
          : share,
      ),
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmitPurchase(submitting) || submittingRef.current) return;

    const nextErrors: FieldErrors = {};
    const nameMessage = purchaseNameMessage(name);
    if (nameMessage) nextErrors.name = nameMessage;

    const parsedAmount = parseMoney(amount);
    const amountMessage = purchaseAmountMessage(parsedAmount);
    if (amountMessage) nextErrors.amount = amountMessage;

    const dateMessage = purchaseDateMessage(purchasedAt);
    if (dateMessage) nextErrors.date = dateMessage;

    if (!method) nextErrors.method = "Elige contado o MSI.";
    if (method === "msi") {
      if (!cardId) nextErrors.card = "Elige la tarjeta o agrega una.";
      const months = Number(msiMonths);
      if (!Number.isInteger(months) || months < 2 || months > 48) {
        nextErrors.months = "Los MSI deben ser entre 2 y 48 meses.";
      }
    }

    const shareError = sharesMessage(shares, members.map((member) => member.userId));
    if (shareError) nextErrors.shares = shareError;

    const bonuses: PurchaseBonusInput[] = [];
    if (includeBonus) {
      const bonusParsed = parseMoney(bonusAmount);
      if (!bonusLabel.trim() || bonusParsed == null || !bonusExpected.trim()) {
        nextErrors.bonus = "Completa la bonificación o desactívala.";
      } else {
        bonuses.push({
          bonusType,
          label: bonusLabel,
          amount: bonusParsed,
          expectedAt: bonusExpected,
        });
      }
    }

    if (Object.keys(nextErrors).length > 0 || parsedAmount == null) {
      setErrors(nextErrors);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});

    const result = await createPurchase({
      householdId,
      name,
      emoji,
      store,
      description,
      purchasedAt,
      grossAmount: parsedAmount,
      paymentMethod: method,
      msiMonths: method === "msi" ? Number(msiMonths) : null,
      cardId: method === "msi" ? cardId : null,
      shares,
      bonuses,
      cards,
      activeMemberIds: members.map((member) => member.userId),
    });

    submittingRef.current = false;
    setSubmitting(false);

    if (result.ok === false) {
      setErrors({ form: result.error.message });
      return;
    }
    onDone();
  };

  return (
    <div className="absolute inset-0 z-50">
      <FlowScreen
        lockViewport
        header={<BackLink onClick={onClose} />}
        footer={
          <ScreenFooter>
            {errors.form ? <FieldError>{errors.form}</FieldError> : null}
            <Button type="submit" form={`${ids}-form`} loading={submitting}>
              Guardar compra a plazos
            </Button>
          </ScreenFooter>
        }
      >
        <ScreenIntro
          title="Registrar compra a plazos"
          description="Para el amueblado y compras grandes del Nido, con MSI y bonificaciones."
        />

        <form id={`${ids}-form`} className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <FieldLabel>Emoji</FieldLabel>
            <CategoryEmojiPicker
              value={emoji}
              onChange={setEmoji}
              emojis={QUICK_PURCHASE_EMOJIS}
              fallback={DEFAULT_PURCHASE_EMOJI}
            />
          </div>

          <Field>
            <FieldLabel htmlFor={`${ids}-name`}>Qué compraron</FieldLabel>
            <TextInput
              id={`${ids}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Lavadora, refri, sofá…"
              invalid={Boolean(errors.name)}
            />
            {errors.name ? <FieldError>{errors.name}</FieldError> : null}
          </Field>

          <MoneyField
            id={`${ids}-amount`}
            label="Precio"
            value={amount}
            onChange={setAmount}
            invalid={Boolean(errors.amount)}
          />
          {errors.amount ? <FieldError>{errors.amount}</FieldError> : null}

          <Field>
            <FieldLabel htmlFor={`${ids}-date`}>Fecha de compra</FieldLabel>
            <TextInput
              id={`${ids}-date`}
              type="date"
              value={purchasedAt}
              onChange={(event) => setPurchasedAt(event.target.value)}
              invalid={Boolean(errors.date)}
            />
            {errors.date ? <FieldError>{errors.date}</FieldError> : null}
          </Field>

          <Field>
            <FieldLabel htmlFor={`${ids}-store`}>Tienda (opcional)</FieldLabel>
            <TextInput id={`${ids}-store`} value={store} onChange={(event) => setStore(event.target.value)} />
          </Field>

          <div className="space-y-2">
            <FieldLabel>Forma de pago</FieldLabel>
            <ChoiceCard
              title="Meses sin intereses"
              description="Genera calendario de cuotas"
              selected={method === "msi"}
              onClick={() => setMethod("msi")}
            />
            <ChoiceCard
              title="De contado"
              description="Pago único, sin cuotas"
              selected={method === "cash"}
              onClick={() => setMethod("cash")}
            />
            {errors.method ? <FieldError>{errors.method}</FieldError> : null}
          </div>

          {method === "msi" ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <FieldLabel>Tarjeta</FieldLabel>
                  <button type="button" className="text-xs font-semibold" style={{ color: P.brnDk }} onClick={onNeedCard}>
                    Agregar tarjeta
                  </button>
                </div>
                {cards.length === 0 ? (
                  <Text size="caption" tone="muted">
                    Primero agrega una tarjeta con día de corte y pago.
                  </Text>
                ) : (
                  cards.map((card) => (
                    <ChoiceCard
                      key={card.id}
                      title={`${card.label}${card.lastFour ? ` ····${card.lastFour}` : ""}`}
                      description={`A nombre de ${card.ownerName ?? "miembro"} · corte ${card.cutDay} · pago ${card.paymentDay}`}
                      selected={cardId === card.id}
                      onClick={() => setCardId(card.id)}
                    />
                  ))
                )}
                {errors.card ? <FieldError>{errors.card}</FieldError> : null}
              </div>

              <Field>
                <FieldLabel htmlFor={`${ids}-months`}>Meses MSI</FieldLabel>
                <TextInput
                  id={`${ids}-months`}
                  value={msiMonths}
                  inputMode="numeric"
                  onChange={(event) => setMsiMonths(event.target.value.replace(/\D/g, "").slice(0, 2))}
                  invalid={Boolean(errors.months)}
                />
                {errors.months ? <FieldError>{errors.months}</FieldError> : null}
              </Field>

              {preview && preview.length > 0 ? (
                <div className="rounded-2xl p-4" style={{ backgroundColor: P.sub }}>
                  <Text size="caption" tone="muted">
                    Primera cuota {preview[0].dueDate} · {preview.length} pagos de aprox.{" "}
                    ${preview[0].amount.toFixed(2)}
                  </Text>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="space-y-2">
            <FieldLabel>Cooperación</FieldLabel>
            {shares.map((share) => {
              const member = members.find((row) => row.userId === share.memberId);
              return (
                <div key={share.memberId} className="flex items-center gap-3">
                  <Text size="body-sm" className="flex-1">
                    {member?.displayName ?? "Miembro"}
                  </Text>
                  <div className="w-24">
                    <TextInput
                      value={String(share.percent)}
                      inputMode="decimal"
                      onChange={(event) => setSharePercent(share.memberId, event.target.value)}
                      aria-label={`Porcentaje de ${member?.displayName ?? "miembro"}`}
                    />
                  </div>
                  <Text size="caption" tone="muted">%</Text>
                </div>
              );
            })}
            {errors.shares ? <FieldError>{errors.shares}</FieldError> : null}
          </div>

          <ChoiceCard
            title="Agregar bonificación"
            description="Cashback o descuento diferido"
            selected={includeBonus}
            onClick={() => setIncludeBonus((value) => !value)}
          />

          {includeBonus ? (
            <div className="space-y-3 rounded-[1.5rem] p-4" style={{ backgroundColor: P.card }}>
              <ChoiceCard
                title="Cashback"
                selected={bonusType === "cashback"}
                onClick={() => setBonusType("cashback")}
              />
              <ChoiceCard
                title="Descuento diferido"
                selected={bonusType === "deferred_discount"}
                onClick={() => setBonusType("deferred_discount")}
              />
              <Field>
                <FieldLabel htmlFor={`${ids}-bonus-label`}>Nombre</FieldLabel>
                <TextInput
                  id={`${ids}-bonus-label`}
                  value={bonusLabel}
                  onChange={(event) => setBonusLabel(event.target.value)}
                />
              </Field>
              <MoneyField
                id={`${ids}-bonus-amount`}
                label="Monto"
                value={bonusAmount}
                onChange={setBonusAmount}
              />
              <Field>
                <FieldLabel htmlFor={`${ids}-bonus-date`}>Fecha esperada</FieldLabel>
                <TextInput
                  id={`${ids}-bonus-date`}
                  type="date"
                  value={bonusExpected}
                  onChange={(event) => setBonusExpected(event.target.value)}
                />
              </Field>
              {errors.bonus ? <FieldError>{errors.bonus}</FieldError> : null}
            </div>
          ) : null}

          <Field>
            <FieldLabel htmlFor={`${ids}-desc`}>Notas (opcional)</FieldLabel>
            <TextInput
              id={`${ids}-desc`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </form>
      </FlowScreen>
    </div>
  );
}
