import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  completeJoinInvitationWithAuth,
  joinDisplayNameDecision,
  type JoinInvitationAuth,
} from "./join-invitation.ts";

const TOKEN = "aaaaaaaaaaaaaaaa";

const accepted = {
  householdId: "hh-1",
  householdName: "Casa Roma",
};

function auth(input: {
  userId?: string | null;
  email?: string | null;
  profileName?: string | null;
  profileError?: "network" | "unauthenticated";
  updateName?: (name: string) => NidoResult<{ id: string; display_name: string }>;
  accept?: (token: string) => NidoResult<{ householdId: string; householdName: string }>;
  onUpdate?: (name: string) => void;
  onAccept?: (token: string) => void;
}): JoinInvitationAuth {
  return {
    getUserId: async () => (input.userId === undefined ? "user-1" : input.userId),
    getUserEmail: async () =>
      input.email === undefined ? "nido.smoke.diana.924@nido.test" : input.email,
    getProfileDisplayName: async () => {
      if (input.profileError) return nidoFail(input.profileError);
      return nidoOk(input.profileName === undefined ? "nido.smoke.diana.924" : input.profileName);
    },
    updateDisplayName: async (name) => {
      input.onUpdate?.(name);
      return input.updateName
        ? input.updateName(name)
        : nidoOk({ id: "user-1", display_name: name });
    },
    acceptInvitation: async (token) => {
      input.onAccept?.(token);
      return input.accept ? input.accept(token) : nidoOk(accepted);
    },
  };
}

describe("joinDisplayNameDecision", () => {
  it("persists a valid entered name when the profile still has the email fallback", () => {
    assert.deepEqual(
      joinDisplayNameDecision({
        enteredName: "  Diana  ",
        currentDisplayName: "nido.smoke.diana.924",
        email: "nido.smoke.diana.924@nido.test",
      }),
      { kind: "persist", displayName: "Diana" },
    );
  });

  it("keeps accented names and rejects empty input", () => {
    assert.deepEqual(
      joinDisplayNameDecision({
        enteredName: "Sofía",
        currentDisplayName: "nido.test.user",
        email: "nido.test.user@nido.test",
      }),
      { kind: "persist", displayName: "Sofía" },
    );
    assert.equal(
      joinDisplayNameDecision({
        enteredName: "   ",
        currentDisplayName: "nido.test.user",
        email: "nido.test.user@nido.test",
      }).kind,
      "need_name",
    );
  });

  it("does not overwrite a valid chosen name", () => {
    assert.deepEqual(
      joinDisplayNameDecision({
        enteredName: "Sofía",
        currentDisplayName: "Carlos",
        email: "carlos@example.com",
      }),
      { kind: "skip" },
    );
    assert.deepEqual(
      joinDisplayNameDecision({
        enteredName: undefined,
        currentDisplayName: "Carlos",
        email: "carlos@example.com",
      }),
      { kind: "skip" },
    );
  });
});

describe("completeJoinInvitationWithAuth", () => {
  it("rejects an unauthenticated caller before name or accept", async () => {
    let updates = 0;
    let accepts = 0;
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN, enteredName: "Diana" },
      auth({
        userId: null,
        onUpdate: () => {
          updates += 1;
        },
        onAccept: () => {
          accepts += 1;
        },
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(updates, 0);
    assert.equal(accepts, 0);
  });

  it("rejects an invalid token before name or accept", async () => {
    let updates = 0;
    let accepts = 0;
    const result = await completeJoinInvitationWithAuth(
      { token: "bad", enteredName: "Diana" },
      auth({
        onUpdate: () => {
          updates += 1;
        },
        onAccept: () => {
          accepts += 1;
        },
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invitation_invalid");
    assert.equal(updates, 0);
    assert.equal(accepts, 0);
  });

  it("persists the entered name before a successful accept", async () => {
    const names: string[] = [];
    const tokens: string[] = [];
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN, enteredName: "  Diana  " },
      auth({
        onUpdate: (name) => names.push(name),
        onAccept: (token) => tokens.push(token),
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.householdId, "hh-1");
      assert.equal(result.data.persistedDisplayName, "Diana");
    }
    assert.deepEqual(names, ["Diana"]);
    assert.deepEqual(tokens, [TOKEN]);
  });

  it("does not accept when the fallback profile has no entered name", async () => {
    let accepts = 0;
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN },
      auth({
        onAccept: () => {
          accepts += 1;
        },
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_name");
    assert.equal(accepts, 0);
  });

  it("does not accept when updating the display name fails", async () => {
    let accepts = 0;
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN, enteredName: "Diana" },
      auth({
        updateName: () => nidoFail("network"),
        onAccept: () => {
          accepts += 1;
        },
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "network");
    assert.equal(accepts, 0);
  });

  it("skips the profile update when the current name is already valid", async () => {
    let updates = 0;
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN, enteredName: "Sofía" },
      auth({
        profileName: "Carlos",
        email: "carlos@example.com",
        onUpdate: () => {
          updates += 1;
        },
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.persistedDisplayName, null);
    assert.equal(updates, 0);
  });

  it("accepts once for an authenticated user with a valid name", async () => {
    let accepts = 0;
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN },
      auth({
        profileName: "Carlos",
        email: "carlos@example.com",
        onAccept: () => {
          accepts += 1;
        },
      }),
    );
    assert.equal(result.ok, true);
    assert.equal(accepts, 1);
  });

  it("returns already_in_nido from accept without a second membership call", async () => {
    let accepts = 0;
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN },
      auth({
        profileName: "Carlos",
        email: "carlos@example.com",
        accept: () => nidoFail("already_in_nido"),
        onAccept: () => {
          accepts += 1;
        },
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "already_in_nido");
    assert.equal(accepts, 1);
  });

  it("returns already_member from accept without collapsing it into already_in_nido", async () => {
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN },
      auth({
        profileName: "Carlos",
        email: "carlos@example.com",
        accept: () => nidoFail("already_member"),
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "already_member");
  });

  it("keeps invitation expired and accepted as distinct errors", async () => {
    const expired = await completeJoinInvitationWithAuth(
      { token: TOKEN },
      auth({
        profileName: "Carlos",
        email: "carlos@example.com",
        accept: () => nidoFail("invitation_expired"),
      }),
    );
    const used = await completeJoinInvitationWithAuth(
      { token: TOKEN },
      auth({
        profileName: "Carlos",
        email: "carlos@example.com",
        accept: () => nidoFail("invitation_accepted"),
      }),
    );
    assert.equal(expired.ok, false);
    if (expired.ok === false) assert.equal(expired.error.code, "invitation_expired");
    assert.equal(used.ok, false);
    if (used.ok === false) assert.equal(used.error.code, "invitation_accepted");
  });

  it("does not accept a second time after a successful join", async () => {
    let accepts = 0;
    const deps = auth({
      profileName: "Carlos",
      email: "carlos@example.com",
      onAccept: () => {
        accepts += 1;
      },
    });
    const first = await completeJoinInvitationWithAuth({ token: TOKEN }, deps);
    assert.equal(first.ok, true);
    assert.equal(accepts, 1);
  });
});
