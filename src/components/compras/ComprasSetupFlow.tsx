"use client";

import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { OProgress2 } from "@/components/onboarding/OProgress2";
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
import { createPaymentCard, createPurchase } from "@/lib/nido/compras-actions";
import {
  buildMsiInstallmentPlan,
  cardDayMessage,
  cardLabelMessage,
  DEFAULT_PURCHASE_EMOJI,
  lastFourMessage,
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

type Step = "welcome" | "card" | "purchase" | "done";

type CardDraft = {
  label: string;
  bank: string;
  lastFour: string;
  ownerMemberId: string;
  cutDay: string;
  paymentDay: string;
};

type CardErrors = {
  label?: string;
  owner?: string;
  cutDay?: string;
  paymentDay?: string;
  lastFour?: string;
  form?: string;
};

type PurchaseErrors = {
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

function equalShares(members: HouseholdMemberView[]) {
  if (members.length === 0) return [];
  const base = Math.floor((100 * 100) / members.length) / 100;
  const shares = members.map((member) => ({ memberId: member.userId, percent: base }));
  const used = Math.round(shares.reduce((sum, row) => sum + row.percent, 0) * 100) / 100;
  const last = shares[shares.length - 1];
  if (last) last.percent = Math.round((last.percent + (100 - used)) * 100) / 100;
  return shares;
}

export function ComprasSetupFlow({
  householdId,
  members,
  currentUserId,
  onClose,
  onComplete,
}: {
  householdId: string;
  members: HouseholdMemberView[];
  currentUserId: string | null;
  onClose: () => void;
  onComplete: () => void;
}) {
  const ids = useId();
  const cardSubmittingRef = useRef(false);
  const purchaseSubmittingRef = useRef(false);

  const [step, setStep] = useState<Step>("welcome");
  const [cards, setCards] = useState<PaymentCardRow[]>([]);
  const [cardDraft, setCardDraft] = useState<CardDraft>(() => ({
    label: "",
    bank: "",
    lastFour: "",
    ownerMemberId: currentUserId ?? members[0]?.userId ?? "",
    cutDay: "15",
    paymentDay: "28",
  }));
  const [cardErrors, setCardErrors] = useState<CardErrors>({});
  const [cardSubmitting, setCardSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(DEFAULT_PURCHASE_EMOJI);
  const [store, setStore] = useState("");
  const [amount, setAmount] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(todayIso());
  const [method, setMethod] = useState<PurchasePaymentMethod>("msi");
  const [cardId, setCardId] = useState("");
  const [msiMonths, setMsiMonths] = useState("12");
  const [shares, setShares] = useState(() => equalShares(members));
  const [includeBonus, setIncludeBonus] = useState(false);
  const [bonusType, setBonusType] = useState<PurchaseBonusType>("cashback");
  const [bonusLabel, setBonusLabel] = useState("Bonificación Buen Fin");
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusExpected, setBonusExpected] = useState("");
  const [purchaseErrors, setPurchaseErrors] = useState<PurchaseErrors>({});
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false);

  const progressStep =
    step === "welcome" ? 1 : step === "card" ? 2 : step === "purchase" ? 3 : 4;

  const selectedCard = cards.find((card) => card.id === cardId) ?? cards[0] ?? null;
  const preview = useMemo(() => {
    const parsed = parseMoney(amount);
    const months = Number(msiMonths);
    const card = selectedCard;
    if (
      method !== "msi" ||
      parsed == null ||
      !card ||
      !Number.isInteger(months) ||
      months < 1 ||
      months > 48
    ) {
      return null;
    }
    const first = msiFirstDueDate(purchasedAt, card.cutDay, card.paymentDay);
    if (!first) return null;
    return buildMsiInstallmentPlan(parsed, months, first);
  }, [amount, method, msiMonths, purchasedAt, selectedCard]);

  const resetCardDraft = (preferOtherOwner = false) => {
    const usedOwners = new Set(cards.map((card) => card.ownerMemberId));
    const other = members.find((member) => !usedOwners.has(member.userId));
    setCardDraft({
      label: "",
      bank: "",
      lastFour: "",
      ownerMemberId:
        (preferOtherOwner && other?.userId) ||
        currentUserId ||
        members[0]?.userId ||
        "",
      cutDay: "15",
      paymentDay: "28",
    });
    setCardErrors({});
  };

  const handleBack = () => {
    if (step === "welcome") {
      onClose();
      return;
    }
    if (step === "card") {
      setStep("welcome");
      return;
    }
    if (step === "purchase") {
      setStep("card");
      return;
    }
    onComplete();
  };

  const saveCard = async (event: FormEvent) => {
    event.preventDefault();
    if (cardSubmitting || cardSubmittingRef.current) return;

    const nextErrors: CardErrors = {};
    const labelMessage = cardLabelMessage(cardDraft.label);
    if (labelMessage) nextErrors.label = labelMessage;
    if (!cardDraft.ownerMemberId) nextErrors.owner = "Elige a nombre de quién está la tarjeta.";
    const cut = Number(cardDraft.cutDay);
    const pay = Number(cardDraft.paymentDay);
    const cutMessage = cardDayMessage(Number.isFinite(cut) ? cut : null, "El día de corte");
    if (cutMessage) nextErrors.cutDay = cutMessage;
    const payMessage = cardDayMessage(Number.isFinite(pay) ? pay : null, "El día de pago");
    if (payMessage) nextErrors.paymentDay = payMessage;
    const fourMessage = lastFourMessage(cardDraft.lastFour);
    if (fourMessage) nextErrors.lastFour = fourMessage;

    if (Object.keys(nextErrors).length > 0) {
      setCardErrors(nextErrors);
      return;
    }

    cardSubmittingRef.current = true;
    setCardSubmitting(true);
    setCardErrors({});

    const result = await createPaymentCard({
      householdId,
      ownerMemberId: cardDraft.ownerMemberId,
      label: cardDraft.label,
      bank: cardDraft.bank,
      lastFour: cardDraft.lastFour,
      cutDay: cut,
      paymentDay: pay,
      activeMemberIds: members.map((member) => member.userId),
    });

    cardSubmittingRef.current = false;
    setCardSubmitting(false);

    if (result.ok === false) {
      setCardErrors({ form: result.error.message });
      return;
    }

    const owner = members.find((member) => member.userId === cardDraft.ownerMemberId);
    const created: PaymentCardRow = {
      id: result.data.id,
      householdId,
      ownerMemberId: cardDraft.ownerMemberId,
      ownerName: owner?.displayName ?? null,
      label: cardDraft.label.trim(),
      bank: cardDraft.bank.trim() || null,
      lastFour: cardDraft.lastFour.trim() || null,
      cutDay: cut,
      paymentDay: pay,
      createdBy: currentUserId ?? cardDraft.ownerMemberId,
      createdAt: new Date().toISOString(),
    };
    const nextCards = [...cards, created];
    setCards(nextCards);
    setCardId(created.id);
    resetCardDraft(true);
    // After the first card, continue straight to the purchase step.
    setStep("purchase");
  };

  const savePurchase = async (event: FormEvent) => {
    event.preventDefault();
    if (purchaseSubmitting || purchaseSubmittingRef.current) return;

    const nextErrors: PurchaseErrors = {};
    const nameMessage = purchaseNameMessage(name);
    if (nameMessage) nextErrors.name = nameMessage;
    const parsedAmount = parseMoney(amount);
    const amountMessage = purchaseAmountMessage(parsedAmount);
    if (amountMessage) nextErrors.amount = amountMessage;
    const dateMessage = purchaseDateMessage(purchasedAt);
    if (dateMessage) nextErrors.date = dateMessage;

    const effectiveCardId = cardId || cards[0]?.id || "";
    if (method === "msi") {
      if (!effectiveCardId) nextErrors.card = "Elige la tarjeta con la que pagaron.";
      const months = Number(msiMonths);
      if (!Number.isInteger(months) || months < 1 || months > 48) {
        nextErrors.months = "Los MSI deben ser entre 1 y 48 meses.";
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
      setPurchaseErrors(nextErrors);
      return;
    }

    purchaseSubmittingRef.current = true;
    setPurchaseSubmitting(true);
    setPurchaseErrors({});

    const result = await createPurchase({
      householdId,
      name,
      emoji,
      store,
      purchasedAt,
      grossAmount: parsedAmount,
      paymentMethod: method,
      msiMonths: method === "msi" ? Number(msiMonths) : null,
      cardId: method === "msi" ? effectiveCardId : null,
      shares,
      bonuses,
      cards,
      activeMemberIds: members.map((member) => member.userId),
    });

    purchaseSubmittingRef.current = false;
    setPurchaseSubmitting(false);

    if (result.ok === false) {
      setPurchaseErrors({ form: result.error.message });
      return;
    }
    setStep("done");
  };

  return (
    <div className="absolute inset-0 z-40" style={{ backgroundColor: P.bgL }}>
      <FlowScreen
        lockViewport
        header={
          <div>
            <BackLink onClick={handleBack} label={step === "welcome" ? "Cerrar" : "Atrás"} />
            <div className="mt-4">
              <OProgress2 step={progressStep} total={4} />
            </div>
          </div>
        }
        footer={
          <ScreenFooter>
            {step === "welcome" ? (
              <Button onClick={() => setStep("card")}>Empezar</Button>
            ) : null}
            {step === "card" ? (
              <div className="space-y-2">
                {cardErrors.form ? <FieldError>{cardErrors.form}</FieldError> : null}
                <Button type="submit" form={`${ids}-card`} loading={cardSubmitting}>
                  Continuar a la compra
                </Button>
              </div>
            ) : null}
            {step === "purchase" ? (
              <div className="space-y-2">
                {purchaseErrors.form ? <FieldError>{purchaseErrors.form}</FieldError> : null}
                <Button type="submit" form={`${ids}-purchase`} loading={purchaseSubmitting}>
                  Guardar primera compra
                </Button>
              </div>
            ) : null}
            {step === "done" ? (
              <Button onClick={onComplete}>Ver mis compras a plazos</Button>
            ) : null}
          </ScreenFooter>
        }
      >
        {step === "welcome" ? (
          <div className="space-y-5">
            <ScreenIntro
              title={
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true">🛋️</span>
                  <span>Compras a plazos</span>
                </span>
              }
              description="Aquí podrás llevar el control de las compras grandes del Nido: MSI, tarjetas, quién aporta y bonificaciones."
            />
            <div className="space-y-3">
              {[
                {
                  title: "Tarjetas del Nido",
                  body: "Registran a nombre de quién está cada tarjeta, el día de corte y cuándo depositar.",
                },
                {
                  title: "Qué se compró",
                  body: "Lavadora, refri, sofá… con precio, fecha, MSI o contado, y el % de cooperación.",
                },
                {
                  title: "Cuotas y bonos",
                  body: "Verás el calendario de pagos y el costo final cuando llegue el cashback o descuento.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[1.5rem] p-4 shadow-sm"
                  style={{ backgroundColor: P.card }}
                >
                  <p className="text-sm font-semibold" style={{ color: P.text }}>
                    {item.title}
                  </p>
                  <Text size="caption" tone="muted" className="mt-1 leading-relaxed">
                    {item.body}
                  </Text>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {step === "card" ? (
          <div className="space-y-4">
            <ScreenIntro
              title="Tu tarjeta"
              description="Así sabremos de quién es y cuándo hay que depositar las MSI. Luego registramos la compra."
            />

            <form
              id={`${ids}-card`}
              className="space-y-4"
              onSubmit={(event) => void saveCard(event)}
            >
              <Field>
                <FieldLabel htmlFor={`${ids}-label`}>Nombre de la tarjeta</FieldLabel>
                <TextInput
                  id={`${ids}-label`}
                  value={cardDraft.label}
                  onChange={(event) =>
                    setCardDraft((draft) => ({ ...draft, label: event.target.value }))
                  }
                  placeholder="BBVA Oro, Santander Free…"
                  invalid={Boolean(cardErrors.label)}
                />
                {cardErrors.label ? <FieldError>{cardErrors.label}</FieldError> : null}
              </Field>

              <div className="space-y-2">
                <FieldLabel>A nombre de quién</FieldLabel>
                {members.map((member) => (
                  <ChoiceCard
                    key={member.userId}
                    title={member.displayName}
                    selected={cardDraft.ownerMemberId === member.userId}
                    onClick={() =>
                      setCardDraft((draft) => ({ ...draft, ownerMemberId: member.userId }))
                    }
                  />
                ))}
                {cardErrors.owner ? <FieldError>{cardErrors.owner}</FieldError> : null}
              </div>

              <Field>
                <FieldLabel htmlFor={`${ids}-bank`}>Banco (opcional)</FieldLabel>
                <TextInput
                  id={`${ids}-bank`}
                  value={cardDraft.bank}
                  onChange={(event) =>
                    setCardDraft((draft) => ({ ...draft, bank: event.target.value }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel htmlFor={`${ids}-four`}>Últimos 4 (opcional)</FieldLabel>
                <TextInput
                  id={`${ids}-four`}
                  value={cardDraft.lastFour}
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(event) =>
                    setCardDraft((draft) => ({
                      ...draft,
                      lastFour: event.target.value.replace(/\D/g, "").slice(0, 4),
                    }))
                  }
                  invalid={Boolean(cardErrors.lastFour)}
                />
                {cardErrors.lastFour ? <FieldError>{cardErrors.lastFour}</FieldError> : null}
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor={`${ids}-cut`}>Día de corte</FieldLabel>
                  <TextInput
                    id={`${ids}-cut`}
                    value={cardDraft.cutDay}
                    inputMode="numeric"
                    onChange={(event) =>
                      setCardDraft((draft) => ({
                        ...draft,
                        cutDay: event.target.value.replace(/\D/g, "").slice(0, 2),
                      }))
                    }
                    invalid={Boolean(cardErrors.cutDay)}
                  />
                  {cardErrors.cutDay ? <FieldError>{cardErrors.cutDay}</FieldError> : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${ids}-pay`}>Día de pago</FieldLabel>
                  <TextInput
                    id={`${ids}-pay`}
                    value={cardDraft.paymentDay}
                    inputMode="numeric"
                    onChange={(event) =>
                      setCardDraft((draft) => ({
                        ...draft,
                        paymentDay: event.target.value.replace(/\D/g, "").slice(0, 2),
                      }))
                    }
                    invalid={Boolean(cardErrors.paymentDay)}
                  />
                  {cardErrors.paymentDay ? <FieldError>{cardErrors.paymentDay}</FieldError> : null}
                </Field>
              </div>
            </form>
          </div>
        ) : null}

        {step === "purchase" ? (
          <div className="space-y-4">
            <ScreenIntro
              title="Primera compra"
              description="Qué compraron, cómo lo pagaron y cómo se reparte entre el Nido."
            />
            <form
              id={`${ids}-purchase`}
              className="space-y-4"
              onSubmit={(event) => void savePurchase(event)}
            >
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
                <FieldLabel htmlFor={`${ids}-name`}>Qué se compró</FieldLabel>
                <TextInput
                  id={`${ids}-name`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Lavadora, refri, sofá…"
                  invalid={Boolean(purchaseErrors.name)}
                />
                {purchaseErrors.name ? <FieldError>{purchaseErrors.name}</FieldError> : null}
              </Field>

              <MoneyField
                id={`${ids}-amount`}
                label="Precio"
                value={amount}
                onChange={setAmount}
                invalid={Boolean(purchaseErrors.amount)}
              />
              {purchaseErrors.amount ? <FieldError>{purchaseErrors.amount}</FieldError> : null}

              <Field>
                <FieldLabel htmlFor={`${ids}-date`}>Fecha de compra</FieldLabel>
                <TextInput
                  id={`${ids}-date`}
                  type="date"
                  value={purchasedAt}
                  onChange={(event) => setPurchasedAt(event.target.value)}
                  invalid={Boolean(purchaseErrors.date)}
                />
                {purchaseErrors.date ? <FieldError>{purchaseErrors.date}</FieldError> : null}
              </Field>

              <Field>
                <FieldLabel htmlFor={`${ids}-store`}>Tienda (opcional)</FieldLabel>
                <TextInput
                  id={`${ids}-store`}
                  value={store}
                  onChange={(event) => setStore(event.target.value)}
                />
              </Field>

              <div className="space-y-2">
                <FieldLabel>Forma de pago</FieldLabel>
                <ChoiceCard
                  title="Meses sin intereses"
                  description="Arma el calendario de cuotas"
                  selected={method === "msi"}
                  onClick={() => setMethod("msi")}
                />
                <ChoiceCard
                  title="De contado"
                  description="Pago único, sin cuotas"
                  selected={method === "cash"}
                  onClick={() => setMethod("cash")}
                />
              </div>

              {method === "msi" ? (
                <>
                  <div className="space-y-2">
                    <FieldLabel>Con qué tarjeta</FieldLabel>
                    {cards.map((card) => (
                      <ChoiceCard
                        key={card.id}
                        title={`${card.label}${card.lastFour ? ` ····${card.lastFour}` : ""}`}
                        description={`A nombre de ${card.ownerName ?? "miembro"}`}
                        selected={(cardId || cards[0]?.id) === card.id}
                        onClick={() => setCardId(card.id)}
                      />
                    ))}
                    {purchaseErrors.card ? <FieldError>{purchaseErrors.card}</FieldError> : null}
                  </div>
                  <Field>
                    <FieldLabel htmlFor={`${ids}-months`}>Meses MSI</FieldLabel>
                    <TextInput
                      id={`${ids}-months`}
                      value={msiMonths}
                      inputMode="numeric"
                      onChange={(event) =>
                        setMsiMonths(event.target.value.replace(/\D/g, "").slice(0, 2))
                      }
                      invalid={Boolean(purchaseErrors.months)}
                    />
                    {purchaseErrors.months ? (
                      <FieldError>{purchaseErrors.months}</FieldError>
                    ) : null}
                  </Field>
                  {preview && preview.length > 0 ? (
                    <div className="rounded-2xl p-4" style={{ backgroundColor: P.sub }}>
                      <Text size="caption" tone="muted">
                        {preview.length === 1
                          ? `Un solo pago el ${preview[0].dueDate} · $${preview[0].amount.toFixed(2)}`
                          : `Primera cuota ${preview[0].dueDate} · ${preview.length} pagos de aprox. $${preview[0].amount.toFixed(2)}`}
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
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            setShares((current) =>
                              current.map((row) =>
                                row.memberId === share.memberId
                                  ? {
                                      ...row,
                                      percent: Number.isFinite(value) ? value : 0,
                                    }
                                  : row,
                              ),
                            );
                          }}
                          aria-label={`Porcentaje de ${member?.displayName ?? "miembro"}`}
                        />
                      </div>
                      <Text size="caption" tone="muted">
                        %
                      </Text>
                    </div>
                  );
                })}
                {purchaseErrors.shares ? <FieldError>{purchaseErrors.shares}</FieldError> : null}
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
                  {purchaseErrors.bonus ? <FieldError>{purchaseErrors.bonus}</FieldError> : null}
                </div>
              ) : null}
            </form>
          </div>
        ) : null}

        {step === "done" ? (
          <div className="space-y-4">
            <ScreenIntro
              emoji="✨"
              title="Listo"
              description="Ya tienen su primera compra a plazos. Desde aquí pueden seguir agregando tarjetas, ver cuotas del mes y marcar bonificaciones cuando lleguen."
            />
            <div className="rounded-[1.5rem] p-4 shadow-sm" style={{ backgroundColor: P.card }}>
              <Text size="caption" tone="muted">
                Tip: en la pestaña Cuotas verán qué hay que depositar según el día de pago de cada
                tarjeta.
              </Text>
            </div>
          </div>
        ) : null}
      </FlowScreen>
    </div>
  );
}
