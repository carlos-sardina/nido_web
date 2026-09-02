import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canConfirmMonthlyBalance,
  canSubmitBalancePayment,
  confirmMonthlyBalanceWithAuth,
} from "./confirm-monthly-balance.ts";

describe("confirmMonthlyBalanceWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await confirmMonthlyBalanceWithAuth(
      { year: 2026, month: 8 },
      {
        getUserId: async () => null,
        rpc: async () => {
          called += 1;
          return { data: false, error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(called, 0);
  });

  it("rejects an invalid month before calling the RPC", async () => {
    let called = 0;
    const result = await confirmMonthlyBalanceWithAuth(
      { year: 2026, month: 13 },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: false, error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_date");
    assert.equal(called, 0);
  });

  it("maps not_a_member from the RPC", async () => {
    const result = await confirmMonthlyBalanceWithAuth(
      { year: 2026, month: 8 },
      {
        getUserId: async () => "u1",
        rpc: async () => ({
          data: null,
          error: { message: "nido.not_a_member", code: "P0001" },
        }),
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.error.code, "not_a_member");
      assert.match(result.error.message, /Nido activo/i);
    }
  });

  it("returns paid when every member has confirmed", async () => {
    const result = await confirmMonthlyBalanceWithAuth(
      { year: 2026, month: 8 },
      {
        getUserId: async () => "u1",
        rpc: async (fn, args) => {
          assert.equal(fn, "confirm_monthly_balance");
          assert.deepEqual(args, { p_year: 2026, p_month: 8 });
          return { data: true, error: null };
        },
      },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.paid, true);
  });
});

describe("canConfirmMonthlyBalance", () => {
  it("accepts a real calendar month", () => {
    assert.equal(canConfirmMonthlyBalance({ year: 2026, month: 9 }), true);
  });

  it("rejects out-of-range months", () => {
    assert.equal(canConfirmMonthlyBalance({ year: 2026, month: 0 }), false);
    assert.equal(canConfirmMonthlyBalance({ year: 1999, month: 8 }), false);
  });
});

describe("canSubmitBalancePayment", () => {
  it("blocks a second click while submitting or after confirming", () => {
    assert.equal(canSubmitBalancePayment(false, false), true);
    assert.equal(canSubmitBalancePayment(true, false), false);
    assert.equal(canSubmitBalancePayment(false, true), false);
  });
});
