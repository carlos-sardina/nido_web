import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOUSEHOLD_NAME_MAX } from "./rules.ts";
import type { Household } from "./types.ts";
import {
  canSubmitHouseholdName,
  updateHouseholdNameWithAuth,
  type UpdateHouseholdNameAuth,
} from "./update-household-name.ts";

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
  update?: (name: string) => { data: Household | null; error: unknown };
  onUpdate?: (name: string) => void;
}): UpdateHouseholdNameAuth {
  return {
    getUserId: async () => (input.userId === undefined ? "u1" : input.userId),
    rpc: async (fn, args) => {
      assert.equal(fn, "update_household_name");
      input.onUpdate?.(args.p_name);
      return input.update
        ? input.update(args.p_name)
        : { data: { ...household, name: args.p_name }, error: null };
    },
  };
}

describe("updateHouseholdNameWithAuth (unit, mocked auth adapter)", () => {
  it("trims a valid name and sends only p_name", async () => {
    let payload: { p_name: string } | null = null;
    const result = await updateHouseholdNameWithAuth(
      "  Nido Centro  ",
      auth({
        onUpdate: (name) => {
          payload = { p_name: name };
        },
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.name, "Nido Centro");
    assert.deepEqual(payload, { p_name: "Nido Centro" });
  });

  it("rejects empty, blank, and oversized names without calling the RPC", async () => {
    let called = 0;
    const adapter = auth({
      onUpdate: () => {
        called += 1;
      },
    });

    for (const input of ["", "   ", "N".repeat(HOUSEHOLD_NAME_MAX + 1)]) {
      const result = await updateHouseholdNameWithAuth(input, adapter);
      assert.equal(result.ok, false);
      if (result.ok === false) assert.equal(result.error.code, "invalid_name");
    }
    assert.equal(called, 0);
  });

  it("updates only name on the returned household", async () => {
    const result = await updateHouseholdNameWithAuth(
      "Casa Nueva",
      auth({
        update: (name) => ({
          data: { ...household, name },
          error: null,
        }),
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.name, "Casa Nueva");
      assert.equal(result.data.id, household.id);
      assert.equal(result.data.created_by, household.created_by);
      assert.equal(result.data.default_split_method, "equal");
    }
  });

  it("keeps the draft available after an error so the user can retry", async () => {
    let attempts = 0;
    const adapter = auth({
      update: (name) => {
        attempts += 1;
        if (attempts === 1) {
          return { data: null, error: { message: "network boom", code: "PGRST301" } };
        }
        return { data: { ...household, name }, error: null };
      },
    });

    const first = await updateHouseholdNameWithAuth("  Sofía  ", adapter);
    assert.equal(first.ok, false);
    if (first.ok === false) assert.equal(first.error.code, "network");

    const second = await updateHouseholdNameWithAuth("  Sofía  ", adapter);
    assert.equal(second.ok, true);
    if (second.ok) assert.equal(second.data.name, "Sofía");
    assert.equal(attempts, 2);
  });

  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await updateHouseholdNameWithAuth(
      "Casa",
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

describe("canSubmitHouseholdName", () => {
  it("blocks a second submit while saving", () => {
    assert.equal(canSubmitHouseholdName(false), true);
    assert.equal(canSubmitHouseholdName(true), false);
  });
});
