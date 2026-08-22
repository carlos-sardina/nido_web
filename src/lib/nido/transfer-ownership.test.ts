import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSubmitTransfer, transferOwnershipWithAuth } from "./transfer-ownership.ts";
import {
  applyOwnershipTransfer,
  canLeaveHousehold,
  canTransferOwnership,
  transferableMembers,
} from "./rules.ts";

const owner = {
  newOwnerId: "u2",
  actorRole: "owner" as const,
  isActiveMember: true,
  targetIsActiveSameHousehold: true,
  targetRole: "member" as const,
};

describe("canTransferOwnership", () => {
  it("allows an active owner to transfer to another active member", () => {
    assert.equal(
      canTransferOwnership({
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
      canTransferOwnership({
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
      canTransferOwnership({
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
      canTransferOwnership({
        actorUserId: "u2",
        actorRole: "member",
        isActiveMember: true,
        targetUserId: "u1",
        targetIsActiveSameHousehold: true,
        targetRole: "owner",
      }),
      "forbidden",
    );
  });

  it("rejects transferring to self", () => {
    assert.equal(
      canTransferOwnership({
        actorUserId: "u1",
        actorRole: "owner",
        isActiveMember: true,
        targetUserId: "u1",
        targetIsActiveSameHousehold: true,
        targetRole: "owner",
      }),
      "cannot_transfer_to_self",
    );
  });

  it("rejects a historical member, another Nido, or a missing target", () => {
    assert.equal(
      canTransferOwnership({
        actorUserId: "u1",
        actorRole: "owner",
        isActiveMember: true,
        targetUserId: "u3",
        targetIsActiveSameHousehold: false,
        targetRole: "member",
      }),
      "invalid_transfer_target",
    );
    assert.equal(
      canTransferOwnership({
        actorUserId: "u1",
        actorRole: "owner",
        isActiveMember: true,
        targetUserId: "   ",
        targetIsActiveSameHousehold: true,
        targetRole: "member",
      }),
      "invalid_transfer_target",
    );
    assert.equal(
      canTransferOwnership({
        actorUserId: "u1",
        actorRole: "owner",
        isActiveMember: true,
        targetUserId: null,
        targetIsActiveSameHousehold: false,
        targetRole: null,
      }),
      "invalid_transfer_target",
    );
  });

  it("rejects transferring to someone who is already an owner", () => {
    assert.equal(
      canTransferOwnership({
        actorUserId: "u1",
        actorRole: "owner",
        isActiveMember: true,
        targetUserId: "u2",
        targetIsActiveSameHousehold: true,
        targetRole: "owner",
      }),
      "invalid_transfer_target",
    );
  });
});

describe("membership states for transfer and leave", () => {
  const members = [
    { userId: "u1", role: "owner" as const },
    { userId: "u2", role: "member" as const },
  ];

  it("lists only other active members as transfer targets", () => {
    const targets = transferableMembers(members, "u1");
    assert.deepEqual(targets.map((row) => row.userId), ["u2"]);
    assert.deepEqual(transferableMembers(members, "u2"), []);
  });

  it("applies a single-owner transition without dropping members", () => {
    const next = applyOwnershipTransfer(members, "u1", "u2");
    assert.equal(next.find((row) => row.userId === "u1")?.role, "member");
    assert.equal(next.find((row) => row.userId === "u2")?.role, "owner");
    assert.equal(next.length, 2);
  });

  it("after transfer, the former owner cannot transfer and can leave", () => {
    const next = applyOwnershipTransfer(members, "u1", "u2");
    const former = next.find((row) => row.userId === "u1");
    const ownerCount = next.filter((row) => row.role === "owner").length;
    assert.equal(
      canTransferOwnership({
        actorUserId: "u1",
        actorRole: former?.role ?? null,
        isActiveMember: true,
        targetUserId: "u2",
        targetIsActiveSameHousehold: true,
        targetRole: "owner",
      }),
      "forbidden",
    );
    assert.equal(
      canLeaveHousehold({
        isActiveMember: true,
        role: former?.role ?? null,
        activeOwnerCount: ownerCount,
      }),
      null,
    );
  });

  it("after transfer, the new owner can transfer and cannot leave as last owner", () => {
    const next = applyOwnershipTransfer(members, "u1", "u2");
    const owner = next.find((row) => row.userId === "u2");
    assert.equal(
      canTransferOwnership({
        actorUserId: "u2",
        actorRole: owner?.role ?? null,
        isActiveMember: true,
        targetUserId: "u1",
        targetIsActiveSameHousehold: true,
        targetRole: "member",
      }),
      null,
    );
    assert.equal(
      canLeaveHousehold({
        isActiveMember: true,
        role: owner?.role ?? null,
        activeOwnerCount: 1,
      }),
      "last_owner",
    );
  });
});

describe("transferOwnershipWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await transferOwnershipWithAuth(owner, {
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
    const result = await transferOwnershipWithAuth(
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

  it("does not call the RPC when transferring to self", async () => {
    let called = 0;
    const result = await transferOwnershipWithAuth(
      { ...owner, newOwnerId: "u1" },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: null, error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "cannot_transfer_to_self");
    assert.equal(called, 0);
  });

  it("does not call the RPC for a historical or other-Nido target", async () => {
    let called = 0;
    const result = await transferOwnershipWithAuth(
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
    if (result.ok === false) assert.equal(result.error.code, "invalid_transfer_target");
    assert.equal(called, 0);
  });

  it("maps a network failure without exposing the raw message", async () => {
    const result = await transferOwnershipWithAuth(owner, {
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
    const forbidden = await transferOwnershipWithAuth(owner, {
      getUserId: async () => "u1",
      rpc: async () => ({ data: null, error: { message: "nido.forbidden", code: "P0001" } }),
    });
    assert.equal(forbidden.ok, false);
    if (forbidden.ok === false) assert.equal(forbidden.error.code, "forbidden");

    const target = await transferOwnershipWithAuth(owner, {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.invalid_transfer_target", code: "P0001" },
      }),
    });
    assert.equal(target.ok, false);
    if (target.ok === false) {
      assert.equal(target.error.code, "invalid_transfer_target");
      assert.match(target.error.message, /miembro activo/i);
    }
  });

  it("does not send household_id, owner_id, or user_id as authorization", async () => {
    const result = await transferOwnershipWithAuth(owner, {
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "transfer_household_ownership");
        assert.equal(args.p_new_owner_id, "u2");
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

describe("canSubmitTransfer", () => {
  it("blocks a second submit while the first is in flight", () => {
    assert.equal(canSubmitTransfer(false), true);
    assert.equal(canSubmitTransfer(true), false);
  });
});
