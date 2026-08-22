import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  buildCreateGoalPayload,
  type CreateGoalRequest,
} from "./financial/goal-input.ts";

export type UpdateGoalRequest = CreateGoalRequest & {
  goalId: string;
};

export type UpdateGoalAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "update_goal",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

export async function updateGoalWithAuth(
  input: UpdateGoalRequest,
  auth: UpdateGoalAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");
  if (!input.goalId) return nidoFail("goal_not_found");

  const payload = buildCreateGoalPayload(input, userId);
  if (payload.ok === false) {
    if (payload.error === "invalid_name") {
      return nidoFail("invalid_name", "El nombre de la meta no es válido.");
    }
    return nidoFail(payload.error);
  }

  const { data, error } = await auth.rpc("update_goal", {
    p_goal_id: input.goalId,
    p_name: payload.data.name,
    p_target_amount: payload.data.amount,
    p_goal_type: payload.data.goalType,
    p_target_date: payload.data.targetDate,
    p_description: payload.data.description,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}
