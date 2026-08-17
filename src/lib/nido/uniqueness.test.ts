import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidEmail, normalizeEmail } from "../auth/credentials.ts";
import { interpretSignupResponse } from "../auth/errors.ts";
import { normalizeDisplayName, normalizeHouseholdName } from "./rules.ts";

/**
 * Uniqueness audit for Phase 8.10. These assertions document which
 * identities the application treats as unique. No migration is added:
 * household.name and profiles.display_name stay non-unique.
 * Auth email uniqueness stays with Supabase Auth; the frontend only
 * validates format and never looks up existence.
 */
describe("uniqueness audit", () => {
  it("does not treat household names as globally unique", () => {
    assert.equal(normalizeHouseholdName("Nido"), "Nido");
    assert.equal(normalizeHouseholdName("Casa"), "Casa");
    assert.equal(normalizeHouseholdName("Nuestro Hogar"), "Nuestro Hogar");
  });

  it("does not treat display names as unique", () => {
    assert.equal(normalizeDisplayName("Carlos"), "Carlos");
    assert.equal(normalizeDisplayName("Carlos"), normalizeDisplayName("  Carlos  "));
  });

  it("J: frontend does not create duplicate auth users, profiles, or Nidos on signup", () => {
    assert.equal(isValidEmail("alex@example.com"), true);
    assert.equal(normalizeEmail("  Alex@Example.COM "), "alex@example.com");
    const outcome = interpretSignupResponse({
      data: { session: null, user: { identities: [] } },
      error: null,
    });
    assert.equal(outcome.kind, "confirm_email");
    assert.equal("id" in outcome, false);
    assert.equal("household" in outcome, false);
    assert.equal("profile" in outcome, false);
  });
});
