import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PERSONAL_VISIBILITY,
  canReadPersonalFinance,
  isPersonalBudgetVisible,
  isPersonalExpenseVisible,
  isPersonalSavingsVisible,
  isPersonalVisibility,
} from "./personal-visibility.ts";

describe("personal visibility", () => {
  it("defaults to nido", () => {
    assert.equal(DEFAULT_PERSONAL_VISIBILITY, "nido");
    assert.equal(isPersonalVisibility("nido"), true);
    assert.equal(isPersonalVisibility("private"), true);
  });

  it("rejects invalid values", () => {
    for (const value of ["solo yo", "shared", "", null, 1, "NIDO"]) {
      assert.equal(isPersonalVisibility(value), false);
    }
  });

  it("lets the owner read personal rows when private", () => {
    const privateOwn = {
      ownerId: "carlos",
      viewerId: "carlos",
      visibility: "private" as const,
    };
    assert.equal(canReadPersonalFinance(privateOwn), true);
    assert.equal(
      isPersonalExpenseVisible({ ...privateOwn, scope: "personal" }),
      true,
    );
    assert.equal(
      isPersonalBudgetVisible({ memberId: "carlos", viewerId: "carlos", visibility: "private" }),
      true,
    );
    assert.equal(
      isPersonalSavingsVisible({ memberId: "carlos", viewerId: "carlos", visibility: "private" }),
      true,
    );
  });

  it("lets a peer read personal rows only when nido", () => {
    assert.equal(
      canReadPersonalFinance({ ownerId: "carlos", viewerId: "diana", visibility: "nido" }),
      true,
    );
    assert.equal(
      isPersonalExpenseVisible({
        scope: "personal",
        ownerId: "carlos",
        viewerId: "diana",
        visibility: "nido",
      }),
      true,
    );
    assert.equal(
      isPersonalBudgetVisible({ memberId: "carlos", viewerId: "diana", visibility: "nido" }),
      true,
    );
    assert.equal(
      isPersonalSavingsVisible({ memberId: "carlos", viewerId: "diana", visibility: "nido" }),
      true,
    );
  });

  it("hides personal rows from a peer when private", () => {
    assert.equal(
      canReadPersonalFinance({ ownerId: "carlos", viewerId: "diana", visibility: "private" }),
      false,
    );
    assert.equal(
      isPersonalExpenseVisible({
        scope: "personal",
        ownerId: "carlos",
        viewerId: "diana",
        visibility: "private",
      }),
      false,
    );
    assert.equal(
      isPersonalBudgetVisible({ memberId: "carlos", viewerId: "diana", visibility: "private" }),
      false,
    );
    assert.equal(
      isPersonalSavingsVisible({ memberId: "carlos", viewerId: "diana", visibility: "private" }),
      false,
    );
  });

  it("does not apply the setting to shared / Nido rows", () => {
    assert.equal(
      isPersonalExpenseVisible({
        scope: "shared",
        ownerId: "carlos",
        viewerId: "diana",
        visibility: "private",
      }),
      true,
    );
    assert.equal(
      isPersonalBudgetVisible({ memberId: null, viewerId: "diana", visibility: "private" }),
      true,
    );
    assert.equal(
      isPersonalSavingsVisible({ memberId: null, viewerId: "diana", visibility: "private" }),
      true,
    );
  });

  it("changes with the preference without copying data", () => {
    const row = { ownerId: "carlos", viewerId: "diana" as const };
    assert.equal(canReadPersonalFinance({ ...row, visibility: "nido" }), true);
    assert.equal(canReadPersonalFinance({ ...row, visibility: "private" }), false);
    assert.equal(canReadPersonalFinance({ ...row, visibility: "nido" }), true);
  });
});
