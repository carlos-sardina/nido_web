import type { HouseholdMemberView } from "../types.ts";
import { monthRangeFromIsoDate, shiftMonth, type MonthRange } from "./dates.ts";
import { visiblePeriodExpenses, isSharedExpense, memberPaid } from "./expenses.ts";
import { memberPeriodIncomeTotal, visiblePeriodIncomes } from "./incomes.ts";
import { MONEY_CENTS, roundMoney, sumMoney } from "./money.ts";
import { netExpense } from "./refunds.ts";
import type {
  DerivedSettlement,
  ExpenseRow,
  IncomeRow,
  MemberBalanceView,
  MemberIncomeView,
  MonthlyBalance,
  MonthlyBalanceConfirmation,
} from "./types.ts";

export function shortMemberName(displayName: string | null | undefined): string {
  const first = displayName?.trim().split(/\s+/).filter(Boolean)[0];
  return first || "Un miembro";
}

function memberDisplayName(
  memberId: string,
  members: ReadonlyArray<Pick<HouseholdMemberView, "userId" | "displayName">>,
  fallbacks: ReadonlyMap<string, string>,
): string {
  const listed = members.find((member) => member.userId === memberId)?.displayName;
  return shortMemberName(listed ?? fallbacks.get(memberId) ?? null);
}

function refundShareForMember(expense: ExpenseRow, memberId: string): number {
  return sumMoney(
    (expense.refunds ?? [])
      .flatMap((refund) => refund.splits)
      .filter((split) => split.memberId === memberId)
      .map((split) => split.amount),
  );
}

function memberOwedOnExpense(expense: ExpenseRow, memberId: string): number {
  const splitTotal = sumMoney(
    expense.splits.filter((split) => split.memberId === memberId).map((split) => split.amount),
  );
  return roundMoney(splitTotal - refundShareForMember(expense, memberId));
}

/**
 * Shared-only paid / owed / balance for one member.
 * Personal expenses do not participate.
 */
export function calculateMemberBalances(input: {
  expenses: readonly ExpenseRow[];
  members: ReadonlyArray<Pick<HouseholdMemberView, "userId" | "displayName">>;
  nameFallbacks?: ReadonlyMap<string, string>;
}): MemberBalanceView[] {
  const shared = input.expenses.filter(isSharedExpense);
  const fallbacks = input.nameFallbacks ?? new Map<string, string>();
  const ids = new Set<string>();
  for (const member of input.members) {
    if (member.userId) ids.add(member.userId);
  }
  for (const expense of shared) {
    if (expense.payerId) ids.add(expense.payerId);
    for (const split of expense.splits) {
      if (split.memberId) ids.add(split.memberId);
    }
    for (const refund of expense.refunds ?? []) {
      for (const split of refund.splits) {
        if (split.memberId) ids.add(split.memberId);
      }
    }
  }

  const listedIds = input.members.map((member) => member.userId).filter(Boolean);
  const extras = [...ids].filter((id) => !listedIds.includes(id)).sort((a, b) => a.localeCompare(b));
  const ordered = [...listedIds, ...extras];

  return ordered.map((memberId) => {
    const paid = memberPaid(shared, memberId);
    const owed = roundMoney(
      sumMoney(shared.map((expense) => memberOwedOnExpense(expense, memberId))),
    );
    return {
      memberId,
      displayName: memberDisplayName(memberId, input.members, fallbacks),
      paid,
      owed,
      balance: roundMoney(paid - owed),
    };
  });
}

/**
 * Deterministic liquidation from net balances.
 * Largest remaining debtor pays largest remaining creditor; ties break by member id.
 */
export function deriveSettlements(
  members: ReadonlyArray<Pick<MemberBalanceView, "memberId" | "displayName" | "balance">>,
): DerivedSettlement[] {
  const creditors = members
    .map((member) => ({
      memberId: member.memberId,
      displayName: member.displayName,
      cents: Math.round(roundMoney(member.balance) * MONEY_CENTS),
    }))
    .filter((member) => member.cents > 0)
    .sort((a, b) => b.cents - a.cents || a.memberId.localeCompare(b.memberId));

  const debtors = members
    .map((member) => ({
      memberId: member.memberId,
      displayName: member.displayName,
      cents: Math.round(roundMoney(member.balance) * MONEY_CENTS),
    }))
    .filter((member) => member.cents < 0)
    .sort((a, b) => a.cents - b.cents || a.memberId.localeCompare(b.memberId));

  const settlements: DerivedSettlement[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const pay = Math.min(-debtor.cents, creditor.cents);
    if (pay > 0) {
      settlements.push({
        fromMemberId: debtor.memberId,
        fromName: debtor.displayName,
        toMemberId: creditor.memberId,
        toName: creditor.displayName,
        amount: pay / MONEY_CENTS,
      });
      debtor.cents += pay;
      creditor.cents -= pay;
    }
    if (debtor.cents === 0) i += 1;
    if (creditor.cents === 0) j += 1;
  }

  return settlements;
}

