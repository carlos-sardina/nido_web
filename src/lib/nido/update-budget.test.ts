import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updateBudgetWithAuth } from "./update-budget.ts";

const validInput = {
  budgetId: "b1",
  householdId: "h1",
  categoryId: "c1",
  amount: 8000,
  startDate: "2026-08-01",
  activeMemberIds: ["u1"],
  allowedCategoryIds: ["c1"],
};

describe("updateBudgetWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await updateBudgetWithAuth(validInput, {
      getUserId: async () => null,
      rpc: async () => {
        called += 1;
        return { data: "b1", error: null };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(called, 0);
  });

  it("does not call the RPC when the budget id is missing", async () => {
    let called = 0;
    const result = await updateBudgetWithAuth(
      { ...validInput, budgetId: "" },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "b1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "budget_not_found");
    assert.equal(called, 0);
  });

  it("does not call the RPC when validation fails", async () => {
    let called = 0;
    const result = await updateBudgetWithAuth(
      { ...validInput, amount: 0 },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "b1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_amount");
    assert.equal(called, 0);
  });

  it("maps forbidden without exposing the raw message", async () => {
    const result = await updateBudgetWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.forbidden", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "forbidden");
      assert.equal(result.error.message.includes("nido."), false);
    }
  });

  it("maps a deleted budget without exposing Postgres", async () => {
    const result = await updateBudgetWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.budget_deleted", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "budget_deleted");
      assert.match(result.error.message, /eliminado/i);
    }
  });

  it("sends the edited fields to update_budget without client identity fields", async () => {
    const result = await updateBudgetWithAuth(
      { ...validInput, amount: 9000 },
      {
        getUserId: async () => "u1",
        rpc: async (fn, args) => {
          assert.equal(fn, "update_budget");
          assert.equal(args.p_budget_id, "b1");
          assert.equal(args.p_amount, 9000);
          assert.equal(args.p_start_date, "2026-08-01");
          assert.equal(args.p_end_date, "2026-08-31");
          assert.equal("p_created_by" in args, false);
          assert.equal("p_member_id" in args, false);
          assert.equal("p_household_id" in args, false);
          return { data: "b1", error: null };
        },
      },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.id, "b1");
  });
});
