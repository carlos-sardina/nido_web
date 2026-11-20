"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, CreditCard, History, Plus } from "lucide-react";
import { CardsManageScreen } from "@/components/compras/CardsManageScreen";
import { ComprasActionSheet } from "@/components/compras/ComprasActionSheet";
import { ComprasSetupFlow } from "@/components/compras/ComprasSetupFlow";
import { PurchaseAuditScreen } from "@/components/compras/PurchaseAuditScreen";
import { MonthDueWidget, SpendWidget } from "@/components/compras/PaymentCardVisual";
import { Button } from "@/components/nido/Button";
import { EmptyState } from "@/components/nido/EmptyState";
import { PullToRefresh } from "@/components/nido/PullToRefresh";
import { BackLink } from "@/components/nido/Screen";
import { Heading, Text } from "@/components/nido/Typography";
import type { NidoResult } from "@/lib/nido/errors";
import {
  formatExactMoney,
  formatRelativeActivityDate,
  getCurrentMonthRange,
  isDateInRange,
  netPurchaseCost,
  nextPendingDuesMonth,
  paymentMethodLabel,
  pendingInstallmentsDueInRange,
  remainingMonthsCaption,
  resolvePurchaseEmoji,
  sharesCaption,
  shiftMonth,
  sumMoney,
  type PaymentCardRow,
  type PurchaseRow,
} from "@/lib/nido/financial";
import type { ComprasQuery } from "@/lib/nido/use-compras";
import type { HouseholdMemberView } from "@/lib/nido/types";
import { P } from "@/lib/palette";

type View = "home" | "cuotas";

const PREVIEW_LIMIT = 2;
const MOVIMIENTOS_BG = "linear-gradient(135deg, #255D4D 0%, #2F7D66 100%)";

function dueSeries(purchases: PurchaseRow[], current = getCurrentMonthRange()) {
  const values: number[] = [];
  for (let offset = -5; offset <= 0; offset += 1) {
    const range = shiftMonth(current, offset);
    const due = pendingInstallmentsDueInRange(purchases, range.start, range.end);
    values.push(sumMoney(due.map((row) => row.installment.amount)));
  }
  return values;
}

function netPurchaseSeries(purchases: PurchaseRow[], current = getCurrentMonthRange()) {
  const values: number[] = [];
  for (let offset = -5; offset <= 0; offset += 1) {
    const range = shiftMonth(current, offset);
    values.push(
      sumMoney(
        purchases
          .filter((purchase) => isDateInRange(purchase.purchasedAt, range))
          .map((purchase) => netPurchaseCost(purchase.grossAmount, purchase.bonuses)),
      ),
    );
  }
  return values;
}

