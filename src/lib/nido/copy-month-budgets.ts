import { nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  draftsFromPreviousMonthBudgets,
  hasDuplicateBudgetCopyDrafts,
  type BudgetCopyDraft,
} from "./financial/copy-budgets.ts";
import type { HouseholdCategory } from "./financial/categories.ts";
import { getCurrentMonthRange, shiftMonth, type MonthRange } from "./financial/dates.ts";
import type { BudgetRow } from "./financial/types.ts";
import type { CreateBudgetRequest } from "./financial/budget-input.ts";

export type CopyPreviousMonthBudgetsInput = {
  householdId: string;
  currentUserId: string;
  activeMemberIds: readonly string[];
  now?: Date;
};

export type PreviousMonthCopyDrafts = {
  previousRange: MonthRange;
  currentRange: MonthRange;
  drafts: BudgetCopyDraft[];
  categories: HouseholdCategory[];
};

export type CopyPreviousMonthBudgetsResult = {
  copied: number;
  skipped: number;
};

export type LoadPreviousMonthCopyDraftsDeps = {
  fetchBudgetsForRange: (
    householdId: string,
    range: MonthRange,
  ) => Promise<NidoResult<BudgetRow[]>>;
  fetchActiveExpenseCategories: (
    householdId: string,
  ) => Promise<NidoResult<HouseholdCategory[]>>;
};

export type CreateBudgetsFromCopyDraftsInput = {
  householdId: string;
  currentUserId: string;
  activeMemberIds: readonly string[];
  allowedCategoryIds: readonly string[];
  drafts: readonly BudgetCopyDraft[];
  now?: Date;
};

export type CreateBudgetsFromCopyDraftsDeps = {
  createBudget: (input: CreateBudgetRequest) => Promise<NidoResult<{ id: string }>>;
};

export function canCopyPreviousMonthBudgets(submitting: boolean): boolean {
  return !submitting;
}

function requireCopyActor(
  input: Pick<CopyPreviousMonthBudgetsInput, "householdId" | "currentUserId" | "activeMemberIds">,
): NidoResult<true> {
  if (!input.householdId) return nidoFail("not_a_member");
  if (!input.currentUserId) return nidoFail("unauthenticated");
  if (!input.activeMemberIds.includes(input.currentUserId)) {
    return nidoFail("not_a_member");
  }
  return nidoOk(true);
}

/**
 * Loads last month's Nido budgets and the caller's personal budgets
 * so the user can review, archive, edit, or add before confirming.
 */
export async function loadPreviousMonthCopyDraftsWithDeps(
  input: CopyPreviousMonthBudgetsInput,
  deps: LoadPreviousMonthCopyDraftsDeps,
): Promise<NidoResult<PreviousMonthCopyDrafts>> {
  const actor = requireCopyActor(input);
  if (actor.ok === false) return actor;

  const currentRange = getCurrentMonthRange(input.now);
  const previousRange = shiftMonth(currentRange, -1);

  const [budgetsRes, categoriesRes] = await Promise.all([
    deps.fetchBudgetsForRange(input.householdId, previousRange),
    deps.fetchActiveExpenseCategories(input.householdId),
  ]);
  if (budgetsRes.ok === false) return budgetsRes;
  if (categoriesRes.ok === false) return categoriesRes;

  return nidoOk({
    previousRange,
    currentRange,
    categories: categoriesRes.data,
    drafts: draftsFromPreviousMonthBudgets({
      previousBudgets: budgetsRes.data,
      previousRange,
      currentUserId: input.currentUserId,
      allowedCategoryIds: categoriesRes.data.map((category) => category.id),
    }),
  });
}

/**
 * Creates current-month budget rows from the reviewed draft list.
 */
export async function createBudgetsFromCopyDraftsWithDeps(
  input: CreateBudgetsFromCopyDraftsInput,
  deps: CreateBudgetsFromCopyDraftsDeps,
): Promise<NidoResult<CopyPreviousMonthBudgetsResult>> {
  const actor = requireCopyActor(input);
  if (actor.ok === false) return actor;

  if (input.drafts.length === 0) {
    return nidoFail("budget_not_found", "Agrega al menos un presupuesto para copiar.");
  }
  if (hasDuplicateBudgetCopyDrafts(input.drafts)) {
    return nidoFail("conflict", "Hay categorías repetidas. Archiva el duplicado.");
  }

  const currentRange = getCurrentMonthRange(input.now);
  let copied = 0;
  let skipped = 0;

  for (const draft of input.drafts) {
    const result = await deps.createBudget({
      householdId: input.householdId,
      categoryId: draft.categoryId,
      amount: draft.amount,
      startDate: currentRange.start,
      personal: draft.personal,
      activeMemberIds: input.activeMemberIds,
      allowedCategoryIds: input.allowedCategoryIds,
    });
    if (result.ok === false) {
      if (result.error.code === "conflict") {
        skipped += 1;
        continue;
      }
      if (copied > 0) {
        return nidoFail(
          result.error.code,
          "Se copiaron algunos presupuestos, pero no pudimos terminar. Inténtalo de nuevo.",
        );
      }
      return nidoFail(result.error.code);
    }
    copied += 1;
  }

  return nidoOk({ copied, skipped });
}
