import { moneyOrZero, parseMoney } from "../financial/money.ts";
import type {
  PaymentCardRow,
  PurchaseAuditAction,
  PurchaseAuditEntity,
  PurchaseAuditEvent,
  PurchaseBonusRow,
  PurchaseBonusType,
  PurchaseInstallmentRow,
  PurchasePaymentKind,
  PurchasePaymentMethod,
  PurchasePaymentRow,
  PurchaseRow,
  PurchaseShareRow,
} from "../financial/compras.ts";
import { resolvePurchaseEmoji } from "../financial/compras.ts";
import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "../errors";
import { nidoClient, requireUser, type NidoClient } from "../session";

export type ComprasSnapshot = {
  cards: PaymentCardRow[];
  purchases: PurchaseRow[];
};

type ProfileEmbed = { id: string; display_name: string | null } | null;

type CardQueryRow = {
  id: string;
  household_id: string;
  owner_member_id: string;
  label: string;
  bank: string | null;
  last_four: string | null;
  cut_day: number;
  payment_day: number;
  created_by: string;
  created_at: string;
  owner: ProfileEmbed;
};

type ShareQueryRow = {
  id: string;
  purchase_id: string;
  member_id: string;
  percent: number | string;
  member: ProfileEmbed;
};

type InstallmentQueryRow = {
  id: string;
  purchase_id: string;
  installment_number: number;
  due_date: string;
  amount: number | string;
  paid_at: string | null;
};

type BonusQueryRow = {
  id: string;
  purchase_id: string;
  bonus_type: PurchaseBonusType;
  label: string;
  amount: number | string;
  expected_at: string;
  received_at: string | null;
  notes: string | null;
  created_by: string;
  deleted_at?: string | null;
};

type PaymentQueryRow = {
  id: string;
  purchase_id: string;
  member_id: string;
  amount: number | string;
  paid_at: string;
  kind: PurchasePaymentKind;
  notes: string | null;
  created_by: string;
  deleted_at?: string | null;
  member: ProfileEmbed;
  purchase_payment_installments?: { installment_id: string }[] | null;
};

type PurchaseQueryRow = {
  id: string;
  household_id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  store: string | null;
  purchased_at: string;
  gross_amount: number | string;
  payment_method: PurchasePaymentMethod;
  msi_months: number | null;
  card_id: string | null;
  created_by: string;
  created_at: string;
  card: {
    id: string;
    label: string;
    owner: ProfileEmbed;
  } | null;
  purchase_shares: ShareQueryRow[];
  purchase_installments: InstallmentQueryRow[];
  purchase_bonuses: BonusQueryRow[];
  purchase_payments: PaymentQueryRow[];
};

function mapCard(row: CardQueryRow): PaymentCardRow {
  return {
    id: row.id,
    householdId: row.household_id,
    ownerMemberId: row.owner_member_id,
    ownerName: row.owner?.display_name ?? null,
    label: row.label,
    bank: row.bank,
    lastFour: row.last_four,
    cutDay: Number(row.cut_day),
    paymentDay: Number(row.payment_day),
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapShare(row: ShareQueryRow): PurchaseShareRow {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    memberId: row.member_id,
    memberName: row.member?.display_name ?? null,
    percent: moneyOrZero(row.percent),
  };
}

function mapInstallment(row: InstallmentQueryRow): PurchaseInstallmentRow {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    installmentNumber: Number(row.installment_number),
    dueDate: row.due_date,
    amount: moneyOrZero(row.amount),
    paidAt: row.paid_at,
  };
}

function mapBonus(row: BonusQueryRow): PurchaseBonusRow {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    bonusType: row.bonus_type,
    label: row.label,
    amount: moneyOrZero(row.amount),
    expectedAt: row.expected_at,
    receivedAt: row.received_at,
    notes: row.notes,
    createdBy: row.created_by,
  };
}

function mapPayment(row: PaymentQueryRow): PurchasePaymentRow {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    memberId: row.member_id,
    memberName: row.member?.display_name ?? null,
    amount: moneyOrZero(row.amount),
    paidAt: row.paid_at,
    kind: row.kind,
    notes: row.notes,
    createdBy: row.created_by,
    installmentIds: (row.purchase_payment_installments ?? []).map((link) => link.installment_id),
  };
}

function mapPurchase(row: PurchaseQueryRow): PurchaseRow {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    emoji: resolvePurchaseEmoji(row.emoji),
    description: row.description,
    store: row.store,
    purchasedAt: row.purchased_at,
    grossAmount: moneyOrZero(row.gross_amount),
    paymentMethod: row.payment_method,
    msiMonths: row.msi_months == null ? null : Number(row.msi_months),
    cardId: row.card_id,
    cardLabel: row.card?.label ?? null,
    cardOwnerName: row.card?.owner?.display_name ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    shares: (row.purchase_shares ?? []).map(mapShare),
    installments: (row.purchase_installments ?? [])
      .map(mapInstallment)
      .sort((a, b) => a.installmentNumber - b.installmentNumber),
    bonuses: (row.purchase_bonuses ?? []).map(mapBonus),
    payments: (row.purchase_payments ?? [])
      .map(mapPayment)
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt) || b.id.localeCompare(a.id)),
  };
}

