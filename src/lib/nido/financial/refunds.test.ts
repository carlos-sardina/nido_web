import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sumMoney } from "./money.ts";
import {
  allocateRefundSplits,
  netExpense,
  refundableRemaining,
  refundedTotal,
  validateRefundAmount,
} from "./refunds.ts";

describe("validateRefundAmount", () => {
  it("rejects 0, negative, NaN, and Infinity", () => {
    assert.equal(validateRefundAmount(0, 100), "invalid_amount");
    assert.equal(validateRefundAmount(-10, 100), "invalid_amount");
    assert.equal(validateRefundAmount(Number.NaN, 100), "invalid_amount");
    assert.equal(validateRefundAmount(Number.POSITIVE_INFINITY, 100), "invalid_amount");
  });

  it("rejects an amount above the remaining refundable", () => {
    assert.equal(validateRefundAmount(301, 300), "invalid_amount");
  });

  it("accepts exactly the remaining amount and a valid decimal", () => {
    assert.equal(validateRefundAmount(300, 300), null);
    assert.equal(validateRefundAmount(12.5, 20), null);
  });
});

describe("refund accumulation", () => {
  it("tracks remaining after successive refunds", () => {
    const first = [{ amount: 300 }];
    const second = [{ amount: 300 }, { amount: 400 }];
    assert.equal(refundedTotal(first), 300);
    assert.equal(refundableRemaining(1000, first), 700);
    assert.equal(refundedTotal(second), 700);
    assert.equal(refundableRemaining(1000, second), 300);
    assert.equal(validateRefundAmount(301, 300), "invalid_amount");
    assert.equal(validateRefundAmount(300, 300), null);
  });

  it("reaches exactly zero when fully refunded", () => {
    assert.equal(refundableRemaining(1000, [{ amount: 1000 }]), 0);
    assert.equal(netExpense(1000, [{ amount: 1000 }]), 0);
    assert.equal(validateRefundAmount(0.01, 0), "invalid_amount");
  });
});

describe("allocateRefundSplits", () => {
  it("splits an equal 50/50 expense refund in half", () => {
    const splits = allocateRefundSplits(200, [
      { memberId: "carlos", amount: 500 },
      { memberId: "diana", amount: 500 },
    ]);
    assert.ok(splits);
    assert.equal(splits[0].amount, 100);
    assert.equal(splits[1].amount, 100);
    assert.equal(sumMoney(splits.map((split) => split.amount)), 200);
  });

  it("splits a 70/30 expense refund proportionally", () => {
    const splits = allocateRefundSplits(250, [
      { memberId: "carlos", amount: 700 },
      { memberId: "diana", amount: 300 },
    ]);
    assert.ok(splits);
    assert.equal(splits[0].amount, 175);
    assert.equal(splits[1].amount, 75);
    assert.equal(sumMoney(splits.map((split) => split.amount)), 250);
  });

  it("absorbs rounding residue so splits always sum to the refund", () => {
    const splits = allocateRefundSplits(10, [
      { memberId: "a", amount: 33.33 },
      { memberId: "b", amount: 33.33 },
      { memberId: "c", amount: 33.34 },
    ]);
    assert.ok(splits);
    assert.equal(sumMoney(splits.map((split) => split.amount)), 10);
    assert.equal(splits[2].memberId, "c");
  });

  it("gives a personal 100% split the full refund", () => {
    const splits = allocateRefundSplits(80, [{ memberId: "carlos", amount: 200 }]);
    assert.ok(splits);
    assert.equal(splits.length, 1);
    assert.equal(splits[0].amount, 80);
    assert.equal(splits[0].memberId, "carlos");
  });
});

describe("netExpense", () => {
  it("does not go negative when refunds equal the expense", () => {
    assert.equal(netExpense(100, [{ amount: 100 }]), 0);
    assert.equal(netExpense(100, [{ amount: 40 }, { amount: 60 }]), 0);
  });

  it("keeps the original amount when there are no refunds", () => {
    assert.equal(netExpense(1000, []), 1000);
    assert.equal(netExpense(1000, undefined), 1000);
  });
});
