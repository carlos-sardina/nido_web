import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";

export type ArchiveGoalAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "archive_goal",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

export async function archiveGoalWithAuth(
  goalId: string,
  auth: ArchiveGoalAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");
  if (!goalId) return nidoFail("goal_not_found");

  const { data, error } = await auth.rpc("archive_goal", {
    p_goal_id: goalId,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}
