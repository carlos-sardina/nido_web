import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { joinBlockReason, joinInvitationCopy } from "./invitation-copy.ts";

describe("joinInvitationCopy", () => {
  it("describes an invalid token", () => {
    const copy = joinInvitationCopy({ preview: { status: "invalid", householdName: null }, block: "none" });
    assert.match(copy.title, /no válida/i);
  });

  it("describes an expired invitation", () => {
    const copy = joinInvitationCopy({
      preview: { status: "expired", householdName: "Casa Roma" },
      block: "none",
    });
    assert.match(copy.title, /expirada/i);
    assert.match(copy.body, /Casa Roma/);
  });

  it("describes an already accepted invitation", () => {
    const copy = joinInvitationCopy({
      preview: { status: "accepted", householdName: "Casa Roma" },
      block: "none",
    });
    assert.match(copy.title, /ya usada/i);
  });

  it("describes a valid invitation", () => {
    const copy = joinInvitationCopy({
      preview: { status: "valid", householdName: "Casa Roma" },
      block: "none",
    });
    assert.equal(copy.title, "Únete a Casa Roma");
  });

  it("blocks a user who already belongs to another Nido", () => {
    const copy = joinInvitationCopy({
      preview: { status: "valid", householdName: "Casa Roma" },
      block: "already_in_other",
    });
    assert.match(copy.title, /Ya tienes un Nido/);
  });

  it("blocks a user who already belongs to the inviting Nido", () => {
    const copy = joinInvitationCopy({
      preview: { status: "valid", householdName: "Casa Roma" },
      block: "already_in_this",
    });
    assert.match(copy.title, /Ya perteneces a este Nido/);
  });
});

describe("joinBlockReason", () => {
  it("does not block when the user has no active Nido", () => {
    assert.equal(
      joinBlockReason({
        alreadyInNido: false,
        activeHouseholdName: null,
        invitationHouseholdName: "Casa Roma",
      }),
      "none",
    );
  });

  it("detects membership in the inviting Nido by name", () => {
    assert.equal(
      joinBlockReason({
        alreadyInNido: true,
        activeHouseholdName: "Casa Roma",
        invitationHouseholdName: "Casa Roma",
      }),
      "already_in_this",
    );
  });

  it("treats a different active Nido as incompatible", () => {
    assert.equal(
      joinBlockReason({
        alreadyInNido: true,
        activeHouseholdName: "Otro Nido",
        invitationHouseholdName: "Casa Roma",
      }),
      "already_in_other",
    );
  });
});
