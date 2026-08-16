import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAppEntry } from "./destination.ts";
import {
  clearPendingInvitationToken,
  peekPendingInvitationToken,
  savePendingInvitationToken,
  takePendingInvitationToken,
} from "./pending-flow.ts";

const memory = new Map<string, string>();

function installSessionStorage() {
  const storage: Storage = {
    get length() {
      return memory.size;
    },
    clear() {
      memory.clear();
    },
    getItem(key) {
      return memory.get(key) ?? null;
    },
    key(index) {
      return [...memory.keys()][index] ?? null;
    },
    removeItem(key) {
      memory.delete(key);
    },
    setItem(key, value) {
      memory.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: storage,
  });
}

describe("pending invitation token", () => {
  it("survives authentication so /join/<token> can resume", () => {
    installSessionStorage();
    memory.clear();
    savePendingInvitationToken("invite-token-value-1");

    assert.equal(peekPendingInvitationToken(), "invite-token-value-1");
    assert.deepEqual(
      resolveAppEntry({
        authenticated: true,
        membershipStatus: "no_nido",
        pendingInviteToken: peekPendingInvitationToken(),
      }),
      { kind: "join_invite", token: "invite-token-value-1" },
    );

    assert.equal(takePendingInvitationToken(), "invite-token-value-1");
    assert.equal(peekPendingInvitationToken(), null);
    clearPendingInvitationToken();
  });

  it("does not remember a create vs join choice after authentication", () => {
    installSessionStorage();
    memory.clear();
    sessionStorage.setItem("nido.pendingOnboardingFlow", "create");

    assert.deepEqual(
      resolveAppEntry({
        authenticated: true,
        membershipStatus: "no_nido",
        pendingInviteToken: peekPendingInvitationToken(),
      }),
      { kind: "nido_selection" },
    );
  });
});
