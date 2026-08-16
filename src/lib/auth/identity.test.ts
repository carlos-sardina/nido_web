import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { User } from "@supabase/supabase-js";
import { applyProfileDisplayName, identityFromUser, initialsFromName } from "./identity.ts";

function user(overrides: Partial<User> & { user_metadata?: User["user_metadata"] }): User {
  return {
    id: "user-1",
    app_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00.000Z",
    user_metadata: {},
    ...overrides,
  } as User;
}

describe("initialsFromName", () => {
  it("uses two letters from a single word", () => {
    assert.equal(initialsFromName("Carlos"), "CA");
  });

  it("uses first and last name initials", () => {
    assert.equal(initialsFromName("Carlos Sardina"), "CS");
  });

  it("falls back when the name is empty", () => {
    assert.equal(initialsFromName(""), "?");
  });
});

describe("identityFromUser", () => {
  it("returns null without a user", () => {
    assert.equal(identityFromUser(null), null);
  });

  it("prefers Auth full_name and picture metadata when present", () => {
    const identity = identityFromUser(user({
      email: "alex@example.com",
      user_metadata: {
        full_name: "Alex Rivera",
        picture: "https://example.com/alex.jpg",
      },
    }));

    assert.deepEqual(identity, {
      email: "alex@example.com",
      displayName: "Alex Rivera",
      avatarUrl: "https://example.com/alex.jpg",
      initials: "AR",
      firstName: "Alex",
    });
  });

  it("falls back to the email local part when no name is present", () => {
    const identity = identityFromUser(user({
      email: "robin@example.com",
      user_metadata: {},
    }));

    assert.equal(identity?.displayName, "robin");
    assert.equal(identity?.email, "robin@example.com");
    assert.equal(identity?.avatarUrl, null);
  });
});

describe("applyProfileDisplayName", () => {
  it("prefers the persisted profile name over Auth metadata", () => {
    const identity = identityFromUser(user({
      email: "alex@example.com",
      user_metadata: { full_name: "Alex Rivera" },
    }));
    const updated = applyProfileDisplayName(identity, "Alex del Nido");
    assert.equal(updated?.displayName, "Alex del Nido");
    assert.equal(updated?.firstName, "Alex");
    assert.equal(updated?.initials, "AN");
  });
});
