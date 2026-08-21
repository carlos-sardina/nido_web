import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSubmitExpense, createExpenseWithAuth } from "./create-expense.ts";

const validInput = {
  householdId: "h1",
  categoryId: "c1",
  amount: 700,
  description: "Internet",
  occurredAt: "2026-08-21",
  scope: "personal" as const,
  participantIds: ["u1"],
  activeMemberIds: ["u1"],
  allowedCategoryIds: ["c1"],
};

describe("createExpenseWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await createExpenseWithAuth(validInput, {
      getUserId: async () => null,
      rpc: async () => {
        called += 1;
        return { data: "e-1", error: null };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(called, 0);
  });

  it("does not call the RPC when validation fails", async () => {
    let called = 0;
    const result = await createExpenseWithAuth(
      { ...validInput, amount: 0 },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "e-1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_amount");
    assert.equal(called, 0);
  });

  it("maps a network failure without exposing the raw message", async () => {
    const result = await createExpenseWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async () => ({ data: null, error: { message: "fetch failed", code: "PGRST301" } }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "network");
      assert.equal(result.error.message.includes("PGRST"), false);
      assert.match(result.error.message, /Inténtalo de nuevo/i);
    }
  });

  it("maps an authorization error from the RPC", async () => {
    const result = await createExpenseWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.not_a_member", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "not_a_member");
      assert.match(result.error.message, /Nido activo/i);
    }
  });

  it("returns the created id when the RPC succeeds", async () => {
    const result = await createExpenseWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "create_expense");
        assert.equal(args.p_household_id, "h1");
        assert.equal(args.p_payer_id, "u1");
        assert.equal(args.p_scope, "personal");
        return { data: "e-99", error: null };
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.id, "e-99");
  });
});

describe("canSubmitExpense", () => {
  it("blocks a second submit while the first is in flight", () => {
    assert.equal(canSubmitExpense(false), true);
    assert.equal(canSubmitExpense(true), false);
  });
});
