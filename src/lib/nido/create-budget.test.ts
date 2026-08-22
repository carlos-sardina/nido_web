import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSubmitBudget, createBudgetWithAuth } from "./create-budget.ts";

const validInput = {
  householdId: "h1",
  categoryId: "c1",
  amount: 8000,
  startDate: "2026-08-01",
  activeMemberIds: ["u1"],
  allowedCategoryIds: ["c1"],
};

describe("createBudgetWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await createBudgetWithAuth(validInput, {
      getUserId: async () => null,
      rpc: async () => {
        called += 1;
        return { data: "b-1", error: null };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(called, 0);
  });

  it("does not call the RPC when validation fails", async () => {
    let called = 0;
    const result = await createBudgetWithAuth(
      { ...validInput, amount: 0 },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "b-1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_amount");
    assert.equal(called, 0);
  });

  it("does not call the RPC for NaN or Infinity", async () => {
    let called = 0;
    const auth = {
      getUserId: async () => "u1",
      rpc: async () => {
        called += 1;
        return { data: "b-1", error: null };
      },
    };
    const nan = await createBudgetWithAuth({ ...validInput, amount: Number.NaN }, auth);
    const inf = await createBudgetWithAuth(
      { ...validInput, amount: Number.POSITIVE_INFINITY },
      auth,
    );
    assert.equal(nan.ok, false);
    assert.equal(inf.ok, false);
    assert.equal(called, 0);
  });

  it("maps a network failure without exposing the raw message", async () => {
    const result = await createBudgetWithAuth(validInput, {
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
    const result = await createBudgetWithAuth(validInput, {
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

  it("does not call the RPC for an invalid category", async () => {
    let called = 0;
    const result = await createBudgetWithAuth(
      { ...validInput, categoryId: "other" },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "b-1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_category");
    assert.equal(called, 0);
  });

  it("does not send created_by, member_id, or household identity as authorization", async () => {
    const result = await createBudgetWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "create_budget");
        assert.equal(args.p_household_id, "h1");
        assert.equal(args.p_start_date, "2026-08-01");
        assert.equal(args.p_end_date, "2026-08-31");
        assert.equal(args.p_personal, false);
        assert.equal("p_created_by" in args, false);
        assert.equal("p_member_id" in args, false);
        assert.equal("p_user_id" in args, false);
        return { data: "b-99", error: null };
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.id, "b-99");
  });

  it("asks the RPC for a personal budget without sending member_id", async () => {
    const result = await createBudgetWithAuth(
      { ...validInput, personal: true },
      {
        getUserId: async () => "u1",
        rpc: async (fn, args) => {
          assert.equal(fn, "create_budget");
          assert.equal(args.p_personal, true);
          assert.equal("p_member_id" in args, false);
          return { data: "b-personal", error: null };
        },
      },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.id, "b-personal");
  });
});

describe("canSubmitBudget", () => {
  it("blocks a second submit while the first is in flight", () => {
    assert.equal(canSubmitBudget(false), true);
    assert.equal(canSubmitBudget(true), false);
  });
});
