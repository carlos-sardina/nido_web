import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { User } from "@supabase/supabase-js";
import {
  applyProfileDisplayName,
  emailLocalPart,
  identityFromUser,
  initialsFromName,
  isFallbackDisplayName,
} from "./identity.ts";

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

describe("isFallbackDisplayName", () => {
  it("treats a missing or blank name as fallback", () => {
    assert.equal(isFallbackDisplayName({ displayName: null, email: "diana@nido.test" }), true);
    assert.equal(isFallbackDisplayName({ displayName: "   ", email: "diana@nido.test" }), true);
  });

  it("treats the email local-part fallback as needing a real name", () => {
    assert.equal(
      isFallbackDisplayName({
        displayName: "nido.smoke.diana.924",
        email: "nido.smoke.diana.924@nido.test",
      }),
      true,
    );
    assert.equal(emailLocalPart("nido.smoke.diana.924@nido.test"), "nido.smoke.diana.924");
  });

  it("does not treat a chosen name as fallback", () => {
    assert.equal(
      isFallbackDisplayName({
        displayName: "Diana",
        email: "nido.smoke.diana.924@nido.test",
      }),
      false,
    );
    assert.equal(
      isFallbackDisplayName({
        displayName: "Carlos",
        email: "carlos@example.com",
      }),
      false,
    );
    assert.equal(
      isFallbackDisplayName({
        displayName: "carlos",
        email: "carlos@example.com",
      }),
      true,
    );
  });

  it("keeps accented names as valid chosen names", () => {
    assert.equal(
      isFallbackDisplayName({
        displayName: "Sofía",
        email: "nido.test.user@nido.test",
      }),
      false,
    );
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

  it("does not replace a chosen profile name with the email local-part", () => {
    const identity = identityFromUser(user({
      email: "carlos@example.com",
      user_metadata: {},
    }));
    assert.equal(identity?.displayName, "carlos");
    const updated = applyProfileDisplayName(identity, "Carlos");
    assert.equal(updated?.displayName, "Carlos");
    assert.equal(updated?.firstName, "Carlos");
    assert.equal(updated?.email, "carlos@example.com");
    assert.notEqual(updated?.displayName, emailLocalPart("carlos@example.com"));
  });
});
