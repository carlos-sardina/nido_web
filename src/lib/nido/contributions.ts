import { nidoClient, requireUser, type NidoClient } from "./session";
import { nidoFail, type NidoResult } from "./errors";
import {
  canSubmitContribution,
  createContributionWithAuth,
  type CreateContributionRequest,
} from "./create-contribution.ts";
import { deleteContributionWithAuth } from "./delete-contribution.ts";
import {
  updateContributionWithAuth,
  type UpdateContributionRequest,
} from "./update-contribution.ts";

export type { CreateContributionRequest, UpdateContributionRequest };
export { canSubmitContribution };

export async function createContribution(
  input: CreateContributionRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return createContributionWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}

export async function updateContribution(
  input: UpdateContributionRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return updateContributionWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}

export async function deleteContribution(
  contributionId: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return deleteContributionWithAuth(contributionId, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}
