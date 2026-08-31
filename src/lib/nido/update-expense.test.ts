import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updateExpenseWithAuth } from "./update-expense.ts";

const validInput = {
  expenseId: "e1",
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

describe("updateExpenseWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await updateExpenseWithAuth(validInput, {
      getUserId: async () => null,
      rpc: async () => {
        called += 1;
        return { data: "e1", error: null };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(called, 0);
  });

  it("does not call the RPC when the expense id is missing", async () => {
    let called = 0;
    const result = await updateExpenseWithAuth(
      { ...validInput, expenseId: "" },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "e1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "expense_not_found");
    assert.equal(called, 0);
  });

  it("does not call the RPC when validation fails", async () => {
    let called = 0;
    const result = await updateExpenseWithAuth(
      { ...validInput, amount: 0 },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "e1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_amount");
    assert.equal(called, 0);
  });

  it("maps forbidden without exposing the raw message", async () => {
    const result = await updateExpenseWithAuth(validInput, {
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

  it("maps a deleted expense without exposing Postgres", async () => {
    const result = await updateExpenseWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.expense_deleted", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "expense_deleted");
      assert.match(result.error.message, /eliminado/i);
    }
  });

  it("sends the rebuilt splits to update_expense", async () => {
    const result = await updateExpenseWithAuth(
      {
        ...validInput,
        scope: "shared",
        amount: 100,
        participantIds: ["u1", "u2"],
        activeMemberIds: ["u1", "u2"],
      },
      {
        getUserId: async () => "u1",
        rpc: async (fn, args) => {
          assert.equal(fn, "update_expense");
          assert.equal(args.p_expense_id, "e1");
          assert.equal(args.p_scope, "shared");
          assert.equal(args.p_payer_id, "u1");
          const splits = args.p_splits as Array<{ member_id: string; amount: number }>;
          assert.equal(splits.length, 2);
          assert.equal(splits.reduce((sum, split) => sum + Math.round(split.amount * 100), 0), 10000);
          return { data: "e1", error: null };
        },
      },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.id, "e1");
  });

  it("sends the selected payer on update", async () => {
    const result = await updateExpenseWithAuth(
      {
        ...validInput,
        scope: "shared",
        amount: 100,
        payerId: "u2",
        participantIds: ["u1", "u2"],
        activeMemberIds: ["u1", "u2"],
      },
      {
        getUserId: async () => "u1",
        rpc: async (_fn, args) => {
          assert.equal(args.p_payer_id, "u2");
          return { data: "e1", error: null };
        },
      },
    );
    assert.equal(result.ok, true);
  });
});
