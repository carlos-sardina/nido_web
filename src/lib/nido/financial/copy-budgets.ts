import { isNidoBudget, isPersonalBudget, visiblePeriodBudgets } from "./budgets.ts";
import type { MonthRange } from "./dates.ts";
import type { BudgetRow } from "./types.ts";

export type BudgetCopyDraft = {
  id: string;
  categoryId: string;
  name: string;
  icon: string;
  amount: number;
  personal: boolean;
};

/**
 * Live budgets from the previous month that this member may recreate:
 * Nido-level rows and their own personal rows. Other members' personal
 * budgets are never copied — create_budget can only write member_id = auth.uid().
 */
export function copyablePreviousMonthBudgets(
  previousBudgets: BudgetRow[],
  previousRange: MonthRange,
  currentUserId: string,
): BudgetRow[] {
  if (!currentUserId) return [];
  return visiblePeriodBudgets(previousBudgets, previousRange).filter((budget) => {
    if (isNidoBudget(budget)) return true;
    return budget.memberId === currentUserId;
  });
}

export function budgetCopyDraftKey(
  draft: Pick<BudgetCopyDraft, "categoryId" | "personal">,
): string {
  return `${draft.personal ? "personal" : "nido"}:${draft.categoryId}`;
}

export function hasDuplicateBudgetCopyDrafts(drafts: readonly BudgetCopyDraft[]): boolean {
  const seen = new Set<string>();
  for (const draft of drafts) {
    const key = budgetCopyDraftKey(draft);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export function draftsFromPreviousMonthBudgets(input: {
  previousBudgets: BudgetRow[];
  previousRange: MonthRange;
  currentUserId: string;
  allowedCategoryIds: readonly string[];
}): BudgetCopyDraft[] {
  const allowed = new Set(input.allowedCategoryIds);
  return copyablePreviousMonthBudgets(
    input.previousBudgets,
    input.previousRange,
    input.currentUserId,
  )
    .filter((budget) => allowed.has(budget.categoryId) && budget.amount > 0)
    .map((budget) => ({
      id: budget.id,
      categoryId: budget.categoryId,
      name: budget.category?.name?.trim() || "Categoría",
      icon: budget.category?.icon?.trim() || "📌",
      amount: budget.amount,
      personal: isPersonalBudget(budget),
    }));
}
