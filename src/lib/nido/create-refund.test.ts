import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSubmitRefund, createRefundWithAuth } from "./create-refund.ts";

const validInput = {
  expenseId: "e1",
  amount: 200,
  refundableRemaining: 700,
};

describe("createRefundWithAuth (unit, mocked auth adapter)", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await createRefundWithAuth(validInput, {
      getUserId: async () => null,
      rpc: async () => {
        called += 1;
        return { data: "r-1", error: null };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(called, 0);
  });

  it("does not call the RPC when validation fails", async () => {
    let called = 0;
    const result = await createRefundWithAuth(
      { ...validInput, amount: 0 },
      {
        getUserId: async () => "u1",
        rpc: async () => {
          called += 1;
          return { data: "r-1", error: null };
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_amount");
    assert.equal(called, 0);
  });

  it("sends only expense_id and amount to create_expense_refund", async () => {
    let fnName = "";
    let args: Record<string, unknown> = {};
    const result = await createRefundWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async (fn, payload) => {
        fnName = fn;
        args = payload;
        return { data: "r-1", error: null };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(fnName, "create_expense_refund");
    assert.deepEqual(args, { p_expense_id: "e1", p_amount: 200 });
    assert.equal("p_splits" in args, false);
  });

  it("maps forbidden and over-cap RPC errors without exposing Postgres", async () => {
    const forbidden = await createRefundWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async () => ({ data: null, error: { message: "nido.forbidden", code: "P0001" } }),
    });
    assert.equal(forbidden.ok, false);
    if (forbidden.ok === false) {
      assert.equal(forbidden.error.code, "forbidden");
      assert.equal(forbidden.error.message.includes("nido."), false);
    }

    const overflow = await createRefundWithAuth(validInput, {
      getUserId: async () => "u1",
      rpc: async () => ({ data: null, error: { message: "nido.invalid_amount", code: "P0001" } }),
    });
    assert.equal(overflow.ok, false);
    if (overflow.ok === false) assert.equal(overflow.error.code, "invalid_amount");
  });

  it("blocks a second submit while in flight", () => {
    assert.equal(canSubmitRefund(true), false);
    assert.equal(canSubmitRefund(false), true);
  });
});
