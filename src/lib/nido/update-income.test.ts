import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updateIncomeWithAuth } from "./update-income.ts";
import { todayIso } from "./financial/dates.ts";

const validInput = {
  incomeId: "i1",
  householdId: "h1",
  categoryId: "c1",
  amount: 40000,
  description: "Sueldo",
  occurredAt: todayIso(),
  activeMemberIds: ["u1"],
  allowedCategoryIds: ["c1"],
};

describe("updateIncomeWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await updateIncomeWithAuth(validInput, {
      getUserId: async () => null,
      rpc: async () => {
        called += 1;
        return { data: "i1", error: null };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(called, 0);
  });

  it("does not call the RPC when the income id is missing", async () => {
    let called = 0;
    const result = await updateIncomeWithAuth(
      { ...validInput, incomeId: "" },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "i1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "income_not_found");
    assert.equal(called, 0);
  });

  it("does not call the RPC when validation fails", async () => {
    let called = 0;
    const result = await updateIncomeWithAuth(
      { ...validInput, amount: 0 },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "i1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_amount");
    assert.equal(called, 0);
  });

  it("maps forbidden without exposing the raw message", async () => {
    const result = await updateIncomeWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.forbidden", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "forbidden");
      assert.equal(result.error.message.includes("nido."), false);
    }
  });

  it("maps a deleted income without exposing Postgres", async () => {
    const result = await updateIncomeWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.income_deleted", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "income_deleted");
      assert.match(result.error.message, /eliminado/i);
    }
  });

  it("sends the edited fields to update_income", async () => {
    const result = await updateIncomeWithAuth(
      { ...validInput, amount: 42000, description: "Nómina" },
      {
        getUserId: async () => "u1",
        rpc: async (fn, args) => {
          assert.equal(fn, "update_income");
          assert.equal(args.p_income_id, "i1");
          assert.equal(args.p_amount, 42000);
          assert.equal(args.p_description, "Nómina");
          assert.equal("p_created_by" in args, false);
          assert.equal("p_member_id" in args, false);
          assert.equal("p_household_id" in args, false);
          return { data: "i1", error: null };
        },
      },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.id, "i1");
  });
});
