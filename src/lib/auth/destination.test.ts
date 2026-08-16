import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAppEntry, resolveNidoChoice } from "./destination.ts";

describe("resolveAppEntry", () => {
  it("sends an unauthenticated user to the auth landing", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: false,
        membershipStatus: "unauthenticated",
        pendingInviteToken: null,
      }),
      { kind: "landing" },
    );
  });

  it("does not send an unauthenticated user to create or join a Nido", () => {
    const entry = resolveAppEntry({
      authenticated: false,
      membershipStatus: "unauthenticated",
      pendingInviteToken: "invite-token-value-1",
    });
    assert.equal(entry.kind, "landing");
    assert.notEqual(entry.kind, "nido_selection");
    assert.notEqual(entry.kind, "main_app");
  });

  it("sends an authenticated user with no Nido to Nido selection", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: true,
        membershipStatus: "no_nido",
        pendingInviteToken: null,
      }),
      { kind: "nido_selection" },
    );
  });

  it("does not send a newly registered user without a Nido into create onboarding", () => {
    const entry = resolveAppEntry({
      authenticated: true,
      membershipStatus: "no_nido",
      pendingInviteToken: null,
    });
    assert.equal(entry.kind, "nido_selection");
    assert.notEqual(entry.kind, "main_app");
  });

  it("sends an authenticated user with an active Nido to MainApp", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: true,
        membershipStatus: "active",
        pendingInviteToken: "aaaaaaaaaaaaaaaa",
      }),
      { kind: "main_app" },
    );
  });

  it("treats historical-only membership as Nido selection, not MainApp", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: true,
        membershipStatus: "historical_only",
        pendingInviteToken: null,
      }),
      { kind: "nido_selection" },
    );
  });

  it("sends email confirmation with no Nido to Nido selection, not create-Nido", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: true,
        membershipStatus: "no_nido",
        pendingInviteToken: null,
      }),
      { kind: "nido_selection" },
    );
  });

  it("sends email confirmation with an active Nido to MainApp", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: true,
        membershipStatus: "active",
        pendingInviteToken: null,
      }),
      { kind: "main_app" },
    );
  });

  it("returns a pending join invitation to /join/<token> after authentication", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: true,
        membershipStatus: "no_nido",
        pendingInviteToken: "invite-token-value-1",
      }),
      { kind: "join_invite", token: "invite-token-value-1" },
    );
  });

  it("does not infer create vs join from authentication alone", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: true,
        membershipStatus: "historical_only",
        pendingInviteToken: null,
      }),
      { kind: "nido_selection" },
    );
  });

  it("returns to the auth landing after logout (unauthenticated)", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: false,
        membershipStatus: "unauthenticated",
        pendingInviteToken: null,
      }),
      { kind: "landing" },
    );
  });

  it("keeps a pending invite behind an active Nido (MainApp wins)", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: true,
        membershipStatus: "active",
        pendingInviteToken: "invite-token-value-1",
      }),
      { kind: "main_app" },
    );
  });

  it("sends historical-only membership with a pending invite to /join/<token>", () => {
    assert.deepEqual(
      resolveAppEntry({
        authenticated: true,
        membershipStatus: "historical_only",
        pendingInviteToken: "invite-token-value-1",
      }),
      { kind: "join_invite", token: "invite-token-value-1" },
    );
  });
});

describe("resolveNidoChoice", () => {
  it("starts the existing create-Nido onboarding from the selection screen", () => {
    assert.deepEqual(resolveNidoChoice("create"), { kind: "create_nido" });
  });

  it("starts the existing join flow from the selection screen", () => {
    assert.deepEqual(resolveNidoChoice("join"), { kind: "join_code" });
  });
});
