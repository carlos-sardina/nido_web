import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  archiveCategoryWithAuth,
  canSubmitCategory,
  createCategoryWithAuth,
  renameCategoryWithAuth,
  type CategoryMutationAuth,
} from "./category-mutations.ts";
import { CATEGORY_NAME_ARCHIVED, CATEGORY_NAME_TAKEN } from "./financial/categories.ts";

function auth(input: {
  userId?: string | null;
  data?: string | null;
  error?: unknown;
  onRpc?: (fn: string, args: Record<string, unknown>) => void;
}): CategoryMutationAuth {
  return {
    getUserId: async () => (input.userId === undefined ? "u1" : input.userId),
    rpc: async (fn, args) => {
      input.onRpc?.(fn, args);
      return { data: input.data === undefined ? "c-1" : input.data, error: input.error ?? null };
    },
  };
}

describe("createCategoryWithAuth", () => {
  it("trims the name and creates a custom category", async () => {
    let payload: Record<string, unknown> | null = null;
    const result = await createCategoryWithAuth(
      { name: "  Spotify  ", type: "expense", existing: [{ name: "Vivienda" }] },
      auth({ onRpc: (_fn, args) => { payload = args; } }),
    );
    assert.equal(result.ok, true);
    assert.deepEqual(payload, { p_name: "Spotify", p_type: "expense", p_icon: null });
  });

  it("rejects empty, blank, and oversized names without calling the RPC", async () => {
    let called = 0;
    const adapter = auth({ onRpc: () => { called += 1; } });
    for (const name of ["", "   ", "A".repeat(81)]) {
      const result = await createCategoryWithAuth(
        { name, type: "expense", existing: [] },
        adapter,
      );
      assert.equal(result.ok, false);
      if (result.ok === false) assert.equal(result.error.code, "invalid_name");
    }
    assert.equal(called, 0);
  });

  it("rejects a case-insensitive active duplicate without calling the RPC", async () => {
    let called = 0;
    const result = await createCategoryWithAuth(
      { name: "vivienda", type: "expense", existing: [{ name: "Vivienda" }] },
      auth({ onRpc: () => { called += 1; } }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "conflict");
    assert.equal(called, 0);
  });

  it("rejects custom income categories without calling the RPC", async () => {
    let called = 0;
    const result = await createCategoryWithAuth(
      { name: "Bonus", type: "income", existing: [] },
      auth({ onRpc: () => { called += 1; } }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_category");
    assert.equal(called, 0);
  });

  it("reactivates an archived name instead of treating it as a new create", async () => {
    let payload: Record<string, unknown> | null = null;
    const result = await createCategoryWithAuth(
      {
        name: "  vivienda  ",
        type: "expense",
        existing: [{ name: "Vivienda", archivedAt: "2026-08-01T00:00:00.000Z" }],
      },
      auth({ onRpc: (_fn, args) => { payload = args; } }),
    );
    assert.equal(result.ok, true);
    assert.deepEqual(payload, { p_name: "vivienda", p_type: "expense", p_icon: null });
  });
});

describe("renameCategoryWithAuth", () => {
  it("renames after trim", async () => {
    let payload: Record<string, unknown> | null = null;
    const result = await renameCategoryWithAuth(
      {
        categoryId: "c1",
        name: "  Transporte  ",
        existing: [{ id: "c1", name: "Uber" }, { id: "c2", name: "Vivienda" }],
      },
      auth({ onRpc: (_fn, args) => { payload = args; } }),
    );
    assert.equal(result.ok, true);
    assert.deepEqual(payload, { p_category_id: "c1", p_name: "Transporte" });
  });

  it("rejects renaming an income category without calling the RPC", async () => {
    let called = 0;
    const result = await renameCategoryWithAuth(
      {
        categoryId: "c1",
        name: "Bonus",
        type: "income",
        existing: [{ id: "c1", name: "Extra" }],
      },
      auth({ onRpc: () => { called += 1; } }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_category");
    assert.equal(called, 0);
  });

  it("rejects a rename that collides with another active name", async () => {
    let called = 0;
    const result = await renameCategoryWithAuth(
      {
        categoryId: "c1",
        name: "vivienda",
        existing: [{ id: "c1", name: "Uber" }, { id: "c2", name: "Vivienda" }],
      },
      auth({ onRpc: () => { called += 1; } }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "conflict");
      assert.equal(result.error.message, CATEGORY_NAME_TAKEN);
    }
    assert.equal(called, 0);
  });

  it("rejects a rename that collides with an archived name", async () => {
    let called = 0;
    const result = await renameCategoryWithAuth(
      {
        categoryId: "c1",
        name: "vivienda",
        existing: [
          { id: "c1", name: "Uber" },
          { id: "c2", name: "Vivienda", archivedAt: "2026-08-01T00:00:00.000Z" },
        ],
      },
      auth({ onRpc: () => { called += 1; } }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "conflict");
      assert.equal(result.error.message, CATEGORY_NAME_ARCHIVED);
    }
    assert.equal(called, 0);
  });
});

describe("archiveCategoryWithAuth", () => {
  it("archives by id and never sends a delete", async () => {
    let fnName = "";
    const result = await archiveCategoryWithAuth(
      "c1",
      auth({ onRpc: (fn) => { fnName = fn; } }),
    );
    assert.equal(result.ok, true);
    assert.equal(fnName, "archive_category");
    assert.notEqual(fnName, "delete_category");
  });

  it("does not call the RPC without a category id", async () => {
    let called = 0;
    const result = await archiveCategoryWithAuth(
      "",
      auth({ onRpc: () => { called += 1; } }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_category");
    assert.equal(called, 0);
  });
});

describe("canSubmitCategory", () => {
  it("blocks a second submit while saving", () => {
    assert.equal(canSubmitCategory(false), true);
    assert.equal(canSubmitCategory(true), false);
  });
});
