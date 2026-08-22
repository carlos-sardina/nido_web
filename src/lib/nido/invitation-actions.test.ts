import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canSubmitInvitationAction,
  cancelInvitationWithAuth,
  formatInvitationDay,
  listInvitationsWithAuth,
  listStatusFromClassification,
  type InvitationListRow,
} from "./invitation-actions.ts";
import { classifyInvitation } from "./rules.ts";

const now = new Date("2026-08-22T18:00:00.000Z");

const pendingRow: InvitationListRow = {
  id: "inv-pending",
  email: "alex@example.com",
  expires_at: "2026-08-29T18:00:00.000Z",
  accepted_at: null,
  created_at: "2026-08-22T12:00:00.000Z",
  token: "owner-only-token-value",
};

function listAuth(input: {
  userId?: string | null;
  householdId?: string | null;
  rows?: InvitationListRow[] | null;
  error?: unknown;
  onSelect?: (householdId: string) => void;
}) {
  return {
    getUserId: async () => (input.userId === undefined ? "owner-1" : input.userId),
    getActiveHouseholdId: async () =>
      input.householdId === undefined ? "hh-1" : input.householdId,
    selectInvitations: async (householdId: string) => {
      input.onSelect?.(householdId);
      return { data: input.rows === undefined ? [pendingRow] : input.rows, error: input.error ?? null };
    },
  };
}

describe("listInvitationsWithAuth", () => {
  it("lets the owner read invitations from the session household", async () => {
    const seen: string[] = [];
    const result = await listInvitationsWithAuth(
      listAuth({ onSelect: (householdId) => seen.push(householdId) }),
      now,
    );
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0]?.id, "inv-pending");
    assert.deepEqual(seen, ["hh-1"]);
  });

  it("returns an empty list when there are no invitations", async () => {
    const result = await listInvitationsWithAuth(listAuth({ rows: [] }), now);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.data, []);
  });

  it("returns an empty list when the session has no active household", async () => {
    let selected = 0;
    const result = await listInvitationsWithAuth(
      listAuth({
        householdId: null,
        onSelect: () => {
          selected += 1;
        },
      }),
      now,
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.data, []);
    assert.equal(selected, 0);
  });

  it("preserves accepted_at, expires_at, and a null email", async () => {
    const accepted: InvitationListRow = {
      id: "inv-accepted",
      email: null,
      expires_at: "2026-08-30T00:00:00.000Z",
      accepted_at: "2026-08-21T15:00:00.000Z",
      created_at: "2026-08-20T12:00:00.000Z",
      token: "accepted-token",
    };
    const result = await listInvitationsWithAuth(listAuth({ rows: [accepted] }), now);
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.data[0]?.acceptedAt, "2026-08-21T15:00:00.000Z");
    assert.equal(result.data[0]?.expiresAt, "2026-08-30T00:00:00.000Z");
    assert.equal(result.data[0]?.email, null);
    assert.equal(result.data[0]?.status, "accepted");
  });

  it("does not take a client-supplied household_id as authorization", async () => {
    const result = await listInvitationsWithAuth(listAuth({ householdId: "hh-from-membership" }), now);
    assert.equal(result.ok, true);
    assert.equal(listInvitationsWithAuth.length, 1);
    if (result.ok) assert.equal(result.data[0]?.id, "inv-pending");
  });

  it("maps a network failure without exposing the raw message", async () => {
    const result = await listInvitationsWithAuth(
      listAuth({ error: { message: "fetch failed", code: "PGRST301" } }),
      now,
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "network");
      assert.equal(result.error.message.includes("PGRST"), false);
    }
  });

  it("does not list when the session is missing", async () => {
    let selected = 0;
    const result = await listInvitationsWithAuth(
      listAuth({
        userId: null,
        onSelect: () => {
          selected += 1;
        },
      }),
      now,
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(selected, 0);
  });
});

