import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSubmitLeave, leaveHouseholdWithAuth } from "./leave-household.ts";
import { canLeaveHousehold } from "./rules.ts";

const memberLeave = {
  isActiveMember: true,
  role: "member" as const,
  activeOwnerCount: 1,
};

describe("leaveHouseholdWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await leaveHouseholdWithAuth(memberLeave, {
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

  it("does not call the RPC when there is no active membership", async () => {
    let called = 0;
    const result = await leaveHouseholdWithAuth(
      { isActiveMember: false, role: null, activeOwnerCount: 0 },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: null, error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "not_a_member");
    assert.equal(called, 0);
  });

  it("does not call the RPC when the actor is the last owner", async () => {
    let called = 0;
    const result = await leaveHouseholdWithAuth(
      { isActiveMember: true, role: "owner", activeOwnerCount: 1 },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: null, error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "last_owner");
      assert.match(result.error.message, /transfiere la propiedad/i);
    }
    assert.equal(called, 0);
  });

  it("maps last_owner from the RPC without exposing Postgres", async () => {
    const result = await leaveHouseholdWithAuth(memberLeave, {
      getUserId: async () => "u2",
      rpc: async () => ({ data: null, error: { message: "nido.last_owner", code: "P0001" } }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "last_owner");
      assert.equal(result.error.message.includes("P0001"), false);
    }
  });

  it("maps a network failure without exposing the raw message", async () => {
    const result = await leaveHouseholdWithAuth(memberLeave, {
      getUserId: async () => "u2",
      rpc: async () => ({ data: null, error: { message: "fetch failed", code: "PGRST301" } }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "network");
      assert.equal(result.error.message.includes("PGRST"), false);
      assert.match(result.error.message, /Inténtalo de nuevo/i);
    }
  });

  it("does not send household_id or user_id to the RPC", async () => {
    const result = await leaveHouseholdWithAuth(memberLeave, {
      getUserId: async () => "u2",
      rpc: async (fn, args) => {
        assert.equal(fn, "leave_household");
        assert.equal(args && "p_household_id" in args, false);
        assert.equal(args && "p_user_id" in args, false);
        return { data: null, error: null };
      },
    });
    assert.equal(result.ok, true);
  });

  it("allows a member to leave while an owner remains", async () => {
    assert.equal(canLeaveHousehold(memberLeave), null);
    const result = await leaveHouseholdWithAuth(memberLeave, {
      getUserId: async () => "u2",
      rpc: async () => ({ data: null, error: null }),
    });
    assert.equal(result.ok, true);
  });

  it("allows a former owner to leave after transferring", async () => {
    const formerOwner = {
      isActiveMember: true,
      role: "member" as const,
      activeOwnerCount: 1,
    };
    assert.equal(canLeaveHousehold(formerOwner), null);
    const result = await leaveHouseholdWithAuth(formerOwner, {
      getUserId: async () => "u1",
      rpc: async () => ({ data: null, error: null }),
    });
    assert.equal(result.ok, true);
  });
});

describe("canSubmitLeave", () => {
  it("blocks a second submit while the first is in flight", () => {
    assert.equal(canSubmitLeave(false), true);
    assert.equal(canSubmitLeave(true), false);
  });
});
