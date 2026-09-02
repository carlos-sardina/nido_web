import { isSueldoIncomeCategory } from "./categories.ts";
import {
  daysInMonth,
  isDateInRange,
  isoDate,
  shiftMonth,
  type MonthRange,
} from "./dates.ts";
import type { IncomeRow } from "./types.ts";

/** How far back a missed month may be filled from the last live Sueldo. */
export const SALARY_COPY_LOOKBACK_MONTHS = 12;

export type SalaryCopyCandidate = {
  sourceId: string;
  memberId: string;
  categoryId: string;
  amount: number;
  description: string | null;
  occurredAt: string;
  createdBy: string;
};

function salaryDescriptionKey(description: string | null | undefined): string {
  return description?.trim() ?? "";
}

export function salaryMatchKey(
  income: Pick<IncomeRow, "memberId" | "categoryId" | "description">,
): string {
  return `${income.memberId}\0${income.categoryId}\0${salaryDescriptionKey(income.description)}`;
}

export function copiedSalaryOccurredAt(
  sourceOccurredAt: string,
  targetRange: MonthRange,
): string {
  const day = Number(sourceOccurredAt.slice(8, 10));
  const clamped = Number.isFinite(day)
    ? Math.min(Math.max(day, 1), daysInMonth(targetRange.year, targetRange.month))
    : 1;
  return isoDate(targetRange.year, targetRange.month, clamped);
}

export function isCopyableSalaryIncome(
  income: Pick<IncomeRow, "deletedAt" | "recurringId" | "memberId" | "categoryId" | "category">,
  input: {
    sueldoCategoryIds: ReadonlySet<string>;
    activeMemberIds: ReadonlySet<string>;
  },
): boolean {
  if (income.deletedAt != null) return false;
  if (income.recurringId != null) return false;
  if (!input.activeMemberIds.has(income.memberId)) return false;
  if (input.sueldoCategoryIds.has(income.categoryId)) return true;
  return income.category != null && isSueldoIncomeCategory(income.category);
}

function copiedFromIdOf(income: Pick<IncomeRow, "copiedFromId">): string | null {
  return income.copiedFromId ?? null;
}

/**
 * True when the target month already has this salary: a descendant
 * (live or deleted) or a live Sueldo with the same member + description.
 * A deleted descendant is a stop signal — do not resurrect it.
 */
export function salaryAlreadyRepresentedInTarget(
  source: Pick<IncomeRow, "id" | "memberId" | "categoryId" | "description">,
  targets: readonly Pick<
    IncomeRow,
    "copiedFromId" | "deletedAt" | "memberId" | "categoryId" | "description"
  >[],
): boolean {
  const key = salaryMatchKey(source);
  return targets.some((target) => {
    if (copiedFromIdOf(target) === source.id) return true;
    if (target.deletedAt != null) return false;
    return salaryMatchKey(target) === key;
  });
}

/**
 * Live Sueldo rows in `sourceRange` that should be written into `targetRange`.
 * Extra, recurring-template occurrences, left members, and already-copied
 * (or deleted) descendants are skipped.
 */
export function salariesToCopy(input: {
  sources: readonly IncomeRow[];
  targets: readonly IncomeRow[];
  sourceRange: MonthRange;
  targetRange: MonthRange;
  sueldoCategoryIds: ReadonlySet<string>;
  activeMemberIds: ReadonlySet<string>;
}): SalaryCopyCandidate[] {
  const sourceMonth = input.sources.filter(
    (income) =>
      isDateInRange(income.occurredAt, input.sourceRange) &&
      isCopyableSalaryIncome(income, input),
  );
  const targetMonth = input.targets.filter((income) =>
    isDateInRange(income.occurredAt, input.targetRange),
  );

  return sourceMonth
    .filter((source) => !salaryAlreadyRepresentedInTarget(source, targetMonth))
    .map((source) => ({
      sourceId: source.id,
      memberId: source.memberId,
      categoryId: source.categoryId,
      amount: source.amount,
      description: source.description,
      occurredAt: copiedSalaryOccurredAt(source.occurredAt, input.targetRange),
      createdBy: source.createdBy,
    }));
}

/**
 * Walks each month from `lookback` months ago through the current month
 * so a skipped month still receives last month's Sueldo, while a deleted
 * copy stops the chain.
 */
export function salariesToCopyAcrossMonths(input: {
  incomes: readonly IncomeRow[];
  currentRange: MonthRange;
  sueldoCategoryIds: ReadonlySet<string>;
  activeMemberIds: ReadonlySet<string>;
  lookbackMonths?: number;
}): SalaryCopyCandidate[] {
  const lookback = input.lookbackMonths ?? SALARY_COPY_LOOKBACK_MONTHS;
  const planned: SalaryCopyCandidate[] = [];
  const working: IncomeRow[] = [...input.incomes];

  for (let i = lookback; i >= 1; i -= 1) {
    const targetRange = shiftMonth(input.currentRange, 1 - i);
    const sourceRange = shiftMonth(targetRange, -1);
    const copies = salariesToCopy({
      sources: working,
      targets: working,
      sourceRange,
      targetRange,
      sueldoCategoryIds: input.sueldoCategoryIds,
      activeMemberIds: input.activeMemberIds,
    });
    for (const copy of copies) {
      planned.push(copy);
      working.push({
        id: `planned:${copy.sourceId}:${targetRange.start}`,
        householdId: input.incomes[0]?.householdId ?? "",
        memberId: copy.memberId,
        categoryId: copy.categoryId,
        amount: copy.amount,
        description: copy.description,
        occurredAt: copy.occurredAt,
        recurringId: null,
        copiedFromId: copy.sourceId,
        createdBy: copy.createdBy,
        createdAt: `${copy.occurredAt}T00:00:00.000Z`,
        deletedAt: null,
        category: { id: copy.categoryId, name: "Sueldo", icon: "💰" },
        member: null,
      });
    }
  }

  return planned;
}
