import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updateGoalWithAuth } from "./update-goal.ts";

const validInput = {
  goalId: "g1",
  householdId: "h1",
  name: "Fondo de emergencia",
  amount: 200000,
  goalType: "saving" as const,
  targetDate: null,
  description: "",
  activeMemberIds: ["u1"],
};

describe("updateGoalWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await updateGoalWithAuth(validInput, {
      getUserId: async () => null,
      rpc: async () => {
        called += 1;
        return { data: "g1", error: null };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(called, 0);
  });

  it("does not call the RPC when the goal id is missing", async () => {
    let called = 0;
    const result = await updateGoalWithAuth(
      { ...validInput, goalId: "" },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "g1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "goal_not_found");
    assert.equal(called, 0);
  });

  it("does not call the RPC when validation fails", async () => {
    let called = 0;
    const result = await updateGoalWithAuth(
      { ...validInput, amount: 0 },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "g1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_amount");
    assert.equal(called, 0);
  });

  it("maps forbidden without exposing the raw message", async () => {
    const result = await updateGoalWithAuth(validInput, {
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

  it("maps a non-creator mutation as forbidden", async () => {
    const result = await updateGoalWithAuth(
      { ...validInput, activeMemberIds: ["u1", "u2"] },
      {
        getUserId: async () => "u1",
        rpc: async () => ({
          data: null,
          error: { message: "nido.forbidden", code: "P0001" },
        }),
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "forbidden");
  });

  it("maps another household as not found", async () => {
    const result = await updateGoalWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.goal_not_found", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "goal_not_found");
      assert.equal(result.error.message.includes("P0001"), false);
    }
  });

  it("maps an archived goal without exposing Postgres", async () => {
    const result = await updateGoalWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.goal_archived", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "goal_archived");
      assert.match(result.error.message, /archivada/i);
    }
  });

  it("sends fields to update_goal without a client household id", async () => {
    const result = await updateGoalWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "update_goal");
        assert.equal(args.p_goal_id, "g1");
        assert.equal(args.p_name, "Fondo de emergencia");
        assert.equal("p_household_id" in args, false);
        assert.equal("p_current_amount" in args, false);
        return { data: "g1", error: null };
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.id, "g1");
  });
});
