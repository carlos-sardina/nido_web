import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSubmitGoal } from "./create-goal.ts";
import { archiveGoalWithAuth } from "./archive-goal.ts";

describe("archiveGoalWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await archiveGoalWithAuth("g1", {
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
    const result = await archiveGoalWithAuth("", {
      getUserId: async () => "u1",
      rpc: async () => {
        called += 1;
        return { data: "g1", error: null };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "goal_not_found");
    assert.equal(called, 0);
  });

  it("maps not-creator as forbidden without raw codes", async () => {
    const result = await archiveGoalWithAuth("g1", {
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

  it("maps an already-archived goal", async () => {
    const result = await archiveGoalWithAuth("g1", {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.goal_archived", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "goal_archived");
  });

  it("maps another household as not found", async () => {
    const result = await archiveGoalWithAuth("other-uuid", {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.goal_not_found", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "goal_not_found");
  });

  it("maps a historical member as not a member", async () => {
    const result = await archiveGoalWithAuth("g1", {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.not_a_member", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "not_a_member");
  });

  it("returns the id when archive succeeds", async () => {
    const result = await archiveGoalWithAuth("g1", {
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "archive_goal");
        assert.equal(args.p_goal_id, "g1");
        return { data: "g1", error: null };
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.id, "g1");
  });
});

describe("archive double submit", () => {
  it("blocks a second tap while the first is in flight", () => {
    assert.equal(canSubmitGoal(false), true);
    assert.equal(canSubmitGoal(true), false);
  });
});