export function ComprasScreen({
  compras,
  members,
  householdId,
  currentUserId,
  onClose,
  onOpenPurchase,
  onCreatePurchase,
  onCreatePayment,
  onCreateCard,
  onDeleteCard,
}: {
  compras: ComprasQuery;
  members: HouseholdMemberView[];
  householdId: string;
  currentUserId: string | null;
  onClose: () => void;
  onOpenPurchase: (purchase: PurchaseRow) => void;
  onCreatePurchase: () => void;
  onCreatePayment: () => void;
  onCreateCard: () => void;
  onDeleteCard: (
    card: PaymentCardRow,
  ) => Promise<NidoResult<{ id: string }>> | NidoResult<{ id: string }> | void;
}) {
  const [view, setView] = useState<View>("home");
  const [showCards, setShowCards] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [month, setMonth] = useState(() => getCurrentMonthRange());
  const [forceSetup, setForceSetup] = useState(false);
  const monthInitialized = useRef(false);
  const { isLoading, refreshing, error, cards, purchases, refresh } = compras;
  const needsSetup =
    !isLoading && !error && cards.length === 0 && purchases.length === 0;

  const currentMonth = useMemo(() => getCurrentMonthRange(), []);
  const dueCurrentMonth = useMemo(
    () => pendingInstallmentsDueInRange(purchases, currentMonth.start, currentMonth.end),
    [purchases, currentMonth],
  );
  const dueCurrentTotal = sumMoney(dueCurrentMonth.map((row) => row.installment.amount));

  // Open on the nearest month that actually has cuotas when this month is empty.
  useEffect(() => {
    if (monthInitialized.current || isLoading || purchases.length === 0) return;
    monthInitialized.current = true;
    const next = nextPendingDuesMonth(purchases, currentMonth);
    if (!next.isCurrent && next.amount > 0) {
      setMonth(next.range);
    }
  }, [isLoading, purchases, currentMonth]);
  const sparkValues = useMemo(() => dueSeries(purchases, currentMonth), [purchases, currentMonth]);
  const netSparkValues = useMemo(
    () => netPurchaseSeries(purchases, currentMonth),
    [purchases, currentMonth],
  );

  const totals = useMemo(() => {
    const gross = sumMoney(purchases.map((row) => row.grossAmount));
    const net = sumMoney(purchases.map((row) => netPurchaseCost(row.grossAmount, row.bonuses)));
    return { gross, net };
  }, [purchases]);

  const dueThisMonth = useMemo(
    () => pendingInstallmentsDueInRange(purchases, month.start, month.end),
    [purchases, month],
  );
  const dueTotal = sumMoney(dueThisMonth.map((row) => row.installment.amount));
  const previewPurchases = purchases.slice(0, PREVIEW_LIMIT);

  if (needsSetup || forceSetup) {
    return (
      <ComprasSetupFlow
        householdId={householdId}
        members={members}
        currentUserId={currentUserId}
        onClose={() => {
          setForceSetup(false);
          onClose();
        }}
        onComplete={() => {
          setForceSetup(false);
          void refresh();
        }}
      />
    );
  }

  if (showCards) {
    return (
      <CardsManageScreen
        cards={cards}
        members={members}
        onClose={() => setShowCards(false)}
        onCreateCard={onCreateCard}
        onDeleteCard={onDeleteCard}
      />
    );
  }

  if (showAudit) {
    return (
      <PurchaseAuditScreen
        householdId={householdId}
        refreshKey={
          purchases.length * 1000 +
          purchases.reduce((sum, row) => sum + row.payments.length, 0) * 10 +
          cards.length +
          (refreshing ? 1 : 0)
        }
        onClose={() => setShowAudit(false)}
        onSelectPurchase={(purchaseId) => {
          const purchase = purchases.find((row) => row.id === purchaseId);
          if (purchase) {
            setShowAudit(false);
            onOpenPurchase(purchase);
          }
        }}
      />
    );
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col" style={{ backgroundColor: P.bgL }}>
      <PullToRefresh
        onRefresh={refresh}
        refreshing={refreshing}
        className="h-full min-h-0 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden"
      >
        <div className="px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-28">
          <div className="flex items-start justify-between gap-3">
            <BackLink
              onClick={() => {
                if (view === "cuotas") setView("home");
                else onClose();
              }}
              label={view === "cuotas" ? "Atrás" : "Cerrar"}
            />
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                aria-label="Historial del módulo"
                onClick={() => setShowAudit(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full shadow-sm transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ backgroundColor: P.card }}
              >
                <History size={18} style={{ color: P.text }} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Gestionar tarjetas"
                onClick={() => setShowCards(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full shadow-sm transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ backgroundColor: P.card }}
              >
                <CreditCard size={18} style={{ color: P.text }} aria-hidden="true" />
              </button>
            </div>
          </div>

          <Heading as="h2" size="h2" className="mt-3">
            {view === "cuotas" ? "Cuotas por depositar" : "Compras a plazos"}
          </Heading>
          <Text size="caption" tone="muted" className="mt-1">
            {view === "cuotas"
              ? "Según el día de pago de cada tarjeta"
              : "MSI, cooperación y bonificaciones del Nido"}
          </Text>

          {view === "home" ? (
            <>
              {isLoading && purchases.length === 0 ? (
                <div className="pt-6 space-y-3" aria-busy="true">
                  <div className="h-28 rounded-[1.5rem] animate-pulse" style={{ backgroundColor: P.sub }} />
                </div>
              ) : error && purchases.length === 0 ? (
                <div className="pt-6">
                  <Text size="body-sm" tone="danger" className="mb-4">
                    {error.message}
                  </Text>
                  <Button onClick={() => void refresh()}>Reintentar</Button>
                </div>
              ) : (
                <>
                  <div
                    className="relative mt-5 overflow-hidden rounded-[1.5rem] p-4 shadow-sm"
                    style={{ background: MOVIMIENTOS_BG }}
                  >
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full"
                      style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -bottom-12 right-8 h-24 w-24 rounded-full"
                      style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                    />
                    <div className="relative">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h3
                          className="text-[10px] font-semibold uppercase tracking-widest"
                          style={{ color: "rgba(255,255,255,0.55)" }}
                        >
                          Movimientos
                        </h3>
                      </div>

                      {purchases.length === 0 ? (
                        <EmptyState
                          plain
                          title="Sin compras a plazos todavía"
                          description="Registra muebles, lavadora, refri y más. Pueden ser de contado o MSI."
                          actionLabel="Registrar compra a plazos"
                          onAction={cards.length === 0 ? () => setForceSetup(true) : onCreatePurchase}
                        />
                      ) : (
                        <div className="space-y-1">
                          {previewPurchases.map((purchase) => {
                            const net = netPurchaseCost(purchase.grossAmount, purchase.bonuses);
                            const remaining = remainingMonthsCaption(purchase);
                            return (
                              <button
                                key={purchase.id}
                                type="button"
                                onClick={() => onOpenPurchase(purchase)}
                                className="w-full rounded-2xl px-1 py-3 text-left transition-all active:scale-[0.99]"
                              >
                                <div className="flex items-start gap-3">
                                  <div
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
                                    style={{ backgroundColor: "rgba(255,252,250,0.92)" }}
                                    aria-hidden="true"
                                  >
                                    {resolvePurchaseEmoji(purchase.emoji)}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-white">
                                      {purchase.name}
                                    </p>
                                    <p
                                      className="mt-1 text-caption"
                                      style={{ color: "rgba(255,255,255,0.55)" }}
                                    >
                                      {[
                                        paymentMethodLabel(purchase.paymentMethod),
                                        purchase.msiMonths ? `${purchase.msiMonths} meses` : null,
                                        remaining,
                                        formatRelativeActivityDate(
                                          purchase.purchasedAt,
                                          purchase.createdAt,
                                        ),
                                      ]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </p>
                                    <p
                                      className="mt-1 text-caption"
                                      style={{ color: "rgba(255,255,255,0.45)" }}
                                    >
                                      {sharesCaption(purchase.shares)}
                                    </p>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="text-sm font-bold font-sans text-white">
                                      {formatExactMoney(net)}
                                    </p>
                                  </div>
                                  <ChevronRight
                                    size={14}
                                    className="mt-1 flex-shrink-0"
                                    style={{ color: "rgba(255,255,255,0.55)" }}
                                    aria-hidden="true"
                                  />
                                </div>
                              </button>
                            );
                          })}
                          <div className="pt-2 flex justify-center">
                            <button
                              type="button"
                              onClick={() => setView("cuotas")}
                              className="inline-flex items-center gap-0.5 min-h-9 -my-2 rounded text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              style={{ color: "rgba(255,255,255,0.9)" }}
                            >
                              Ver todo
                              <ChevronRight size={12} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <MonthDueWidget
                      amountLabel={formatExactMoney(dueCurrentTotal)}
                      values={sparkValues}
                      onClick={() => setView("cuotas")}
                    />
                    <SpendWidget
                      caption="Neto c/ bono"
                      amountLabel={formatExactMoney(totals.net)}
                      values={netSparkValues}
                      tone="sage"
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="mt-4 space-y-3">
              <div
                className="flex items-center justify-between rounded-[1.5rem] p-4"
                style={{ backgroundColor: P.card }}
              >
                <button
                  type="button"
                  onClick={() => setMonth((value) => shiftMonth(value, -1))}
                  className="text-sm font-semibold"
                  style={{ color: P.brnDk }}
                >
                  Anterior
                </button>
                <div className="text-center">
                  <p className="text-sm font-semibold" style={{ color: P.text }}>
                    {month.label}
                  </p>
                  <Text size="caption" tone="muted">
                    Cuotas por depositar {formatExactMoney(dueTotal)}
                  </Text>
                </div>
                <button
                  type="button"
                  onClick={() => setMonth((value) => shiftMonth(value, 1))}
                  className="text-sm font-semibold"
                  style={{ color: P.brnDk }}
                >
                  Siguiente
                </button>
              </div>

              {purchases.length > 0 ? (
                <div className="space-y-2">
                  <Text size="caption" tone="muted">
                    Todas las compras
                  </Text>
                  {purchases.map((purchase) => {
                    const net = netPurchaseCost(purchase.grossAmount, purchase.bonuses);
                    return (
                      <button
                        key={purchase.id}
                        type="button"
                        onClick={() => onOpenPurchase(purchase)}
                        className="w-full rounded-[1.25rem] p-3.5 text-left shadow-sm"
                        style={{ backgroundColor: P.card }}
                      >
                        <div className="flex items-center justify-between gap-3">
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
                              {paymentMethodLabel(purchase.paymentMethod)}
                              {purchase.msiMonths ? ` · ${purchase.msiMonths} MSI` : ""}
                            </Text>
                          </div>
                          <p className="text-sm font-bold font-sans shrink-0" style={{ color: P.text }}>
                            {formatExactMoney(net)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <Text size="caption" tone="muted" className="pt-2">
                Cuotas del mes
              </Text>
              {dueThisMonth.length === 0 ? (
                <EmptyState
                  plain
                  title="Sin cuotas este mes"
                  description="Cuando registres compras a MSI, aquí verás qué hay que depositar."
                />
              ) : (
                dueThisMonth.map(({ purchase, installment }) => (
                  <button
                    key={installment.id}
                    type="button"
                    onClick={() => onOpenPurchase(purchase)}
                    className="w-full rounded-[1.5rem] p-4 text-left shadow-sm"
                    style={{ backgroundColor: P.card }}
                  >
                    <div className="flex items-center justify-between gap-3">
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
                        <Text size="caption" tone="muted" className="mt-1">
                          Cuota {installment.installmentNumber}
                          {purchase.msiMonths ? ` de ${purchase.msiMonths}` : ""}
                          {purchase.cardLabel ? ` · ${purchase.cardLabel}` : ""}
                          {` · vence ${installment.dueDate}`}
                        </Text>
                      </div>
                      <p className="text-sm font-bold font-sans shrink-0" style={{ color: P.text }}>
                        {formatExactMoney(installment.amount)}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </PullToRefresh>

      {!isLoading && !error ? (
        <button
          type="button"
          aria-label="Agregar"
          onClick={() => setShowSheet(true)}
          className="absolute flex items-center justify-center transition-all active:scale-95 z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            bottom: "max(1.5rem, env(safe-area-inset-bottom))",
            right: "1.25rem",
            width: "3.25rem",
            height: "3.25rem",
            backgroundColor: P.brnDk,
            borderRadius: "1rem",
            boxShadow: "0 8px 24px rgba(102,90,72,0.45)",
          }}
        >
          <Plus size={22} color="white" />
        </button>
      ) : null}

      {showSheet ? (
        <ComprasActionSheet
          onClose={() => setShowSheet(false)}
          onSelect={(action) => {
            setShowSheet(false);
            if (action === "purchase") onCreatePurchase();
            else onCreatePayment();
          }}
        />
      ) : null}
    </div>
  );
}
