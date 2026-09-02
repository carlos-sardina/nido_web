import { nidoClient, requireUser, type NidoClient } from "./session";
import { nidoFail, type NidoResult } from "./errors";
import {
  canCopyPreviousMonthBudgets,
  createBudgetsFromCopyDraftsWithDeps,
  loadPreviousMonthCopyDraftsWithDeps,
  type CopyPreviousMonthBudgetsResult,
  type PreviousMonthCopyDrafts,
} from "./copy-month-budgets.ts";
import type { BudgetCopyDraft } from "./financial/copy-budgets.ts";
import {
  canSubmitBudget,
  createBudgetWithAuth,
  type CreateBudgetRequest,
} from "./create-budget.ts";
import { deleteBudgetWithAuth } from "./delete-budget.ts";
import { fetchActiveExpenseCategories } from "./queries/categories.ts";
import { fetchBudgetsForRange } from "./queries/budgets.ts";
import {
  updateBudgetWithAuth,
  type UpdateBudgetRequest,
} from "./update-budget.ts";

export type { CreateBudgetRequest, UpdateBudgetRequest, CopyPreviousMonthBudgetsResult, PreviousMonthCopyDrafts };
export { canSubmitBudget, canCopyPreviousMonthBudgets };

export async function createBudget(
  input: CreateBudgetRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return createBudgetWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}

export async function updateBudget(
  input: UpdateBudgetRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return updateBudgetWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}

export async function deleteBudget(
  budgetId: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return deleteBudgetWithAuth(budgetId, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}

export async function loadPreviousMonthCopyDrafts(
  input: {
    householdId: string;
    activeMemberIds: readonly string[];
    now?: Date;
  },
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<PreviousMonthCopyDrafts>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return loadPreviousMonthCopyDraftsWithDeps(
    {
      householdId: input.householdId,
      currentUserId: auth.data.user.id,
      activeMemberIds: input.activeMemberIds,
      now: input.now,
    },
    {
      fetchBudgetsForRange: (householdId, range) =>
        fetchBudgetsForRange(householdId, range, supabase),
      fetchActiveExpenseCategories: (householdId) =>
        fetchActiveExpenseCategories(householdId, supabase),
    },
  );
}

export async function createBudgetsFromCopyDrafts(
  input: {
    householdId: string;
    activeMemberIds: readonly string[];
    allowedCategoryIds: readonly string[];
    drafts: readonly BudgetCopyDraft[];
    now?: Date;
  },
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<CopyPreviousMonthBudgetsResult>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return createBudgetsFromCopyDraftsWithDeps(
    {
      householdId: input.householdId,
      currentUserId: auth.data.user.id,
      activeMemberIds: input.activeMemberIds,
      allowedCategoryIds: input.allowedCategoryIds,
      drafts: input.drafts,
      now: input.now,
    },
    {
      createBudget: (request) => createBudget(request, supabase),
    },
  );
}