function collectNameFallbacks(
  expenses: readonly ExpenseRow[],
  incomes: readonly IncomeRow[],
): Map<string, string> {
  const names = new Map<string, string>();
  for (const expense of expenses) {
    if (expense.payerId && expense.payer?.displayName) {
      names.set(expense.payerId, expense.payer.displayName);
    }
  }
  for (const income of incomes) {
    if (income.memberId && income.member?.displayName) {
      names.set(income.memberId, income.member.displayName);
    }
  }
  return names;
}

/** Confirmed shared expenses and incomes only. Leftover expense templates are not an input. */
export function calculateMonthlyBalance(input: {
  expenses: readonly ExpenseRow[];
  incomes: readonly IncomeRow[];
  members: ReadonlyArray<Pick<HouseholdMemberView, "userId" | "displayName">>;
  range: MonthRange;
  householdId?: string;
}): MonthlyBalance {
  const periodExpenses = visiblePeriodExpenses([...input.expenses], input.range, input.householdId);
  const shared = periodExpenses.filter(isSharedExpense);
  const periodIncomes = visiblePeriodIncomes([...input.incomes], input.range, input.householdId);
  const fallbacks = collectNameFallbacks(periodExpenses, periodIncomes);

  const incomeIds = new Set<string>(
    input.members.map((member) => member.userId).filter(Boolean),
  );
  for (const income of periodIncomes) {
    if (income.memberId) incomeIds.add(income.memberId);
  }

  const listedIds = input.members.map((member) => member.userId).filter(Boolean);
  const extraIncomeIds = [...incomeIds]
    .filter((id) => !listedIds.includes(id))
    .sort((a, b) => a.localeCompare(b));

  const memberIncomes: MemberIncomeView[] = [...listedIds, ...extraIncomeIds]
    .map((memberId) => ({
      memberId,
      displayName: memberDisplayName(memberId, input.members, fallbacks),
      amount: memberPeriodIncomeTotal(periodIncomes, memberId, input.range, input.householdId),
    }))
    .filter((row) => row.amount > 0);

  const members = calculateMemberBalances({
    expenses: shared,
    members: input.members,
    nameFallbacks: fallbacks,
  });
  const settlements = deriveSettlements(members);
  const sharedGross = sumMoney(shared.map((expense) => expense.amount));
  const sharedNet = sumMoney(shared.map((expense) => netExpense(expense.amount, expense.refunds)));

  let status: MonthlyBalance["status"] = "empty";
  if (shared.length > 0) {
    status = settlements.length === 0 ? "settled" : "unsettled";
  }

  return {
    range: input.range,
    status,
    incomeTotal: sumMoney(periodIncomes.map((income) => income.amount)),
    memberIncomes,
    sharedGross,
    sharedNet,
    members,
    settlements,
  };
}

export const OUTSTANDING_BALANCE_LOOKBACK_MONTHS = 24;

/**
 * Overlay unanimous member confirmations on a derived monthly statement.
 * When every current member has confirmed an unsettled month, debt displays as 0.
 * Confirmations do not rewrite expenses.
 */
export function applyMonthlyBalancePayment(
  balance: MonthlyBalance,
  input: {
    confirmations: readonly MonthlyBalanceConfirmation[];
    memberIds: readonly string[];
  },
): MonthlyBalance {
  const memberIds = [...new Set(input.memberIds.filter(Boolean))];
  const confirmedUserIds = [
    ...new Set(
      input.confirmations
        .filter(
          (row) =>
            row.year === balance.range.year &&
            row.month === balance.range.month &&
            memberIds.includes(row.userId),
        )
        .map((row) => row.userId),
    ),
  ];
  const pendingUserIds = memberIds.filter((id) => !confirmedUserIds.includes(id));
  const paid =
    balance.status === "unsettled" && memberIds.length > 0 && pendingUserIds.length === 0;

  if (!paid) {
    return {
      ...balance,
      payment: {
        paid: false,
        confirmedUserIds,
        pendingUserIds,
      },
    };
  }

  return {
    ...balance,
    status: "paid",
    members: balance.members.map((row) => ({ ...row, balance: 0 })),
    settlements: [],
    payment: {
      paid: true,
      confirmedUserIds,
      pendingUserIds: [],
    },
  };
}

