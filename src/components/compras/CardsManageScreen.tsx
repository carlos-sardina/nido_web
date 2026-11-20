"use client";

import { useState } from "react";
import {
  cardToneForId,
  PaymentCardVisual,
} from "@/components/compras/PaymentCardVisual";
import { SwipeToDelete } from "@/components/compras/SwipeToDelete";
import { Button } from "@/components/nido/Button";
import { EmptyState } from "@/components/nido/EmptyState";
import { BackLink } from "@/components/nido/Screen";
import { Heading, Text } from "@/components/nido/Typography";
import type { NidoResult } from "@/lib/nido/errors";
import type { PaymentCardRow } from "@/lib/nido/financial";
import type { HouseholdMemberView } from "@/lib/nido/types";
import { P } from "@/lib/palette";

export function CardsManageScreen({
  cards,
  members,
  onClose,
  onCreateCard,
  onDeleteCard,
}: {
  cards: PaymentCardRow[];
  members: HouseholdMemberView[];
  onClose: () => void;
  onCreateCard: () => void;
  onDeleteCard: (card: PaymentCardRow) => Promise<NidoResult<{ id: string }>> | NidoResult<{ id: string }> | void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (card: PaymentCardRow) => {
    if (deletingId) return;
    setError(null);
    setDeletingId(card.id);
    try {
      const result = await onDeleteCard(card);
      if (result && result.ok === false) {
        setError(result.error.message);
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col" style={{ backgroundColor: P.bgL }}>
      <div className="px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-28 overflow-y-auto">
        <BackLink onClick={onClose} label="Cerrar" />
        <Heading as="h2" size="h2" className="mt-3">
          Tarjetas
        </Heading>
        <Text size="caption" tone="muted" className="mt-1">
          Desliza a la derecha para eliminar
        </Text>

        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-2xl px-4 py-3 text-sm"
            style={{ backgroundColor: "rgba(180, 60, 60, 0.1)", color: P.danger }}
          >
            {error}
          </p>
        ) : null}

        <div className="mt-5 space-y-3">
          {cards.length === 0 ? (
            <EmptyState
              title="Sin tarjetas"
              description="Agrega las tarjetas del Nido con día de corte y día de pago."
              actionLabel="Agregar tarjeta"
              onAction={onCreateCard}
            />
          ) : (
            <>
              {cards.map((card) => {
                const owner = members.find((member) => member.userId === card.ownerMemberId);
                return (
                  <SwipeToDelete
                    key={card.id}
                    label="Eliminar"
                    disabled={deletingId === card.id}
                    onDelete={() => {
                      void handleDelete(card);
                    }}
                  >
                    <PaymentCardVisual
                      label={card.label}
                      ownerName={owner?.displayName ?? card.ownerName}
                      lastFour={card.lastFour}
                      bank={card.bank}
                      cutDay={card.cutDay}
                      paymentDay={card.paymentDay}
                      tone={cardToneForId(card.id)}
                    />
                  </SwipeToDelete>
                );
              })}
              <Button onClick={onCreateCard}>Agregar tarjeta</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
