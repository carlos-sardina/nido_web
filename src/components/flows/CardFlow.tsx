"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/nido/Button";
import { ChoiceCard } from "@/components/nido/ChoiceCard";
import { Field, FieldError, FieldLabel, TextInput } from "@/components/nido/Field";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
import { createPaymentCard } from "@/lib/nido/compras-actions";
import {
  cardDayMessage,
  cardLabelMessage,
  lastFourMessage,
} from "@/lib/nido/financial";
import type { HouseholdMemberView } from "@/lib/nido/types";

type FieldErrors = {
  label?: string;
  owner?: string;
  cutDay?: string;
  paymentDay?: string;
  lastFour?: string;
  form?: string;
};

export function CardFlow({
  householdId,
  members,
  currentUserId,
  onClose,
  onDone,
}: {
  householdId: string;
  members: HouseholdMemberView[];
  currentUserId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const ids = useId();
  const submittingRef = useRef(false);
  const [label, setLabel] = useState("");
  const [bank, setBank] = useState("");
  const [lastFour, setLastFour] = useState("");
  const [ownerMemberId, setOwnerMemberId] = useState(currentUserId ?? members[0]?.userId ?? "");
  const [cutDay, setCutDay] = useState("15");
  const [paymentDay, setPaymentDay] = useState("28");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || submittingRef.current) return;

    const nextErrors: FieldErrors = {};
    const labelMessage = cardLabelMessage(label);
    if (labelMessage) nextErrors.label = labelMessage;
    if (!ownerMemberId) nextErrors.owner = "Elige a nombre de quién está la tarjeta.";
    const cut = Number(cutDay);
    const pay = Number(paymentDay);
    const cutMessage = cardDayMessage(Number.isFinite(cut) ? cut : null, "El día de corte");
    if (cutMessage) nextErrors.cutDay = cutMessage;
    const payMessage = cardDayMessage(Number.isFinite(pay) ? pay : null, "El día de pago");
    if (payMessage) nextErrors.paymentDay = payMessage;
    const fourMessage = lastFourMessage(lastFour);
    if (fourMessage) nextErrors.lastFour = fourMessage;

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});

    const result = await createPaymentCard({
      householdId,
      ownerMemberId,
      label,
      bank,
      lastFour,
      cutDay: cut,
      paymentDay: pay,
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
              Guardar tarjeta
            </Button>
          </ScreenFooter>
        }
      >
        <ScreenIntro
          title="Agregar tarjeta"
          description="Sirve para saber a nombre de quién está y cuándo depositar las MSI."
        />
        <form id={`${ids}-form`} className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <Field>
            <FieldLabel htmlFor={`${ids}-label`}>Nombre</FieldLabel>
            <TextInput
              id={`${ids}-label`}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="BBVA Oro, Santander Free…"
              invalid={Boolean(errors.label)}
            />
            {errors.label ? <FieldError>{errors.label}</FieldError> : null}
          </Field>

          <div className="space-y-2">
            <FieldLabel>A nombre de</FieldLabel>
            {members.map((member) => (
              <ChoiceCard
                key={member.userId}
                title={member.displayName}
                selected={ownerMemberId === member.userId}
                onClick={() => setOwnerMemberId(member.userId)}
              />
            ))}
            {errors.owner ? <FieldError>{errors.owner}</FieldError> : null}
          </div>

          <Field>
            <FieldLabel htmlFor={`${ids}-bank`}>Banco (opcional)</FieldLabel>
            <TextInput id={`${ids}-bank`} value={bank} onChange={(event) => setBank(event.target.value)} />
          </Field>

          <Field>
            <FieldLabel htmlFor={`${ids}-four`}>Últimos 4 (opcional)</FieldLabel>
            <TextInput
              id={`${ids}-four`}
              value={lastFour}
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => setLastFour(event.target.value.replace(/\D/g, "").slice(0, 4))}
              invalid={Boolean(errors.lastFour)}
            />
            {errors.lastFour ? <FieldError>{errors.lastFour}</FieldError> : null}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor={`${ids}-cut`}>Día de corte</FieldLabel>
              <TextInput
                id={`${ids}-cut`}
                value={cutDay}
                inputMode="numeric"
                onChange={(event) => setCutDay(event.target.value.replace(/\D/g, "").slice(0, 2))}
                invalid={Boolean(errors.cutDay)}
              />
              {errors.cutDay ? <FieldError>{errors.cutDay}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${ids}-pay`}>Día de pago</FieldLabel>
              <TextInput
                id={`${ids}-pay`}
                value={paymentDay}
                inputMode="numeric"
                onChange={(event) => setPaymentDay(event.target.value.replace(/\D/g, "").slice(0, 2))}
                invalid={Boolean(errors.paymentDay)}
              />
              {errors.paymentDay ? <FieldError>{errors.paymentDay}</FieldError> : null}
            </Field>
          </div>
        </form>
      </FlowScreen>
    </div>
  );
}
