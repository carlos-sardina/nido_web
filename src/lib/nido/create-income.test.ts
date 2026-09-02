import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSubmitIncome, createIncomeWithAuth } from "./create-income.ts";

const validInput = {
  householdId: "h1",
  categoryId: "c1",
  amount: 40000,
  description: "Sueldo",
  occurredAt: "2026-08-21",
  activeMemberIds: ["u1"],
  allowedCategoryIds: ["c1"],
};

describe("createIncomeWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await createIncomeWithAuth(validInput, {
      getUserId: async () => null,
      rpc: async () => {
        called += 1;
        return { data: "i-1", error: null };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(called, 0);
  });

  it("does not call the RPC when validation fails", async () => {
    let called = 0;
    const result = await createIncomeWithAuth(
      { ...validInput, amount: 0 },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "i-1", error: null };
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
        return { data: "i-1", error: null };
      },
    };
    const nan = await createIncomeWithAuth({ ...validInput, amount: Number.NaN }, auth);
    const inf = await createIncomeWithAuth(
      { ...validInput, amount: Number.POSITIVE_INFINITY },
      auth,
    );
    assert.equal(nan.ok, false);
    assert.equal(inf.ok, false);
    assert.equal(called, 0);
  });

  it("maps a network failure without exposing the raw message", async () => {
    const result = await createIncomeWithAuth(validInput, {
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
    const result = await createIncomeWithAuth(validInput, {
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
    const result = await createIncomeWithAuth(
      { ...validInput, categoryId: "other" },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "i-1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_category");
    assert.equal(called, 0);
  });

  it("sends a null description when the field is blank", async () => {
    const result = await createIncomeWithAuth(
      { ...validInput, description: "  " },
      {
        getUserId: async () => "u1",
        rpc: async (_fn, args) => {
          assert.equal(args.p_description, null);
          return { data: "i-blank", error: null };
        },
      },
    );
    assert.equal(result.ok, true);
  });

  it("does not send created_by or member_id from the client", async () => {
    const result = await createIncomeWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "create_income");
        assert.equal(args.p_household_id, "h1");
        assert.equal("p_created_by" in args, false);
        assert.equal("p_member_id" in args, false);
        assert.equal("p_payer_id" in args, false);
        return { data: "i-99", error: null };
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.id, "i-99");
  });
});

describe("canSubmitIncome", () => {
  it("blocks a second submit while the first is in flight", () => {
    assert.equal(canSubmitIncome(false), true);
    assert.equal(canSubmitIncome(true), false);
  });
});