const CARD_SELECT =
  "id, household_id, owner_member_id, label, bank, last_four, cut_day, payment_day, created_by, created_at, owner:profiles!payment_cards_owner_member_id_fkey(id, display_name)";

const PURCHASE_SELECT =
  "id, household_id, name, emoji, description, store, purchased_at, gross_amount, payment_method, msi_months, card_id, created_by, created_at, card:payment_cards!purchases_card_id_fkey(id, label, owner:profiles!payment_cards_owner_member_id_fkey(id, display_name)), purchase_shares(id, purchase_id, member_id, percent, member:profiles!purchase_shares_member_id_fkey(id, display_name)), purchase_installments(id, purchase_id, installment_number, due_date, amount, paid_at), purchase_bonuses(id, purchase_id, bonus_type, label, amount, expected_at, received_at, notes, created_by, deleted_at), purchase_payments(id, purchase_id, member_id, amount, paid_at, kind, notes, created_by, deleted_at, member:profiles!purchase_payments_member_id_fkey(id, display_name), purchase_payment_installments(installment_id))";

export async function fetchComprasSnapshot(
  householdId: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<ComprasSnapshot>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  const client = auth.data.supabase;

  const [cardsResult, purchasesResult] = await Promise.all([
    client
      .from("payment_cards")
      .select(CARD_SELECT)
      .eq("household_id", householdId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    client
      .from("purchases")
      .select(PURCHASE_SELECT)
      .eq("household_id", householdId)
      .is("deleted_at", null)
      .order("purchased_at", { ascending: false }),
  ]);

  if (cardsResult.error) return nidoFail(nidoErrorFromUnknown(cardsResult.error).code);
  if (purchasesResult.error) return nidoFail(nidoErrorFromUnknown(purchasesResult.error).code);

  const purchases = ((purchasesResult.data ?? []) as unknown as PurchaseQueryRow[]).map((row) => {
    return mapPurchase({
      ...row,
      purchase_bonuses: (row.purchase_bonuses ?? []).filter((bonus) => !bonus.deleted_at),
      purchase_payments: (row.purchase_payments ?? []).filter((payment) => !payment.deleted_at),
    });
  });

  return nidoOk({
    cards: ((cardsResult.data ?? []) as unknown as CardQueryRow[]).map(mapCard),
    purchases,
  });
}

export function parseOptionalMoney(raw: string): number | null {
  return parseMoney(raw.trim().replace(",", "."));
}

type AuditQueryRow = {
  id: string;
  household_id: string;
  purchase_id: string | null;
  actor_id: string;
  action: PurchaseAuditAction;
  entity_type: PurchaseAuditEntity;
  entity_id: string;
  label: string;
  amount: number | string | null;
  icon: string | null;
  detail: string | null;
  meta: Record<string, unknown> | null;
  occurred_at: string;
  actor: ProfileEmbed;
};

const AUDIT_SELECT =
  "id, household_id, purchase_id, actor_id, action, entity_type, entity_id, label, amount, icon, detail, meta, occurred_at, actor:profiles!purchase_audit_events_actor_id_fkey(id, display_name)";

function mapAuditEvent(row: AuditQueryRow): PurchaseAuditEvent {
  return {
    id: row.id,
    householdId: row.household_id,
    purchaseId: row.purchase_id,
    actorId: row.actor_id,
    actorName: row.actor?.display_name ?? null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    label: row.label,
    amount: row.amount == null ? null : moneyOrZero(row.amount),
    icon: row.icon,
    detail: row.detail,
    meta: row.meta ?? {},
    occurredAt: row.occurred_at,
  };
}

export async function fetchPurchaseAuditEvents(
  opts: {
    householdId: string;
    purchaseId?: string | null;
    /** Page size (default 20). Fetches one extra row to detect hasMore. */
    limit?: number;
    offset?: number;
  },
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ events: PurchaseAuditEvent[]; hasMore: boolean }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  const limit = Math.max(1, opts.limit ?? 20);
  const offset = Math.max(0, opts.offset ?? 0);
  let query = auth.data.supabase
    .from("purchase_audit_events")
    .select(AUDIT_SELECT)
    .eq("household_id", opts.householdId)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  if (opts.purchaseId) {
    query = query.eq("purchase_id", opts.purchaseId);
  }

  const result = await query;
  if (result.error) return nidoFail(nidoErrorFromUnknown(result.error).code);

  const rows = (result.data ?? []) as unknown as AuditQueryRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return nidoOk({
    events: page.map(mapAuditEvent),
    hasMore,
  });
}
