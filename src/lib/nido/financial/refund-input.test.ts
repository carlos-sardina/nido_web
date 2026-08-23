import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCreateRefundPayload, refundAmountMessage } from "./refund-input.ts";

describe("buildCreateRefundPayload", () => {
  it("rejects a missing expense", () => {
    const result = buildCreateRefundPayload({
      expenseId: "",
      amount: 10,
      refundableRemaining: 100,
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "expense_not_found");
  });

  it("rejects 0, excess, and accepts a valid decimal within remaining", () => {
    assert.equal(
      buildCreateRefundPayload({ expenseId: "e1", amount: 0, refundableRemaining: 100 }).ok,
      false,
    );
    assert.equal(
      buildCreateRefundPayload({ expenseId: "e1", amount: 101, refundableRemaining: 100 }).ok,
      false,
    );
    const ok = buildCreateRefundPayload({
      expenseId: "e1",
      amount: 12.5,
      refundableRemaining: 100,
    });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.data.amount, 12.5);
  });
});

describe("refundAmountMessage", () => {
  it("explains when the amount exceeds the remaining refundable", () => {
    assert.match(refundAmountMessage("301", 300) ?? "", /disponible/i);
    assert.equal(refundAmountMessage("300", 300), null);
  });
});
