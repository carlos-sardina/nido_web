import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canSubmitOnboardingFinalize,
  createHouseholdFromOnboardingWithAuth,
} from "./create-household-onboarding.ts";
import type { Household } from "./types.ts";
import { draftAfterHouseholdCreateAttempt } from "../onboarding/draft.ts";

const household: Household = {
  id: "h1",
  name: "Casa Roma",
  created_by: "u1",
  created_at: "2026-08-21T00:00:00Z",
  updated_at: "2026-08-21T00:00:00Z",
  default_split_method: "equal",
};

describe("createHouseholdFromOnboardingWithAuth", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await createHouseholdFromOnboardingWithAuth(
      { name: "Casa Roma", incomeAmount: 40000 },
      {
        getUserId: async () => null,
        rpc: async () => {
          called += 1;
          return { data: household, error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(called, 0);
  });

  it("does not call the RPC for an invalid household name", async () => {
    let called = 0;
    const result = await createHouseholdFromOnboardingWithAuth(
      { name: "   ", incomeAmount: 40000 },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: household, error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_name");
    assert.equal(called, 0);
  });

  it("rejects an invalid income before creating a Nido", async () => {
    let called = 0;
    const auth = {
      getUserId: async () => "u1",
      rpc: async () => {
        called += 1;
        return { data: household, error: null };
      },
    };
    const nan = await createHouseholdFromOnboardingWithAuth(
      { name: "Casa", incomeAmount: Number.NaN },
      auth,
    );
    const negative = await createHouseholdFromOnboardingWithAuth(
      { name: "Casa", incomeAmount: -10 },
      auth,
    );
    const inf = await createHouseholdFromOnboardingWithAuth(
      { name: "Casa", incomeAmount: Number.POSITIVE_INFINITY },
      auth,
    );
    assert.equal(nan.ok, false);
    assert.equal(negative.ok, false);
    assert.equal(inf.ok, false);
    assert.equal(called, 0);
  });

  it("sends only the name and amount — no household, identity, or date", async () => {
    const result = await createHouseholdFromOnboardingWithAuth(
      { name: "  Casa Roma  ", incomeAmount: 40000 },
      {
        getUserId: async () => "u1",
        rpc: async (fn, args) => {
          assert.equal(fn, "create_household_with_onboarding_income");
          assert.equal(args.p_name, "Casa Roma");
          assert.equal(args.p_income_amount, 40000);
          assert.equal("p_household_id" in args, false);
          assert.equal("p_created_by" in args, false);
          assert.equal("p_member_id" in args, false);
          assert.equal("p_category_id" in args, false);
          assert.equal("p_occurred_at" in args, false);
          return { data: household, error: null };
        },
      },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.id, "h1");
  });

  it("allows a zero income so the RPC can skip the movement", async () => {
    const result = await createHouseholdFromOnboardingWithAuth(
      { name: "Casa", incomeAmount: 0 },
      {
        getUserId: async () => "u1",
        rpc: async (_fn, args) => {
          assert.equal(args.p_income_amount, 0);
          return { data: household, error: null };
        },
      },
    );
    assert.equal(result.ok, true);
  });

  it("maps a network failure without exposing the raw message", async () => {
    const result = await createHouseholdFromOnboardingWithAuth(
      { name: "Casa", incomeAmount: 40000 },
      {
        getUserId: async () => "u1",
        rpc: async () => ({ data: null, error: { message: "fetch failed", code: "PGRST301" } }),
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "network");
      assert.equal(result.error.message.includes("PGRST"), false);
      assert.match(result.error.message, /Inténtalo de nuevo/i);
    }
  });

  it("maps not-a-member from the RPC for a caller without an active Nido on retry paths", async () => {
    const result = await createHouseholdFromOnboardingWithAuth(
      { name: "Casa", incomeAmount: 40000 },
      {
        getUserId: async () => "u1",
        rpc: async () => ({
          data: null,
          error: { message: "nido.not_a_member", code: "P0001" },
        }),
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "not_a_member");
  });

  it("does not invent a second household when the RPC reports already_in_nido", async () => {
    let called = 0;
    const result = await createHouseholdFromOnboardingWithAuth(
      { name: "Otro", incomeAmount: 99999 },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: null, error: { message: "nido.already_in_nido", code: "P0001" } };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "already_in_nido");
    assert.equal(called, 1);
  });

  it("treats a successful retry as the same household, not a duplicate", async () => {
    const ids: string[] = [];
    const auth = {
      getUserId: async () => "u1",
      rpc: async () => {
        ids.push(household.id);
        return { data: household, error: null };
      },
    };
    const first = await createHouseholdFromOnboardingWithAuth(
      { name: "Casa", incomeAmount: 40000 },
      auth,
    );
    const retry = await createHouseholdFromOnboardingWithAuth(
      { name: "Casa", incomeAmount: 40000 },
      auth,
    );
    assert.equal(first.ok, true);
    assert.equal(retry.ok, true);
    if (first.ok && retry.ok) assert.equal(first.data.id, retry.data.id);
    assert.deepEqual(ids, ["h1", "h1"]);
  });

  it("keeps the draft after a failed persist and clears it after success", () => {
    assert.equal(draftAfterHouseholdCreateAttempt(false), "keep");
    assert.equal(draftAfterHouseholdCreateAttempt(true), "clear");
  });
});

describe("canSubmitOnboardingFinalize", () => {
  it("blocks a second tap while the first persist is in flight", () => {
    assert.equal(canSubmitOnboardingFinalize(false), true);
    assert.equal(canSubmitOnboardingFinalize(true), false);
  });
});
