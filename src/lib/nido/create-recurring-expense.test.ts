import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRecurringExpenseWithAuth } from "./create-recurring-expense.ts";
import { materializeRecurringExpenseWithAuth } from "./materialize-recurring-expense.ts";
import { setRecurringExpenseActiveWithAuth } from "./set-recurring-expense-active.ts";
import { updateRecurringExpenseWithAuth } from "./update-recurring-expense.ts";

const validInput = {
  householdId: "h1",
  categoryId: "c1",
  amount: 800,
  description: "Renta",
  startDate: "2026-08-01",
  frequency: "monthly" as const,
  scope: "shared" as const,
  participantIds: ["u1", "u2"],
  activeMemberIds: ["u1", "u2"],
  allowedCategoryIds: ["c1"],
};

describe("createRecurringExpenseWithAuth", () => {
  it("does not call the RPC when validation fails", async () => {
    let called = 0;
    const result = await createRecurringExpenseWithAuth(
      { ...validInput, amount: 0 },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "re-1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_amount");
    assert.equal(called, 0);
  });

  it("sends planned splits and never sends created_by or payer_id", async () => {
    const result = await createRecurringExpenseWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "create_recurring_expense");
        assert.equal("p_created_by" in args, false);
        assert.equal("p_payer_id" in args, false);
        const splits = args.p_splits as Array<{ member_id: string; amount: number }>;
        assert.equal(splits.length, 2);
        assert.equal(splits[0].amount + splits[1].amount, 800);
        return { data: "re-1", error: null };
      },
    });
    assert.equal(result.ok, true);
  });

  it("rejects another household member list", async () => {
    const result = await createRecurringExpenseWithAuth(
      { ...validInput, activeMemberIds: ["u2"] },
      {
        getUserId: async () => "u1",
        rpc: async () => ({ data: "re-1", error: null }),
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "not_a_member");
  });
});

describe("update / pause / materialize recurring expense", () => {
  it("edits splits without sending household_id", async () => {
    const result = await updateRecurringExpenseWithAuth(
      { ...validInput, recurringId: "re-1", amount: 900 },
      {
        getUserId: async () => "u1",
        rpc: async (fn, args) => {
          assert.equal(fn, "update_recurring_expense");
          assert.equal("p_household_id" in args, false);
          assert.equal(args.p_amount, 900);
          return { data: "re-1", error: null };
        },
      },
    );
    assert.equal(result.ok, true);
  });

  it("pauses then reactivates", async () => {
    const paused = await setRecurringExpenseActiveWithAuth("re-1", false, {
      getUserId: async () => "u1",
      rpc: async (_fn, args) => {
        assert.equal(args.p_is_active, false);
        return { data: "re-1", error: null };
      },
    });
    assert.equal(paused.ok, true);
  });

  it("materializes the first due period and treats a duplicate index as conflict", async () => {
    const first = await materializeRecurringExpenseWithAuth("re-1", "2026-08-01", {
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "materialize_recurring_expense");
        assert.equal(args.p_occurred_at, "2026-08-01");
        return { data: "exp-1", error: null };
      },
    });
    assert.equal(first.ok, true);

    const duplicate = await materializeRecurringExpenseWithAuth("re-1", "2026-08-01", {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: {
          message: 'duplicate key value violates unique constraint "expenses_recurring_occurrence_live_idx"',
          code: "23505",
        },
      }),
    });
    assert.equal(duplicate.ok, false);
    if (duplicate.ok === false) assert.equal(duplicate.error.code, "conflict");
  });

  it("maps departed-creator and archived-template failures", async () => {
    const left = await materializeRecurringExpenseWithAuth("re-1", "2026-08-01", {
      getUserId: async () => "u1",
      rpc: async () => ({ data: null, error: { message: "nido.not_a_member", code: "P0001" } }),
    });
    const archived = await setRecurringExpenseActiveWithAuth("", true, {
      getUserId: async () => "u1",
      rpc: async () => ({ data: "x", error: null }),
    });
    assert.equal(left.ok, false);
    if (left.ok === false) assert.equal(left.error.code, "not_a_member");
    assert.equal(archived.ok, false);
    if (archived.ok === false) assert.equal(archived.error.code, "recurrence_not_found");
  });
});
