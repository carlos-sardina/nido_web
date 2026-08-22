import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canSubmitContribution,
  createContributionWithAuth,
} from "./create-contribution.ts";

const validInput = {
  householdId: "h1",
  goalId: "g-carlos",
  amount: 500,
  contributedAt: "2026-08-21",
  activeMemberIds: ["u1", "u2"],
  allowedGoalIds: ["g-carlos", "g-diana"],
};

describe("createContributionWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await createContributionWithAuth(validInput, {
      getUserId: async () => null,
      rpc: async () => {
        called += 1;
        return { data: "c-1", error: null };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(called, 0);
  });

  it("does not call the RPC when the amount is invalid", async () => {
    let called = 0;
    const result = await createContributionWithAuth(
      { ...validInput, amount: 0 },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "c-1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_amount");
    assert.equal(called, 0);
  });

  it("does not call the RPC for a negative amount", async () => {
    let called = 0;
    const result = await createContributionWithAuth(
      { ...validInput, amount: -10 },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "c-1", error: null };
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
        return { data: "c-1", error: null };
      },
    };
    const nan = await createContributionWithAuth({ ...validInput, amount: Number.NaN }, auth);
    const inf = await createContributionWithAuth(
      { ...validInput, amount: Number.POSITIVE_INFINITY },
      auth,
    );
    assert.equal(nan.ok, false);
    assert.equal(inf.ok, false);
    assert.equal(called, 0);
  });

  it("does not call the RPC for an invalid date", async () => {
    let called = 0;
    const result = await createContributionWithAuth(
      { ...validInput, contributedAt: "2026-02-31" },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "c-1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_date");
    assert.equal(called, 0);
  });

  it("does not call the RPC for a missing goal", async () => {
    let called = 0;
    const result = await createContributionWithAuth(
      { ...validInput, goalId: "missing" },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "c-1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "goal_not_found");
    assert.equal(called, 0);
  });

  it("does not call the RPC for another household's goal", async () => {
    let called = 0;
    const result = await createContributionWithAuth(
      { ...validInput, goalId: "g-other" },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "c-1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "goal_not_found");
    assert.equal(called, 0);
  });

  it("does not call the RPC for an archived goal omitted from the active list", async () => {
    let called = 0;
    const result = await createContributionWithAuth(
      { ...validInput, goalId: "g-archived", allowedGoalIds: ["g-carlos"] },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "c-1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "goal_not_found");
    assert.equal(called, 0);
  });

  it("does not call the RPC for a historical member", async () => {
    let called = 0;
    const result = await createContributionWithAuth(
      { ...validInput, activeMemberIds: ["u2"] },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "c-1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "not_a_member");
    assert.equal(called, 0);
  });

  it("maps a network failure without exposing the raw message", async () => {
    const result = await createContributionWithAuth(validInput, {
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
    const result = await createContributionWithAuth(validInput, {
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

  it("maps an archived goal from the RPC", async () => {
    const result = await createContributionWithAuth(validInput, {
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

  it("maps another household as not found from the RPC", async () => {
    const result = await createContributionWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.goal_not_found", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "goal_not_found");
  });

  it("lets a member contribute to a goal created by someone else", async () => {
    const result = await createContributionWithAuth(
      { ...validInput, goalId: "g-diana" },
      {
        getUserId: async () => "u1",
        rpc: async (fn, args) => {
          assert.equal(fn, "create_goal_contribution");
          assert.equal(args.p_goal_id, "g-diana");
          assert.equal(args.p_amount, 500);
          assert.equal("p_member_id" in args, false);
          assert.equal("p_created_by" in args, false);
          assert.equal("p_household_id" in args, false);
          return { data: "c-other", error: null };
        },
      },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.id, "c-other");
  });

  it("allows a contribution that exceeds the goal target", async () => {
    const result = await createContributionWithAuth(
      { ...validInput, amount: 999999 },
      {
        getUserId: async () => "u1",
        rpc: async (fn, args) => {
          assert.equal(fn, "create_goal_contribution");
          assert.equal(args.p_amount, 999999);
          return { data: "c-over", error: null };
        },
      },
    );
    assert.equal(result.ok, true);
  });

  it("returns the created id when the RPC succeeds", async () => {
    const result = await createContributionWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "create_goal_contribution");
        assert.equal(args.p_goal_id, "g-carlos");
        assert.equal(args.p_amount, 500);
        assert.equal(args.p_contributed_at, "2026-08-21");
        return { data: "c-99", error: null };
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.id, "c-99");
  });
});

describe("canSubmitContribution", () => {
  it("blocks a second submit while the first is in flight", () => {
    assert.equal(canSubmitContribution(false), true);
    assert.equal(canSubmitContribution(true), false);
  });
});
