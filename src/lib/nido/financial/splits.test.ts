import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allocateEqualSplits, allocateIncomeBasedSplits, personalSplit, splitIssue } from "./splits.ts";
import { sumMoney } from "./money.ts";

describe("personalSplit", () => {
  it("assigns the full amount to the payer at 100%", () => {
    assert.deepEqual(personalSplit("diana", 240), [
      { memberId: "diana", amount: 240, percentage: 100 },
    ]);
  });

  it("rejects a non-positive amount", () => {
    assert.equal(personalSplit("diana", 0), null);
    assert.equal(personalSplit("diana", -10), null);
  });
});

describe("allocateEqualSplits", () => {
  it("splits evenly and keeps the cent remainder on the first members", () => {
    const splits = allocateEqualSplits(100, ["diana", "carlos"]);
    assert.ok(splits);
    assert.equal(splits.reduce((sum, split) => sum + Math.round(split.amount * 100), 0), 10000);
    assert.equal(sumMoney(splits.map((split) => split.percentage)), 100);
    assert.deepEqual(
      splits.map((split) => split.memberId),
      ["diana", "carlos"],
    );
  });

  it("does not lose cents on a 3-way split", () => {
    const splits = allocateEqualSplits(10, ["a", "b", "c"]);
    assert.ok(splits);
    const cents = splits.reduce((sum, split) => sum + Math.round(split.amount * 100), 0);
    assert.equal(cents, 1000);
    assert.equal(sumMoney(splits.map((split) => split.percentage)), 100);
  });

  it("deduplicates member ids", () => {
    const splits = allocateEqualSplits(90, ["a", "a", "b"]);
    assert.ok(splits);
    assert.equal(splits.length, 2);
  });
});

describe("allocateIncomeBasedSplits", () => {
  it("splits using confirmed income weights and keeps the cent remainder", () => {
    const splits = allocateIncomeBasedSplits(100, [
      { memberId: "carlos", income: 30000 },
      { memberId: "diana", income: 10000 },
    ]);
    assert.ok(splits);
    assert.equal(splits.reduce((sum, split) => sum + Math.round(split.amount * 100), 0), 10000);
    assert.equal(sumMoney(splits.map((split) => split.percentage)), 100);
    assert.equal(splits[0].amount, 75);
    assert.equal(splits[1].amount, 25);
  });

  it("assigns zero to a member with no income this month", () => {
    const splits = allocateIncomeBasedSplits(90, [
      { memberId: "carlos", income: 40000 },
      { memberId: "diana", income: 0 },
    ]);
    assert.ok(splits);
    assert.equal(splits[0].amount, 90);
    assert.equal(splits[1].amount, 0);
    assert.equal(sumMoney(splits.map((split) => split.percentage)), 100);
  });

  it("rejects when every participant has zero confirmed income", () => {
    assert.equal(
      allocateIncomeBasedSplits(80, [
        { memberId: "carlos", income: 0 },
        { memberId: "diana", income: 0 },
      ]),
      null,
    );
  });
});

describe("splitIssue", () => {
  const active = ["diana", "carlos"];

  it("accepts a personal 100% split", () => {
    assert.equal(
      splitIssue({
        amount: 240,
        scope: "personal",
        payerId: "diana",
        splits: [{ memberId: "diana", amount: 240, percentage: 100 }],
        activeMemberIds: active,
      }),
      null,
    );
  });

  it("rejects a personal split that is not the payer", () => {
    assert.equal(
      splitIssue({
        amount: 240,
        scope: "personal",
        payerId: "diana",
        splits: [{ memberId: "carlos", amount: 240, percentage: 100 }],
        activeMemberIds: active,
      }),
      "invalid_split",
    );
  });

  it("rejects shared splits that do not sum to the expense", () => {
    assert.equal(
      splitIssue({
        amount: 100,
        scope: "shared",
        payerId: "diana",
        splits: [
          { memberId: "diana", amount: 40, percentage: 40 },
          { memberId: "carlos", amount: 50, percentage: 60 },
        ],
        activeMemberIds: active,
      }),
      "invalid_split",
    );
  });

  it("rejects an inactive member or a member of another household", () => {
    assert.equal(
      splitIssue({
        amount: 100,
        scope: "shared",
        payerId: "diana",
        splits: [
          { memberId: "diana", amount: 50, percentage: 50 },
          { memberId: "luis", amount: 50, percentage: 50 },
        ],
        activeMemberIds: active,
      }),
      "invalid_split",
    );
  });

  it("rejects duplicate participants and a single shared participant", () => {
    assert.equal(
      splitIssue({
        amount: 100,
        scope: "shared",
        payerId: "diana",
        splits: [
          { memberId: "diana", amount: 50, percentage: 50 },
          { memberId: "diana", amount: 50, percentage: 50 },
        ],
        activeMemberIds: active,
      }),
      "invalid_split",
    );
    assert.equal(
      splitIssue({
        amount: 100,
        scope: "shared",
        payerId: "diana",
        splits: [{ memberId: "diana", amount: 100, percentage: 100 }],
        activeMemberIds: active,
      }),
      "invalid_split",
    );
  });

  it("rejects a negative split amount", () => {
    assert.equal(
      splitIssue({
        amount: 100,
        scope: "shared",
        payerId: "diana",
        splits: [
          { memberId: "diana", amount: 150, percentage: 150 },
          { memberId: "carlos", amount: -50, percentage: -50 },
        ],
        activeMemberIds: active,
      }),
      "invalid_split",
    );
  });
});
