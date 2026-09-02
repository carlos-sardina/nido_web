import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";

export type ConfirmMonthlyBalanceAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "confirm_monthly_balance",
    args: { p_year: number; p_month: number },
  ) => Promise<{ data: boolean | null; error: unknown }>;
};

export function canConfirmMonthlyBalance(input: {
  year: number;
  month: number;
}): boolean {
  return (
    Number.isInteger(input.year) &&
    Number.isInteger(input.month) &&
    input.year >= 2000 &&
    input.year <= 2100 &&
    input.month >= 1 &&
    input.month <= 12
  );
}

/**
 * Records that the current user confirmed this calendar month as paid.
 * household_id is never sent; the RPC uses the active membership of auth.uid().
 */
export async function confirmMonthlyBalanceWithAuth(
  input: { year: number; month: number },
  auth: ConfirmMonthlyBalanceAuth,
): Promise<NidoResult<{ paid: boolean }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");
  if (!canConfirmMonthlyBalance(input)) return nidoFail("invalid_date");

  const { data, error } = await auth.rpc("confirm_monthly_balance", {
    p_year: input.year,
    p_month: input.month,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  return nidoOk({ paid: data === true });
}

export function canSubmitBalancePayment(submitting: boolean, alreadyConfirmed: boolean): boolean {
  return !submitting && !alreadyConfirmed;
}
