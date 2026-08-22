import { nidoClient, requireUser, type NidoClient } from "./session";
import { nidoFail, type NidoResult } from "./errors";
import {
  canSubmitGoal,
  createGoalWithAuth,
  type CreateGoalRequest,
} from "./create-goal.ts";
import { archiveGoalWithAuth } from "./archive-goal.ts";
import {
  updateGoalWithAuth,
  type UpdateGoalRequest,
} from "./update-goal.ts";

export type { CreateGoalRequest, UpdateGoalRequest };
export { canSubmitGoal };

export async function createGoal(
  input: CreateGoalRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return createGoalWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}

export async function updateGoal(
  input: UpdateGoalRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return updateGoalWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}

export async function archiveGoal(
  goalId: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return archiveGoalWithAuth(goalId, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}
