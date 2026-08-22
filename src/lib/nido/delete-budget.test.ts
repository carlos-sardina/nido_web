import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSubmitBudget } from "./create-budget.ts";
import { deleteBudgetWithAuth } from "./delete-budget.ts";

describe("deleteBudgetWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await deleteBudgetWithAuth("b1", {
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
    const result = await deleteBudgetWithAuth("", {
      getUserId: async () => "u1",
      rpc: async () => {
        called += 1;
        return { data: "b1", error: null };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "budget_not_found");
    assert.equal(called, 0);
  });

  it("maps not-creator as forbidden without raw codes", async () => {
    const result = await deleteBudgetWithAuth("b1", {
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

  it("maps an already-deleted budget", async () => {
    const result = await deleteBudgetWithAuth("b1", {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.budget_deleted", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "budget_deleted");
  });

  it("maps another household as not found", async () => {
    const result = await deleteBudgetWithAuth("other-uuid", {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.budget_not_found", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "budget_not_found");
  });

  it("returns the id when soft-delete succeeds", async () => {
    const result = await deleteBudgetWithAuth("b1", {
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "soft_delete_budget");
        assert.equal(args.p_budget_id, "b1");
        return { data: "b1", error: null };
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.id, "b1");
  });
});

describe("budget delete double submit", () => {
  it("blocks a second tap while the first is in flight", () => {
    assert.equal(canSubmitBudget(false), true);
    assert.equal(canSubmitBudget(true), false);
  });
});
