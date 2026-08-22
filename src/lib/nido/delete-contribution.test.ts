import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSubmitContribution } from "./create-contribution.ts";
import { deleteContributionWithAuth } from "./delete-contribution.ts";

describe("deleteContributionWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await deleteContributionWithAuth("c1", {
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
    const result = await deleteContributionWithAuth("", {
      getUserId: async () => "u1",
      rpc: async () => {
        called += 1;
        return { data: "c1", error: null };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "contribution_not_found");
    assert.equal(called, 0);
  });

  it("maps not-creator as forbidden without raw codes", async () => {
    const result = await deleteContributionWithAuth("c1", {
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

  it("maps an already-deleted contribution", async () => {
    const result = await deleteContributionWithAuth("c1", {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.contribution_deleted", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "contribution_deleted");
  });

  it("maps an archived goal", async () => {
    const result = await deleteContributionWithAuth("c1", {
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
    const result = await deleteContributionWithAuth("other-uuid", {
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
    const result = await deleteContributionWithAuth("c1", {
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
    const result = await deleteContributionWithAuth("c1", {
      getUserId: async () => "u1",
      rpc: async () => ({ data: null, error: { message: "fetch failed", code: "PGRST301" } }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "network");
      assert.equal(result.error.message.includes("PGRST"), false);
    }
  });

  it("returns the id when soft-delete succeeds", async () => {
    const result = await deleteContributionWithAuth("c1", {
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "soft_delete_goal_contribution");
        assert.equal(args.p_contribution_id, "c1");
        return { data: "c1", error: null };
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.id, "c1");
  });
});

describe("delete contribution double submit", () => {
  it("blocks a second tap while the first is in flight", () => {
    assert.equal(canSubmitContribution(false), true);
    assert.equal(canSubmitContribution(true), false);
  });
});
