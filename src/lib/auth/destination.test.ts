import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAppEntry } from "./destination.ts";

describe("resolveAppEntry", () => {
  it("sends an unauthenticated user to landing", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: false,
        membershipStatus: "unauthenticated",
        pendingFlow: "create",
        pendingInviteToken: null,
      }),
      { kind: "landing" },
    );
  });

  it("sends an authenticated user with no Nido to create-Nido onboarding", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: true,
        membershipStatus: "no_nido",
        pendingFlow: null,
        pendingInviteToken: null,
      }),
      { kind: "create_nido" },
    );
  });

  it("sends an authenticated user with an active Nido to MainApp", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: true,
        membershipStatus: "active",
        pendingFlow: "create",
        pendingInviteToken: "aaaaaaaaaaaaaaaa",
      }),
      { kind: "main_app" },
    );
  });

  it("treats historical-only membership as no active Nido", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: true,
        membershipStatus: "historical_only",
        pendingFlow: null,
        pendingInviteToken: null,
      }),
      { kind: "create_nido" },
    );
  });

  it("keeps a pending create flow on create-Nido after email confirmation", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: true,
        membershipStatus: "no_nido",
        pendingFlow: "create",
        pendingInviteToken: null,
      }),
      { kind: "create_nido" },
    );
  });

  it("returns a pending join invitation to /join/<token>", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: true,
        membershipStatus: "no_nido",
        pendingFlow: "create",
        pendingInviteToken: "invite-token-value-1",
      }),
      { kind: "join_invite", token: "invite-token-value-1" },
    );
  });

  it("does not send a pending join flow to create-Nido", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: true,
        membershipStatus: "historical_only",
        pendingFlow: "join",
        pendingInviteToken: null,
      }),
      { kind: "join_code" },
    );
  });

  it("returns to landing after logout (unauthenticated)", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: false,
        membershipStatus: "unauthenticated",
        pendingFlow: null,
        pendingInviteToken: null,
      }),
      { kind: "landing" },
    );
  });
});
