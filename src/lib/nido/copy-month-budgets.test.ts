import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCopyPreviousMonthBudgets,
  createBudgetsFromCopyDraftsWithDeps,
  loadPreviousMonthCopyDraftsWithDeps,
} from "./copy-month-budgets.ts";
import { getMonthRange } from "./financial/dates.ts";
import type { BudgetCopyDraft } from "./financial/copy-budgets.ts";
import type { BudgetRow } from "./financial/types.ts";
import { nidoFail, nidoOk } from "./errors.ts";
import type { CreateBudgetRequest } from "./financial/budget-input.ts";

const august = getMonthRange(2026, 8);
const septemberNow = new Date("2026-09-15T12:00:00-06:00");

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

function draft(partial: Partial<BudgetCopyDraft> & Pick<BudgetCopyDraft, "categoryId" | "amount">): BudgetCopyDraft {
  return {
    id: partial.id ?? `d-${partial.categoryId}`,
    name: partial.name ?? "Categoría",
    icon: partial.icon ?? "📌",
    personal: partial.personal ?? false,
    ...partial,
  };
}

const categories = [
  {
    id: "rent",
    householdId: "h1",
    name: "Vivienda",
    icon: "🏠",
    type: "expense" as const,
    isDefault: true,
    archivedAt: null,
  },
  {
    id: "coffee",
    householdId: "h1",
    name: "Restaurantes",
    icon: "🍔",
    type: "expense" as const,
    isDefault: true,
    archivedAt: null,
  },
];

const input = {
  householdId: "h1",
  currentUserId: "u1",
  activeMemberIds: ["u1", "u2"],
  now: septemberNow,
};

describe("loadPreviousMonthCopyDraftsWithDeps", () => {
  it("rejects a missing session or membership", async () => {
    const deps = {
      fetchBudgetsForRange: async () => nidoOk([] as BudgetRow[]),
      fetchActiveExpenseCategories: async () => nidoOk(categories),
    };
    const unauthenticated = await loadPreviousMonthCopyDraftsWithDeps(
      { ...input, currentUserId: "" },
      deps,
    );
    assert.equal(unauthenticated.ok, false);
    if (unauthenticated.ok === false) assert.equal(unauthenticated.error.code, "unauthenticated");

    const outsider = await loadPreviousMonthCopyDraftsWithDeps({ ...input, currentUserId: "u9" }, deps);
    assert.equal(outsider.ok, false);
    if (outsider.ok === false) assert.equal(outsider.error.code, "not_a_member");
  });

  it("returns last month's copyable drafts without creating rows", async () => {
    const result = await loadPreviousMonthCopyDraftsWithDeps(input, {
      fetchBudgetsForRange: async (_householdId, range) => {
        assert.equal(range.start, august.start);
        return nidoOk([
          budget({ amount: 8000, categoryId: "rent" }),
          budget({ amount: 1500, categoryId: "coffee", memberId: "u1", createdBy: "u1" }),
          budget({ amount: 400, categoryId: "coffee", memberId: "u2", createdBy: "u2", id: "b-other" }),
        ]);
      },
      fetchActiveExpenseCategories: async () => nidoOk(categories),
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.previousRange.start, august.start);
      assert.equal(result.data.currentRange.start, "2026-09-01");
      assert.equal(result.data.categories.length, 2);
      assert.deepEqual(
        result.data.drafts.map((row) => ({
          categoryId: row.categoryId,
          amount: row.amount,
          personal: row.personal,
        })),
        [
          { categoryId: "rent", amount: 8000, personal: false },
          { categoryId: "coffee", amount: 1500, personal: true },
        ],
      );
    }
  });

  it("returns an empty draft list when last month has nothing to copy", async () => {
    const result = await loadPreviousMonthCopyDraftsWithDeps(input, {
      fetchBudgetsForRange: async () => nidoOk([]),
      fetchActiveExpenseCategories: async () => nidoOk(categories),
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.drafts.length, 0);
  });
});

describe("createBudgetsFromCopyDraftsWithDeps", () => {
  it("creates the reviewed drafts for the current month", async () => {
    const created: CreateBudgetRequest[] = [];
    const result = await createBudgetsFromCopyDraftsWithDeps(
      {
        ...input,
        allowedCategoryIds: ["rent", "coffee"],
        drafts: [
          draft({ categoryId: "rent", amount: 9000, name: "Vivienda", icon: "🏠" }),
          draft({ categoryId: "coffee", amount: 400, personal: true }),
        ],
      },
      {
        createBudget: async (request) => {
          created.push(request);
          return nidoOk({ id: `new-${created.length}` });
        },
      },
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.copied, 2);
      assert.equal(result.data.skipped, 0);
    }
    assert.deepEqual(
      created.map((row) => ({
        categoryId: row.categoryId,
        amount: row.amount,
        startDate: row.startDate,
        personal: row.personal,
      })),
      [
        { categoryId: "rent", amount: 9000, startDate: "2026-09-01", personal: false },
        { categoryId: "coffee", amount: 400, startDate: "2026-09-01", personal: true },
      ],
    );
  });

  it("rejects an empty or duplicated draft list", async () => {
    const empty = await createBudgetsFromCopyDraftsWithDeps(
      { ...input, allowedCategoryIds: ["rent"], drafts: [] },
      { createBudget: async () => nidoOk({ id: "x" }) },
    );
    assert.equal(empty.ok, false);
    if (empty.ok === false) assert.match(empty.error.message, /al menos un presupuesto/i);

    const duplicate = await createBudgetsFromCopyDraftsWithDeps(
      {
        ...input,
        allowedCategoryIds: ["rent"],
        drafts: [
          draft({ id: "a", categoryId: "rent", amount: 100 }),
          draft({ id: "b", categoryId: "rent", amount: 200 }),
        ],
      },
      { createBudget: async () => nidoOk({ id: "x" }) },
    );
    assert.equal(duplicate.ok, false);
    if (duplicate.ok === false) assert.equal(duplicate.error.code, "conflict");
  });

  it("skips a category that already exists this month", async () => {
    const result = await createBudgetsFromCopyDraftsWithDeps(
      {
        ...input,
        allowedCategoryIds: ["rent"],
        drafts: [draft({ categoryId: "rent", amount: 8000 })],
      },
      { createBudget: async () => nidoFail("conflict") },
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.copied, 0);
      assert.equal(result.data.skipped, 1);
    }
  });

  it("surfaces a partial failure after some rows were created", async () => {
    let calls = 0;
    const result = await createBudgetsFromCopyDraftsWithDeps(
      {
        ...input,
        allowedCategoryIds: ["rent", "coffee"],
        drafts: [
          draft({ categoryId: "rent", amount: 8000 }),
          draft({ categoryId: "coffee", amount: 1500, personal: true }),
        ],
      },
      {
        createBudget: async () => {
          calls += 1;
          if (calls === 1) return nidoOk({ id: "new-1" });
          return nidoFail("network");
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "network");
      assert.match(result.error.message, /algunos presupuestos/i);
    }
  });
});

describe("canCopyPreviousMonthBudgets", () => {
  it("blocks a second submit while the first is in flight", () => {
    assert.equal(canCopyPreviousMonthBudgets(false), true);
    assert.equal(canCopyPreviousMonthBudgets(true), false);
  });
});
