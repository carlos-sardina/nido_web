import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  buildCreateGoalPayload,
  type CreateGoalRequest,
} from "./financial/goal-input.ts";

export type { CreateGoalRequest };

export type CreateGoalAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "create_goal",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

/**
 * Domain mutation used by createGoal().
 * Takes an auth adapter so unit tests do not load the Supabase browser client.
 */
export async function createGoalWithAuth(
  input: CreateGoalRequest,
  auth: CreateGoalAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const payload = buildCreateGoalPayload(input, userId);
  if (payload.ok === false) {
    if (payload.error === "invalid_name") {
      return nidoFail("invalid_name", "El nombre de la meta no es válido.");
    }
    return nidoFail(payload.error);
  }

  const { data, error } = await auth.rpc("create_goal", {
    p_household_id: payload.data.householdId,
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

export function canSubmitGoal(submitting: boolean): boolean {
  return !submitting;
}
