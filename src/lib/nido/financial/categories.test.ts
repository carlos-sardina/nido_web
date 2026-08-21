import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeExpenseCategories,
  DEFAULT_EXPENSE_CATEGORIES,
  isDuplicateActiveCategoryName,
  normalizeCategoryName,
  type HouseholdCategory,
} from "./categories.ts";

function category(
  partial: Partial<HouseholdCategory> & Pick<HouseholdCategory, "id" | "name" | "householdId">,
): HouseholdCategory {
  return {
    icon: null,
    type: "expense",
    isDefault: false,
    archivedAt: null,
    ...partial,
  };
}

describe("default expense categories", () => {
  it("has unique trimmed names and matches the household catalog", () => {
    const names = DEFAULT_EXPENSE_CATEGORIES.map((row) => row.name);
    assert.equal(names.length, 12);
    assert.equal(new Set(names.map((name) => name.toLowerCase())).size, 12);
    for (const row of DEFAULT_EXPENSE_CATEGORIES) {
      assert.equal(normalizeCategoryName(row.name), row.name);
      assert.ok(row.icon);
    }
    assert.ok(names.includes("Vivienda"));
    assert.ok(names.includes("Despensa"));
    assert.equal(names.includes("Entretenim."), false);
  });
});

describe("normalizeCategoryName", () => {
  it("trims and rejects empty or whitespace-only names", () => {
    assert.equal(normalizeCategoryName("  Salud  "), "Salud");
    assert.equal(normalizeCategoryName(""), null);
    assert.equal(normalizeCategoryName("   "), null);
    assert.equal(normalizeCategoryName("\n\t"), null);
  });

  it("keeps unicode and rejects names that are too long", () => {
    assert.equal(normalizeCategoryName("Niño"), "Niño");
    assert.equal(normalizeCategoryName("a".repeat(81)), null);
    assert.equal(normalizeCategoryName("a".repeat(80)), "a".repeat(80));
  });
});

describe("isDuplicateActiveCategoryName", () => {
  it("rejects an active duplicate regardless of case", () => {
    const existing = [{ name: "Vivienda" }];
    assert.equal(isDuplicateActiveCategoryName("vivienda", existing), true);
    assert.equal(isDuplicateActiveCategoryName("  Vivienda  ", existing), true);
    assert.equal(isDuplicateActiveCategoryName("Salud", existing), false);
  });

  it("allows reusing an archived name", () => {
    const existing = [{ name: "Vivienda", archivedAt: "2026-08-01T00:00:00.000Z" }];
    assert.equal(isDuplicateActiveCategoryName("Vivienda", existing), false);
  });
});

describe("activeExpenseCategories", () => {
  it("only returns active expense categories of the requested household", () => {
    const rows = [
      category({ id: "a", name: "Salud", householdId: "h1" }),
      category({ id: "b", name: "Vivienda", householdId: "h2" }),
      category({ id: "c", name: "Extra", householdId: "h1", type: "income" }),
      category({
        id: "d",
        name: "Archivada",
        householdId: "h1",
        archivedAt: "2026-08-01T00:00:00.000Z",
      }),
    ];
    const active = activeExpenseCategories(rows, "h1");
    assert.deepEqual(active.map((row) => row.id), ["a"]);
  });
});
