import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSubmitContribution } from "./create-contribution.ts";
import { updateContributionWithAuth } from "./update-contribution.ts";

const validInput = {
  contributionId: "c1",
  householdId: "h1",
  goalId: "g-carlos",
  amount: 600,
  contributedAt: "2026-08-21",
  activeMemberIds: ["u1", "u2"],
  allowedGoalIds: ["g-carlos", "g-diana"],
};

describe("updateContributionWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await updateContributionWithAuth(validInput, {
      getUserId: async () => null,
      rpc: async () => {
        called += 1;
        return { data: "c1", error: null };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(called, 0);
  });

  it("does not call the RPC when the contribution id is missing", async () => {
    let called = 0;
    const result = await updateContributionWithAuth(
      { ...validInput, contributionId: "" },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "c1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "contribution_not_found");
    assert.equal(called, 0);
  });

  it("does not call the RPC when the amount is invalid", async () => {
    let called = 0;
    const result = await updateContributionWithAuth(
      { ...validInput, amount: 0 },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "c1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_amount");
    assert.equal(called, 0);
  });

  it("does not call the RPC for an invalid date", async () => {
    let called = 0;
    const result = await updateContributionWithAuth(
      { ...validInput, contributedAt: "2026-02-31" },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "c1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_date");
    assert.equal(called, 0);
  });

  it("maps forbidden without exposing the raw message", async () => {
    const result = await updateContributionWithAuth(validInput, {
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

  it("maps a deleted contribution without exposing Postgres", async () => {
    const result = await updateContributionWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.contribution_deleted", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "contribution_deleted");
      assert.match(result.error.message, /eliminada/i);
    }
  });

  it("maps an archived goal from the RPC", async () => {
    const result = await updateContributionWithAuth(validInput, {
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

  it("maps another household as not found", async () => {
    const result = await updateContributionWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.contribution_not_found", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "contribution_not_found");
  });

  it("maps a historical member as not a member", async () => {
    const result = await updateContributionWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.not_a_member", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "not_a_member");
  });

  it("maps a network failure without exposing the raw message", async () => {
    const result = await updateContributionWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async () => ({ data: null, error: { message: "fetch failed", code: "PGRST301" } }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "network");
      assert.equal(result.error.message.includes("PGRST"), false);
    }
  });

  it("does not send household_id, member_id, created_by, or goal_id to the RPC", async () => {
    const result = await updateContributionWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "update_goal_contribution");
        assert.equal(args.p_contribution_id, "c1");
        assert.equal(args.p_amount, 600);
        assert.equal(args.p_contributed_at, "2026-08-21");
        assert.equal("p_household_id" in args, false);
        assert.equal("p_member_id" in args, false);
        assert.equal("p_created_by" in args, false);
        assert.equal("p_goal_id" in args, false);
        return { data: "c1", error: null };
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.id, "c1");
  });
});

describe("update contribution double submit", () => {
  it("blocks a second tap while the first is in flight", () => {
    assert.equal(canSubmitContribution(false), true);
    assert.equal(canSubmitContribution(true), false);
  });
});
