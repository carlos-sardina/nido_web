import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  buildCreateContributionPayload,
  type CreateContributionRequest,
} from "./financial/contribution-input.ts";

export type UpdateContributionRequest = CreateContributionRequest & {
  contributionId: string;
};

export type UpdateContributionAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "update_goal_contribution",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

export async function updateContributionWithAuth(
  input: UpdateContributionRequest,
  auth: UpdateContributionAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");
  if (!input.contributionId) return nidoFail("contribution_not_found");

  const payload = buildCreateContributionPayload(input, userId);
  if (payload.ok === false) return nidoFail(payload.error);

  const { data, error } = await auth.rpc("update_goal_contribution", {
    p_contribution_id: input.contributionId,
    p_amount: payload.data.amount,
    p_contributed_at: payload.data.contributedAt,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}