describe("list classification uses classifyInvitation", () => {
  it("maps valid -> pending, accepted -> accepted, expired -> expired", () => {
    const valid = classifyInvitation({
      found: true,
      acceptedAt: null,
      expiresAt: "2026-08-29T00:00:00.000Z",
      now,
    });
    const accepted = classifyInvitation({
      found: true,
      acceptedAt: "2026-08-21T00:00:00.000Z",
      expiresAt: "2026-08-29T00:00:00.000Z",
      now,
    });
    const expired = classifyInvitation({
      found: true,
      acceptedAt: null,
      expiresAt: "2026-08-21T00:00:00.000Z",
      now,
    });
    assert.equal(valid, "valid");
    assert.equal(accepted, "accepted");
    assert.equal(expired, "expired");
    assert.equal(listStatusFromClassification(valid), "pending");
    assert.equal(listStatusFromClassification(accepted), "accepted");
    assert.equal(listStatusFromClassification(expired), "expired");
    assert.equal(listStatusFromClassification("invalid"), null);
  });

  it("classifies listed rows through classifyInvitation", async () => {
    const rows: InvitationListRow[] = [
      pendingRow,
      {
        ...pendingRow,
        id: "inv-accepted",
        accepted_at: "2026-08-21T00:00:00.000Z",
      },
      {
        ...pendingRow,
        id: "inv-expired",
        expires_at: "2026-08-20T00:00:00.000Z",
      },
    ];
    const result = await listInvitationsWithAuth(listAuth({ rows }), now);
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.deepEqual(
      result.data.map((row) => row.status),
      ["pending", "accepted", "expired"],
    );
  });
});

describe("cancelInvitationWithAuth", () => {
  it("lets the owner request a delete by invitation id only", async () => {
    const ids: string[] = [];
    const result = await cancelInvitationWithAuth("inv-pending", {
      getUserId: async () => "owner-1",
      deleteInvitation: async (invitationId) => {
        ids.push(invitationId);
        return { data: [{ id: invitationId }], error: null };
      },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(ids, ["inv-pending"]);
    assert.equal(cancelInvitationWithAuth.length, 2);
  });

  it("does not treat a missing id as silent success", async () => {
    let called = 0;
    const missing = await cancelInvitationWithAuth("inv-gone", {
      getUserId: async () => "owner-1",
      deleteInvitation: async () => {
        called += 1;
        return { data: [], error: null };
      },
    });
    assert.equal(missing.ok, false);
    if (missing.ok === false) assert.equal(missing.error.code, "invitation_invalid");
    assert.equal(called, 1);

    const empty = await cancelInvitationWithAuth("   ", {
      getUserId: async () => "owner-1",
      deleteInvitation: async () => {
        called += 1;
        return { data: [{ id: "x" }], error: null };
      },
    });
    assert.equal(empty.ok, false);
    if (empty.ok === false) assert.equal(empty.error.code, "invitation_invalid");
    assert.equal(called, 1);
  });

  it("does not accept household_id as authorization", async () => {
    const keys: string[] = [];
    const result = await cancelInvitationWithAuth("inv-pending", {
      getUserId: async () => "owner-1",
      deleteInvitation: async (invitationId, extra?: { householdId?: string }) => {
        keys.push(...Object.keys({ invitationId, ...extra }));
        assert.equal(invitationId, "inv-pending");
        assert.equal(extra, undefined);
        return { data: [{ id: invitationId }], error: null };
      },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(keys, ["invitationId"]);
  });

  it("maps RLS denial without treating it as success", async () => {
    const result = await cancelInvitationWithAuth("inv-pending", {
      getUserId: async () => "member-1",
      deleteInvitation: async () => ({
        data: null,
        error: { message: "new row violates row-level security policy", code: "42501" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "forbidden");
  });
});

describe("canSubmitInvitationAction", () => {
  it("blocks a second submit while the first is in flight", () => {
    assert.equal(canSubmitInvitationAction(false), true);
    assert.equal(canSubmitInvitationAction(true), false);
  });
});

describe("formatInvitationDay", () => {
  it("formats an expiry timestamp in the Nido timezone", () => {
    const label = formatInvitationDay("2026-08-29T18:00:00.000Z");
    assert.match(label, /29/);
    assert.match(label, /agosto/i);
  });
});
