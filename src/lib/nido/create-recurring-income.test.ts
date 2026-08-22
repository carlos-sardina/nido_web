import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSubmitRecurrence, createRecurringIncomeWithAuth } from "./create-recurring-income.ts";
import { materializeRecurringIncomeWithAuth } from "./materialize-recurring-income.ts";
import { setRecurringIncomeActiveWithAuth } from "./set-recurring-income-active.ts";
import { updateRecurringIncomeWithAuth } from "./update-recurring-income.ts";

const validInput = {
  householdId: "h1",
  categoryId: "c1",
  amount: 40000,
  description: "Sueldo",
  startDate: "2026-08-01",
  frequency: "monthly" as const,
  activeMemberIds: ["u1"],
  allowedCategoryIds: ["c1"],
};

describe("createRecurringIncomeWithAuth", () => {
  it("does not call the RPC without a session", async () => {
    let called = 0;
    const result = await createRecurringIncomeWithAuth(validInput, {
      getUserId: async () => null,
      rpc: async () => {
        called += 1;
        return { data: "r1", error: null };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(called, 0);
  });

  it("does not send created_by or member_id from the client", async () => {
    const result = await createRecurringIncomeWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "create_recurring_income");
        assert.equal("p_created_by" in args, false);
        assert.equal("p_member_id" in args, false);
        assert.equal(args.p_start_date, "2026-08-01");
        assert.equal(args.p_frequency, "monthly");
        return { data: "ri-1", error: null };
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.id, "ri-1");
  });

  it("maps authorization and inactive errors", async () => {
    const denied = await createRecurringIncomeWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async () => ({ data: null, error: { message: "nido.not_a_member", code: "P0001" } }),
    });
    assert.equal(denied.ok, false);
    if (denied.ok === false) assert.equal(denied.error.code, "not_a_member");
  });
});

describe("update / pause / materialize recurring income", () => {
  it("edits without sending household_id as authorization", async () => {
    const result = await updateRecurringIncomeWithAuth(
      { ...validInput, recurringId: "ri-1" },
      {
        getUserId: async () => "u1",
        rpc: async (fn, args) => {
          assert.equal(fn, "update_recurring_income");
          assert.equal(args.p_recurring_id, "ri-1");
          assert.equal("p_household_id" in args, false);
          assert.equal("p_member_id" in args, false);
          return { data: "ri-1", error: null };
        },
      },
    );
    assert.equal(result.ok, true);
  });

  it("pauses and reactivates without deleting movements", async () => {
    const paused = await setRecurringIncomeActiveWithAuth("ri-1", false, {
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "set_recurring_income_active");
        assert.equal(args.p_is_active, false);
        return { data: "ri-1", error: null };
      },
    });
    const resumed = await setRecurringIncomeActiveWithAuth("ri-1", true, {
      getUserId: async () => "u1",
      rpc: async (_fn, args) => {
        assert.equal(args.p_is_active, true);
        return { data: "ri-1", error: null };
      },
    });
    assert.equal(paused.ok, true);
    assert.equal(resumed.ok, true);
  });

  it("materializes the requested period and maps already-materialized as conflict", async () => {
    const first = await materializeRecurringIncomeWithAuth("ri-1", "2026-08-01", {
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "materialize_recurring_income");
        assert.equal(args.p_occurred_at, "2026-08-01");
        return { data: "inc-1", error: null };
      },
    });
    assert.equal(first.ok, true);
    if (first.ok) assert.equal(first.data.id, "inc-1");

    const retry = await materializeRecurringIncomeWithAuth("ri-1", "2026-08-01", {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: {
          message: 'duplicate key value violates unique constraint "incomes_recurring_occurrence_live_idx"',
          code: "23505",
        },
      }),
    });
    assert.equal(retry.ok, false);
    if (retry.ok === false) assert.equal(retry.error.code, "conflict");
  });

  it("maps future, inactive, review, and other-household failures", async () => {
    const future = await materializeRecurringIncomeWithAuth("ri-1", "2026-12-01", {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.recurrence_not_due", code: "P0001" },
      }),
    });
    const inactive = await materializeRecurringIncomeWithAuth("ri-1", "2026-08-01", {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.recurrence_inactive", code: "P0001" },
      }),
    });
    const review = await materializeRecurringIncomeWithAuth("ri-1", "2026-08-01", {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.recurrence_requires_review", code: "P0001" },
      }),
    });
    const other = await materializeRecurringIncomeWithAuth("ri-1", "2026-08-01", {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.recurrence_not_found", code: "P0001" },
      }),
    });
    assert.equal(future.ok, false);
    if (future.ok === false) assert.equal(future.error.code, "recurrence_not_due");
    assert.equal(inactive.ok, false);
    if (inactive.ok === false) assert.equal(inactive.error.code, "recurrence_inactive");
    assert.equal(review.ok, false);
    if (review.ok === false) assert.equal(review.error.code, "recurrence_requires_review");
    assert.equal(other.ok, false);
    if (other.ok === false) assert.equal(other.error.code, "recurrence_not_found");
  });

  it("blocks a second submit while the first is in flight", () => {
    assert.equal(canSubmitRecurrence(false), true);
    assert.equal(canSubmitRecurrence(true), false);
  });
});
