import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSubmitRemove, removeMemberWithAuth } from "./remove-member.ts";
import { canRemoveMember, removableMembers } from "./rules.ts";

const owner = {
  targetUserId: "u2",
  actorRole: "owner" as const,
  isActiveMember: true,
  targetIsActiveSameHousehold: true,
  targetRole: "member" as const,
};

describe("canRemoveMember", () => {
  it("allows an active owner to remove another active member", () => {
    assert.equal(
      canRemoveMember({
        actorUserId: "u1",
        actorRole: "owner",
        isActiveMember: true,
        targetUserId: "u2",
        targetIsActiveSameHousehold: true,
        targetRole: "member",
      }),
      null,
    );
  });

  it("rejects an unauthenticated or inactive actor", () => {
    assert.equal(
      canRemoveMember({
        actorUserId: null,
        actorRole: "owner",
        isActiveMember: true,
        targetUserId: "u2",
        targetIsActiveSameHousehold: true,
        targetRole: "member",
      }),
      "not_a_member",
    );
    assert.equal(
      canRemoveMember({
        actorUserId: "u1",
        actorRole: "owner",
        isActiveMember: false,
        targetUserId: "u2",
        targetIsActiveSameHousehold: true,
        targetRole: "member",
      }),
      "not_a_member",
    );
  });

  it("rejects an active non-owner", () => {
    assert.equal(
      canRemoveMember({
        actorUserId: "u2",
        actorRole: "member",
        isActiveMember: true,
        targetUserId: "u3",
        targetIsActiveSameHousehold: true,
        targetRole: "member",
      }),
      "forbidden",
    );
  });

  it("rejects removing self", () => {
    assert.equal(
      canRemoveMember({
        actorUserId: "u1",
        actorRole: "owner",
        isActiveMember: true,
        targetUserId: "u1",
        targetIsActiveSameHousehold: true,
        targetRole: "owner",
      }),
      "cannot_remove_self",
    );
  });

  it("rejects a historical member, another Nido, or a missing target", () => {
    assert.equal(
      canRemoveMember({
        actorUserId: "u1",
        actorRole: "owner",
        isActiveMember: true,
        targetUserId: "u3",
        targetIsActiveSameHousehold: false,
        targetRole: "member",
      }),
      "invalid_remove_target",
    );
    assert.equal(
      canRemoveMember({
        actorUserId: "u1",
        actorRole: "owner",
        isActiveMember: true,
        targetUserId: "   ",
        targetIsActiveSameHousehold: true,
        targetRole: "member",
      }),
      "invalid_remove_target",
    );
    assert.equal(
      canRemoveMember({
        actorUserId: "u1",
        actorRole: "owner",
        isActiveMember: true,
        targetUserId: null,
        targetIsActiveSameHousehold: false,
        targetRole: null,
      }),
      "invalid_remove_target",
    );
  });

  it("rejects removing an owner", () => {
    assert.equal(
      canRemoveMember({
        actorUserId: "u1",
        actorRole: "owner",
        isActiveMember: true,
        targetUserId: "u2",
        targetIsActiveSameHousehold: true,
        targetRole: "owner",
      }),
      "invalid_remove_target",
    );
  });
});

describe("removableMembers", () => {
  const members = [
    { userId: "u1", role: "owner" as const },
    { userId: "u2", role: "member" as const },
  ];

  it("lists only other active members, not self or owners", () => {
    assert.deepEqual(removableMembers(members, "u1").map((row) => row.userId), ["u2"]);
    assert.deepEqual(removableMembers(members, "u2"), []);
  });
});

describe("removeMemberWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await removeMemberWithAuth(owner, {
      getUserId: async () => null,
      rpc: async () => {
        called += 1;
        return { data: null, error: null };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(called, 0);
  });

  it("does not call the RPC when the actor is not an owner", async () => {
    let called = 0;
    const result = await removeMemberWithAuth(
      { ...owner, actorRole: "member" },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: null, error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "forbidden");
    assert.equal(called, 0);
  });

  it("does not call the RPC when removing self", async () => {
    let called = 0;
    const result = await removeMemberWithAuth(
      { ...owner, targetUserId: "u1" },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: null, error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "cannot_remove_self");
    assert.equal(called, 0);
  });

  it("does not call the RPC for a historical or other-Nido target", async () => {
    let called = 0;
    const result = await removeMemberWithAuth(
      { ...owner, targetIsActiveSameHousehold: false },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: null, error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_remove_target");
    assert.equal(called, 0);
  });

  it("maps a network failure without exposing the raw message", async () => {
    const result = await removeMemberWithAuth(owner, {
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

  it("maps authorization and target errors from the RPC", async () => {
    const forbidden = await removeMemberWithAuth(owner, {
      getUserId: async () => "u1",
      rpc: async () => ({ data: null, error: { message: "nido.forbidden", code: "P0001" } }),
    });
    assert.equal(forbidden.ok, false);
    if (forbidden.ok === false) assert.equal(forbidden.error.code, "forbidden");

    const target = await removeMemberWithAuth(owner, {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.invalid_remove_target", code: "P0001" },
      }),
    });
    assert.equal(target.ok, false);
    if (target.ok === false) {
      assert.equal(target.error.code, "invalid_remove_target");
      assert.match(target.error.message, /miembro activo/i);
    }

    const self = await removeMemberWithAuth(owner, {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.cannot_remove_self", code: "P0001" },
      }),
    });
    assert.equal(self.ok, false);
    if (self.ok === false) {
      assert.equal(self.error.code, "cannot_remove_self");
      assert.match(self.error.message, /Salir del Nido/i);
    }
  });

  it("does not send household_id, owner_id, or user_id as authorization", async () => {
    const result = await removeMemberWithAuth(owner, {
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "remove_household_member");
        assert.equal(args.p_target_user_id, "u2");
        assert.equal("p_household_id" in args, false);
        assert.equal("p_owner_id" in args, false);
        assert.equal("p_user_id" in args, false);
        assert.equal("p_actor_id" in args, false);
        return { data: null, error: null };
      },
    });
    assert.equal(result.ok, true);
  });
});

describe("canSubmitRemove", () => {
  it("blocks a second submit while the first is in flight", () => {
    assert.equal(canSubmitRemove(false), true);
    assert.equal(canSubmitRemove(true), false);
  });
});