/**
 * Past calendar months, newest first, whose derived shared debt is still unpaid.
 * The current month is omitted (Home already shows it on Balance). Future months are ignored.
 */
export function findOutstandingBalanceMonths(input: {
  expenses: readonly ExpenseRow[];
  members: ReadonlyArray<Pick<HouseholdMemberView, "userId" | "displayName">>;
  confirmations: readonly MonthlyBalanceConfirmation[];
  through: MonthRange;
  householdId?: string;
  lookbackMonths?: number;
}): MonthlyBalance[] {
  const lookback = input.lookbackMonths ?? OUTSTANDING_BALANCE_LOOKBACK_MONTHS;
  const start = shiftMonth(input.through, -(lookback - 1));
  const memberIds = input.members.map((member) => member.userId).filter(Boolean);
  const groups = new Map<string, { range: MonthRange; expenses: ExpenseRow[] }>();

  for (const expense of input.expenses) {
    if (expense.deletedAt != null || !isSharedExpense(expense)) continue;
    const range = monthRangeFromIsoDate(expense.occurredAt, input.through.timeZone);
    if (!range) continue;
    if (range.start < start.start || range.start >= input.through.start) continue;
    const key = `${range.year}-${String(range.month).padStart(2, "0")}`;
    const group = groups.get(key);
    if (group) group.expenses.push(expense);
    else groups.set(key, { range, expenses: [expense] });
  }

  return [...groups.values()]
    .sort((a, b) => b.range.start.localeCompare(a.range.start))
    .map((group) =>
      applyMonthlyBalancePayment(
        calculateMonthlyBalance({
          expenses: group.expenses,
          incomes: [],
          members: input.members,
          range: group.range,
          householdId: input.householdId,
        }),
        { confirmations: input.confirmations, memberIds },
      ),
    )
    .filter((row) => row.status === "unsettled");
}

export type CompactBalanceCopy = {
  headline: string;
  hasObligation: boolean;
};

export function compactBalanceCopy(
  balance: MonthlyBalance,
  currentUserId: string | null | undefined,
): CompactBalanceCopy {
  if (balance.status === "empty") {
    return { headline: "Sin gastos compartidos este mes", hasObligation: false };
  }
  if (balance.status === "paid") {
    return { headline: "Deuda pagada", hasObligation: false };
  }
  if (balance.status === "settled") {
    return { headline: "Todo está equilibrado", hasObligation: false };
  }

  const viewer = currentUserId
    ? balance.members.find((member) => member.memberId === currentUserId)
    : undefined;
  const involvingViewer = currentUserId
    ? balance.settlements.filter(
        (row) => row.fromMemberId === currentUserId || row.toMemberId === currentUserId,
      )
    : [];

  if (involvingViewer.length === 1) {
    const row = involvingViewer[0];
    if (row.toMemberId === currentUserId) {
      return {
        headline: `${row.fromName} te debe ${formatBalanceAmount(row.amount)}`,
        hasObligation: true,
      };
    }
    return {
      headline: `Le debes ${formatBalanceAmount(row.amount)} a ${row.toName}`,
      hasObligation: true,
    };
  }

  if (viewer && viewer.balance > 0 && involvingViewer.length > 1) {
    return {
      headline: `Te deben ${formatBalanceAmount(viewer.balance)}`,
      hasObligation: true,
    };
  }
  if (viewer && viewer.balance < 0 && involvingViewer.length > 1) {
    return {
      headline: `Debes ${formatBalanceAmount(Math.abs(viewer.balance))}`,
      hasObligation: true,
    };
  }

  const first = balance.settlements[0];
  return {
    headline: `${first.fromName} le debe a ${first.toName} ${formatBalanceAmount(first.amount)}`,
    hasObligation: true,
  };
}

function formatBalanceAmount(amount: number): string {
  const value = roundMoney(amount);
  const hasCents = Math.round(Math.abs(value) * MONEY_CENTS) % MONEY_CENTS !== 0;
  return `$${Math.abs(value).toLocaleString("es-MX", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
