import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSubmitExpense } from "./create-expense.ts";
import { deleteExpenseWithAuth } from "./delete-expense.ts";

describe("deleteExpenseWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await deleteExpenseWithAuth("e1", {
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
    const result = await deleteExpenseWithAuth("", {
      getUserId: async () => "u1",
      rpc: async () => {
        called += 1;
        return { data: "e1", error: null };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "expense_not_found");
    assert.equal(called, 0);
  });

  it("maps not-creator as forbidden without raw codes", async () => {
    const result = await deleteExpenseWithAuth("e1", {
      getUserId: async () => "u2",
      rpc: async () => ({
        data: null,
        error: { message: "nido.forbidden", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "forbidden");
      assert.equal(result.error.message.includes("P0001"), false);
    }
  });

  it("maps an already-deleted expense", async () => {
    const result = await deleteExpenseWithAuth("e1", {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.expense_deleted", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "expense_deleted");
  });

  it("maps another household as not found", async () => {
    const result = await deleteExpenseWithAuth("other-uuid", {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.expense_not_found", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "expense_not_found");
  });

  it("returns the id when soft-delete succeeds", async () => {
    const result = await deleteExpenseWithAuth("e1", {
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "soft_delete_expense");
        assert.equal(args.p_expense_id, "e1");
        return { data: "e1", error: null };
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.id, "e1");
  });
});

describe("delete double submit", () => {
  it("blocks a second tap while the first is in flight", () => {
    assert.equal(canSubmitExpense(false), true);
    assert.equal(canSubmitExpense(true), false);
  });
});
