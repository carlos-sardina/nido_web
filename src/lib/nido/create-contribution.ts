import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  buildCreateContributionPayload,
  type CreateContributionRequest,
} from "./financial/contribution-input.ts";

export type { CreateContributionRequest };

export type CreateContributionAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "create_goal_contribution",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

/**
 * Domain mutation used by createContribution().
 * Takes an auth adapter so unit tests do not load the Supabase browser client.
 *
 * member_id and created_by are never taken from the client. The RPC derives
 * both from auth.uid().
 */
export async function createContributionWithAuth(
  input: CreateContributionRequest,
  auth: CreateContributionAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const payload = buildCreateContributionPayload(input, userId);
  if (payload.ok === false) return nidoFail(payload.error);

  const { data, error } = await auth.rpc("create_goal_contribution", {
    p_goal_id: payload.data.goalId,
    p_amount: payload.data.amount,
    p_contributed_at: payload.data.contributedAt,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}

export function canSubmitContribution(submitting: boolean): boolean {
  return !submitting;
}
