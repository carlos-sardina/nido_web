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

  it("does not call the RPC for an invalid category", async () => {
    let called = 0;
    const result = await createExpenseWithAuth(
      { ...validInput, categoryId: "other" },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "e-1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_category");
    assert.equal(called, 0);
  });

  it("does not call the RPC for an inactive participant", async () => {
    let called = 0;
    const result = await createExpenseWithAuth(
      {
        ...validInput,
        scope: "shared",
        participantIds: ["u1", "luis"],
      },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "e-1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_split");
    assert.equal(called, 0);
  });

  it("does not send a split method; the backend owns the household preference", async () => {
    const result = await createExpenseWithAuth(
      {
        ...validInput,
        scope: "shared",
        amount: 100,
        participantIds: ["u1", "u2"],
        activeMemberIds: ["u1", "u2"],
      },
      {
        getUserId: async () => "u1",
        rpc: async (_fn, args) => {
          assert.equal("p_distribution_method" in args, false);
          assert.equal("p_method" in args, false);
          return { data: "e-pref", error: null };
        },
      },
    );
    assert.equal(result.ok, true);
  });

  it("sends equal splits for a valid shared expense", async () => {
    const result = await createExpenseWithAuth(
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
          assert.equal(fn, "create_expense");
          const splits = args.p_splits as Array<{ member_id: string; amount: number }>;
          assert.equal(splits.length, 2);
          assert.equal(splits.reduce((sum, split) => sum + Math.round(split.amount * 100), 0), 10000);
          return { data: "e-shared", error: null };
        },
      },
    );
    assert.equal(result.ok, true);
  });

  it("sends a null description when the field is blank", async () => {
    const result = await createExpenseWithAuth(
      { ...validInput, description: "  " },
      {
        getUserId: async () => "u1",
        rpc: async (_fn, args) => {
          assert.equal(args.p_description, null);
          return { data: "e-blank", error: null };
        },
      },
    );
    assert.equal(result.ok, true);
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

  it("sends another active member as payer when the form selects them", async () => {
    const result = await createExpenseWithAuth(
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
          return { data: "e-payer", error: null };
        },
      },
    );
    assert.equal(result.ok, true);
  });

  it("sends a null payer when every member paid their share", async () => {
    const result = await createExpenseWithAuth(
      {
        ...validInput,
        scope: "shared",
        amount: 100,
        payerId: "all",
        participantIds: ["u1", "u2"],
        activeMemberIds: ["u1", "u2"],
      },
      {
        getUserId: async () => "u1",
        rpc: async (_fn, args) => {
          assert.equal(args.p_payer_id, null);
          assert.equal(args.p_scope, "shared");
          return { data: "e-all", error: null };
        },
      },
    );
    assert.equal(result.ok, true);
  });
});

describe("canSubmitExpense", () => {
  it("blocks a second submit while the first is in flight", () => {
    assert.equal(canSubmitExpense(false), true);
    assert.equal(canSubmitExpense(true), false);
  });
});
