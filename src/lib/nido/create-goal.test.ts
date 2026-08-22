import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSubmitGoal, createGoalWithAuth } from "./create-goal.ts";

const validInput = {
  householdId: "h1",
  name: "Fondo de emergencia",
  amount: 200000,
  goalType: "saving" as const,
  targetDate: null,
  description: "",
  activeMemberIds: ["u1"],
};

describe("createGoalWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await createGoalWithAuth(validInput, {
      getUserId: async () => null,
      rpc: async () => {
        called += 1;
        return { data: "g-1", error: null };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(called, 0);
  });

  it("does not call the RPC when the amount is invalid", async () => {
    let called = 0;
    const result = await createGoalWithAuth(
      { ...validInput, amount: 0 },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "g-1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_amount");
    assert.equal(called, 0);
  });

  it("does not call the RPC when the name is empty", async () => {
    let called = 0;
    const result = await createGoalWithAuth(
      { ...validInput, name: "   " },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "g-1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "invalid_name");
      assert.match(result.error.message, /meta/i);
    }
    assert.equal(called, 0);
  });

  it("does not call the RPC for an invalid date", async () => {
    let called = 0;
    const result = await createGoalWithAuth(
      { ...validInput, targetDate: "2026-02-31" },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "g-1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_date");
    assert.equal(called, 0);
  });

  it("does not call the RPC for a historical member", async () => {
    let called = 0;
    const result = await createGoalWithAuth(
      { ...validInput, activeMemberIds: ["other"] },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "g-1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "not_a_member");
    assert.equal(called, 0);
  });

  it("maps a network failure without exposing the raw message", async () => {
    const result = await createGoalWithAuth(validInput, {
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
    const result = await createGoalWithAuth(validInput, {
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

  it("maps another household as not a member", async () => {
    const result = await createGoalWithAuth(
      { ...validInput, householdId: "other-nido" },
      {
        getUserId: async () => "u1",
        rpc: async () => ({
          data: null,
          error: { message: "nido.not_a_member", code: "P0001" },
        }),
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "not_a_member");
  });

  it("returns the created id when the RPC succeeds", async () => {
    const result = await createGoalWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "create_goal");
        assert.equal(args.p_household_id, "h1");
        assert.equal(args.p_name, "Fondo de emergencia");
        assert.equal(args.p_target_amount, 200000);
        assert.equal(args.p_goal_type, "saving");
        assert.equal(args.p_target_date, null);
        assert.equal(args.p_description, null);
        assert.equal("p_current_amount" in args, false);
        return { data: "g-99", error: null };
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.id, "g-99");
  });
});

describe("canSubmitGoal", () => {
  it("blocks a second submit while the first is in flight", () => {
    assert.equal(canSubmitGoal(false), true);
    assert.equal(canSubmitGoal(true), false);
  });
});
