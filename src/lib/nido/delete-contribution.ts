import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";

export type DeleteContributionAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "soft_delete_goal_contribution",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

export async function deleteContributionWithAuth(
  contributionId: string,
  auth: DeleteContributionAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");
  if (!contributionId) return nidoFail("contribution_not_found");

  const { data, error } = await auth.rpc("soft_delete_goal_contribution", {
    p_contribution_id: contributionId,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}
