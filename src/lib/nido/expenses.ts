import { nidoClient, requireUser, type NidoClient } from "./session";
import { nidoFail, type NidoResult } from "./errors";
import {
  canSubmitExpense,
  createExpenseWithAuth,
  type CreateExpenseRequest,
} from "./create-expense.ts";
import {
  canSubmitRefund,
  createRefundWithAuth,
  type CreateRefundRequest,
} from "./create-refund.ts";
import { deleteExpenseWithAuth } from "./delete-expense.ts";
import {
  updateExpenseWithAuth,
  type UpdateExpenseRequest,
} from "./update-expense.ts";

export type { CreateExpenseRequest, CreateRefundRequest, UpdateExpenseRequest };
export { canSubmitExpense, canSubmitRefund };

export async function createExpense(
  input: CreateExpenseRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return createExpenseWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}

export async function updateExpense(
  input: UpdateExpenseRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return updateExpenseWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}

export async function deleteExpense(
  expenseId: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return deleteExpenseWithAuth(expenseId, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}

export async function createRefund(
  input: CreateRefundRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return createRefundWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}
