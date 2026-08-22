import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Household } from "./types.ts";
import {
  canSubmitHouseholdSplitMethod,
  updateHouseholdSplitMethodWithAuth,
  type UpdateHouseholdSplitMethodAuth,
} from "./update-household-split-method.ts";

const household: Household = {
  id: "h1",
  name: "Casa Roma",
  created_by: "u1",
  created_at: "2026-08-21T00:00:00Z",
  updated_at: "2026-08-21T00:00:00Z",
  default_split_method: "equal",
};

function auth(input: {
  userId?: string | null;
  update?: (method: string) => { data: Household | null; error: unknown };
  onUpdate?: (method: string) => void;
}): UpdateHouseholdSplitMethodAuth {
  return {
    getUserId: async () => (input.userId === undefined ? "u1" : input.userId),
    rpc: async (fn, args) => {
      assert.equal(fn, "update_household_default_split_method");
      input.onUpdate?.(args.p_method);
      return input.update
        ? input.update(args.p_method)
        : { data: { ...household, default_split_method: args.p_method }, error: null };
    },
  };
}

describe("updateHouseholdSplitMethodWithAuth", () => {
  it("persists equal and proportional", async () => {
    for (const method of ["equal", "proportional"] as const) {
      const result = await updateHouseholdSplitMethodWithAuth(method, auth({}));
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.data.default_split_method, method);
    }
  });

  it("rejects capacity and other invalid values without calling the RPC", async () => {
    let called = 0;
    const adapter = auth({
      onUpdate: () => {
        called += 1;
      },
    });

    for (const method of ["capacity", "income_based", "", null, 1]) {
      const result = await updateHouseholdSplitMethodWithAuth(method, adapter);
      assert.equal(result.ok, false);
      if (result.ok === false) assert.equal(result.error.code, "invalid_split");
    }
    assert.equal(called, 0);
  });

  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await updateHouseholdSplitMethodWithAuth(
      "equal",
      auth({
        userId: null,
        onUpdate: () => {
          called += 1;
        },
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(called, 0);
  });
});

describe("canSubmitHouseholdSplitMethod", () => {
  it("blocks a second submit while saving", () => {
    assert.equal(canSubmitHouseholdSplitMethod(false), true);
    assert.equal(canSubmitHouseholdSplitMethod(true), false);
  });
});
