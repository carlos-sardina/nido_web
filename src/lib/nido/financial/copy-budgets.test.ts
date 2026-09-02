import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  budgetCopyDraftKey,
  copyablePreviousMonthBudgets,
  draftsFromPreviousMonthBudgets,
  hasDuplicateBudgetCopyDrafts,
} from "./copy-budgets.ts";
import { getMonthRange } from "./dates.ts";
import type { BudgetRow } from "./types.ts";

const august = getMonthRange(2026, 8);
const september = getMonthRange(2026, 9);

function budget(partial: Partial<BudgetRow> & Pick<BudgetRow, "amount" | "categoryId">): BudgetRow {
  return {
    id: partial.id ?? `b-${partial.categoryId}`,
    householdId: "h1",
    memberId: null,
    period: "monthly",
    startDate: august.start,
    endDate: august.end,
    createdBy: "u1",
    createdAt: "2026-08-01T12:00:00.000Z",
    deletedAt: null,
    category: { id: partial.categoryId, name: "Renta", icon: "🏠" },
    ...partial,
  };
}

describe("copyablePreviousMonthBudgets", () => {
  it("keeps Nido budgets and the caller's personal budgets", () => {
    const rows = copyablePreviousMonthBudgets(
      [
        budget({ amount: 8000, categoryId: "rent" }),
        budget({ amount: 1500, categoryId: "coffee", memberId: "u1", createdBy: "u1" }),
        budget({ amount: 400, categoryId: "pets", memberId: "u2", createdBy: "u2" }),
      ],
      august,
      "u1",
    );
    assert.deepEqual(
      rows.map((row) => row.categoryId),
      ["rent", "coffee"],
    );
  });

  it("ignores deleted rows and other months", () => {
    const rows = copyablePreviousMonthBudgets(
      [
        budget({ amount: 8000, categoryId: "rent", deletedAt: "2026-08-20T12:00:00.000Z" }),
        budget({
          amount: 500,
          categoryId: "food",
          startDate: september.start,
          endDate: september.end,
        }),
      ],
      august,
      "u1",
    );
    assert.equal(rows.length, 0);
  });

  it("returns nothing without a current user", () => {
    const rows = copyablePreviousMonthBudgets(
      [budget({ amount: 8000, categoryId: "rent" })],
      august,
      "",
    );
    assert.equal(rows.length, 0);
  });
});

describe("draftsFromPreviousMonthBudgets", () => {
  it("drops archived categories and zero amounts", () => {
    const drafts = draftsFromPreviousMonthBudgets({
      previousBudgets: [
        budget({ amount: 8000, categoryId: "rent" }),
        budget({ amount: 0, categoryId: "food" }),
        budget({ amount: 300, categoryId: "archived" }),
      ],
      previousRange: august,
      currentUserId: "u1",
      allowedCategoryIds: ["rent", "food"],
    });
    assert.deepEqual(drafts, [
      {
        id: "b-rent",
        categoryId: "rent",
        name: "Renta",
        icon: "🏠",
        amount: 8000,
        personal: false,
      },
    ]);
  });

  it("marks the caller's personal rows as personal", () => {
    const drafts = draftsFromPreviousMonthBudgets({
      previousBudgets: [
        budget({ amount: 1500, categoryId: "coffee", memberId: "u1", createdBy: "u1" }),
      ],
      previousRange: august,
      currentUserId: "u1",
      allowedCategoryIds: ["coffee"],
    });
    assert.equal(drafts[0]?.personal, true);
    assert.equal(budgetCopyDraftKey(drafts[0]!), "personal:coffee");
  });

  it("detects a repeated category and scope", () => {
    assert.equal(
      hasDuplicateBudgetCopyDrafts([
        {
          id: "a",
          categoryId: "rent",
          name: "Vivienda",
          icon: "🏠",
          amount: 100,
          personal: false,
        },
        {
          id: "b",
          categoryId: "rent",
          name: "Vivienda",
          icon: "🏠",
          amount: 200,
          personal: false,
        },
      ]),
      true,
    );
    assert.equal(
      hasDuplicateBudgetCopyDrafts([
        {
          id: "a",
          categoryId: "rent",
          name: "Vivienda",
          icon: "🏠",
          amount: 100,
          personal: false,
        },
        {
          id: "b",
          categoryId: "rent",
          name: "Vivienda",
          icon: "🏠",
          amount: 200,
          personal: true,
        },
      ]),
      false,
    );
  });
});
