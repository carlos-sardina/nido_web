import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInvitationPath,
  buildInvitationUrl,
  canCreateOrJoinNido,
  canLeaveHousehold,
  classifyInvitation,
  classifyMemberships,
  extractInvitationToken,
  generateInvitationToken,
  hasActiveMembership,
  DISPLAY_NAME_MAX,
  HOUSEHOLD_NAME_MAX,
  invitationEmailIssue,
  isInvitationTokenFormat,
  isInviteEmailValid,
  normalizeDisplayName,
  normalizeHouseholdName,
  normalizeInviteEmail,
} from "./rules.ts";

describe("classifyMemberships", () => {
  it("treats an authenticated user with no memberships as having no Nido", () => {
    assert.equal(classifyMemberships([]), "no_nido");
    assert.equal(hasActiveMembership([]), false);
  });

  it("treats an active membership as belonging to a Nido", () => {
    assert.equal(
      classifyMemberships([
        { left_at: "2026-01-01T00:00:00.000Z" },
        { left_at: null },
      ]),
      "active",
    );
    assert.equal(hasActiveMembership([{ left_at: null }]), true);
  });

  it("does not treat historical membership as currently belonging to a Nido", () => {
    assert.equal(
      classifyMemberships([{ left_at: "2026-08-01T00:00:00.000Z" }]),
      "historical_only",
    );
    assert.equal(
      hasActiveMembership([{ left_at: "2026-08-01T00:00:00.000Z" }]),
      false,
    );
  });
});

describe("one-active-Nido rule", () => {
  it("allows create or join when there is no active membership", () => {
    assert.equal(canCreateOrJoinNido([]), null);
    assert.equal(canCreateOrJoinNido([{ left_at: "2026-07-01T00:00:00.000Z" }]), null);
  });

  it("rejects create or join when an active membership already exists", () => {
    assert.equal(canCreateOrJoinNido([{ left_at: null }]), "already_in_nido");
  });
});

describe("classifyInvitation", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");

  it("rejects a missing token as invalid", () => {
    assert.equal(classifyInvitation({ found: false, now }), "invalid");
  });

  it("rejects an already accepted invitation", () => {
    assert.equal(
      classifyInvitation({
        found: true,
        acceptedAt: "2026-08-01T00:00:00.000Z",
        expiresAt: "2026-08-20T00:00:00.000Z",
        now,
      }),
      "accepted",
    );
  });

  it("rejects an expired invitation", () => {
    assert.equal(
      classifyInvitation({
        found: true,
        acceptedAt: null,
        expiresAt: "2026-08-14T00:00:00.000Z",
        now,
      }),
      "expired",
    );
  });

  it("accepts a current unused invitation", () => {
    assert.equal(
      classifyInvitation({
        found: true,
        acceptedAt: null,
        expiresAt: "2026-08-22T00:00:00.000Z",
        now,
      }),
      "valid",
    );
  });
});

describe("invitation token validation", () => {
  it("accepts generated tokens and invitation URLs", () => {
    const token = generateInvitationToken();
    assert.equal(isInvitationTokenFormat(token), true);
    assert.equal(extractInvitationToken(token), token);
    assert.equal(
      extractInvitationToken(`https://nido.example/join/${token}`),
      token,
    );
    assert.equal(extractInvitationToken(`/join/${token}`), token);
    assert.equal(buildInvitationPath(token), `/join/${encodeURIComponent(token)}`);
    assert.equal(
      buildInvitationUrl("https://nido.example/", token),
      `https://nido.example/join/${encodeURIComponent(token)}`,
    );
  });

  it("rejects short, spaced, or empty tokens", () => {
    assert.equal(isInvitationTokenFormat(""), false);
    assert.equal(isInvitationTokenFormat("abc"), false);
    assert.equal(isInvitationTokenFormat("not a token value!!"), false);
    assert.equal(extractInvitationToken("ABC123"), null);
    assert.equal(extractInvitationToken(""), null);
  });
});

describe("last-owner leave prevention", () => {
  it("prevents the last owner from leaving", () => {
    assert.equal(
      canLeaveHousehold({
        isActiveMember: true,
        role: "owner",
        activeOwnerCount: 1,
      }),
      "last_owner",
    );
  });

  it("allows a non-last owner or a member to leave", () => {
    assert.equal(
      canLeaveHousehold({
        isActiveMember: true,
        role: "owner",
        activeOwnerCount: 2,
      }),
      null,
    );
    assert.equal(
      canLeaveHousehold({
        isActiveMember: true,
        role: "member",
        activeOwnerCount: 1,
      }),
      null,
    );
  });

  it("rejects leave when there is no active membership", () => {
    assert.equal(
      canLeaveHousehold({
        isActiveMember: false,
        role: null,
        activeOwnerCount: 0,
      }),
      "not_a_member",
    );
  });
});

describe("normalization helpers", () => {
  it("trims display names, keeps accents, and rejects blanks or excess length", () => {
    assert.equal(normalizeDisplayName("Carlos"), "Carlos");
    assert.equal(normalizeDisplayName("  Carlos  "), "Carlos");
    assert.equal(normalizeDisplayName("Sofía"), "Sofía");
    assert.equal(normalizeDisplayName(""), null);
    assert.equal(normalizeDisplayName("   "), null);
    assert.equal(normalizeDisplayName("C".repeat(DISPLAY_NAME_MAX + 1)), null);
    assert.equal(normalizeDisplayName("C".repeat(DISPLAY_NAME_MAX)), "C".repeat(DISPLAY_NAME_MAX));
  });

  it("trims household names and rejects blanks", () => {
    assert.equal(normalizeHouseholdName("  Casa Roma  "), "Casa Roma");
    assert.equal(normalizeHouseholdName("   "), null);
  });

  it("accepts unicode household names and rejects excessive length", () => {
    assert.equal(normalizeHouseholdName("Nido 🪺"), "Nido 🪺");
    assert.equal(normalizeHouseholdName("N".repeat(HOUSEHOLD_NAME_MAX + 1)), null);
  });

  it("does not make household names globally unique", () => {
    assert.equal(normalizeHouseholdName("Nido"), "Nido");
    assert.equal(normalizeHouseholdName("Casa"), "Casa");
    assert.equal(normalizeHouseholdName("Departamento"), "Departamento");
  });

  it("normalizes invitation emails consistently", () => {
    assert.equal(normalizeInviteEmail("  Alex@Example.COM "), "alex@example.com");
    assert.equal(normalizeInviteEmail("   "), null);
    assert.equal(normalizeInviteEmail(null), null);
    assert.equal(isInviteEmailValid("alex@example.com"), true);
    assert.equal(isInviteEmailValid("not-an-email"), false);
  });

  it("rejects an invalid invitation email", () => {
    assert.equal(
      invitationEmailIssue({ email: "nope", currentUserEmail: "me@example.com" }),
      "invalid_email",
    );
  });

  it("rejects inviting the current user", () => {
    assert.equal(
      invitationEmailIssue({
        email: "  Me@Example.com ",
        currentUserEmail: "me@example.com",
      }),
      "self_invite",
    );
  });

  it("rejects inviting an already-active member when that email is known", () => {
    assert.equal(
      invitationEmailIssue({
        email: "alex@example.com",
        currentUserEmail: "me@example.com",
        activeMemberEmails: ["alex@example.com"],
      }),
      "already_member",
    );
  });

  it("allows a link-only invitation without an email", () => {
    assert.equal(
      invitationEmailIssue({ email: null, currentUserEmail: "me@example.com" }),
      null,
    );
  });
});
