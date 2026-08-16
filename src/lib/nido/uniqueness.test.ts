import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeDisplayName, normalizeHouseholdName } from "./rules.ts";

/**
 * Uniqueness audit for Phase 8.10. These assertions document which
 * identities the application treats as unique. No migration is added:
 * household.name and profiles.display_name stay non-unique.
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
});
