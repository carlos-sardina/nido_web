import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampedPercent,
  formatCompactMoney,
  formatExactMoney,
  formatSignedMoney,
  formatWholeMoney,
  goalProgressRatio,
  moneyOrZero,
  parseMoney,
  ratioPercent,
  roundMoney,
  sumMoney,
} from "./money.ts";

describe("parseMoney", () => {
  it("parses numbers and numeric strings from Postgres", () => {
    assert.equal(parseMoney(1200), 1200);
    assert.equal(parseMoney("1200.50"), 1200.5);
    assert.equal(parseMoney("0"), 0);
  });

  it("rejects invalid values instead of coercing them to zero", () => {
    assert.equal(parseMoney("abc"), null);
    assert.equal(parseMoney("1e3"), null);
    assert.equal(parseMoney(Number.NaN), null);
    assert.equal(parseMoney(Infinity), null);
    assert.equal(parseMoney(null), null);
    assert.equal(parseMoney(undefined), null);
  });

  it("treats invalid input as zero only through moneyOrZero", () => {
    assert.equal(moneyOrZero("nope"), 0);
    assert.equal(moneyOrZero("40.1"), 40.1);
  });
});

describe("sumMoney", () => {
  it("adds in cents to avoid float drift", () => {
    assert.equal(sumMoney([0.1, 0.2]), 0.3);
    assert.equal(sumMoney(["10.10", 20.2, "0.70"]), 31);
  });

  it("skips unparsable values rather than inventing amounts", () => {
    assert.equal(sumMoney(["12", "nope", null]), 12);
    assert.equal(sumMoney([]), 0);
  });
});

describe("roundMoney", () => {
  it("rounds to two decimals", () => {
    assert.equal(roundMoney(10.126), 10.13);
    assert.equal(roundMoney(10), 10);
  });
});

describe("percent helpers", () => {
  it("does not divide by zero", () => {
    assert.equal(clampedPercent(50, 0), 0);
    assert.equal(clampedPercent(50, -10), 0);
    assert.equal(ratioPercent(50, 0), null);
    assert.equal(goalProgressRatio(100, 0), 0);
    assert.equal(goalProgressRatio(100, -5), 0);
  });

  it("clamps bar percent to 0–100 and allows unbounded copy percent", () => {
    assert.equal(clampedPercent(150, 100), 100);
    assert.equal(ratioPercent(150, 100), 150);
    assert.equal(clampedPercent(-10, 100), 0);
  });

  it("caps goal progress at 1", () => {
    assert.equal(goalProgressRatio(0, 200), 0);
    assert.equal(goalProgressRatio(50, 200), 0.25);
    assert.equal(goalProgressRatio(250, 200), 1);
  });
});

describe("money format", () => {
  it("uses compact k notation consistently", () => {
    assert.equal(formatCompactMoney(35400), "$35.4k");
    assert.equal(formatCompactMoney(20000), "$20k");
    assert.equal(formatCompactMoney(700), "$700");
    assert.equal(formatCompactMoney(0), "$0");
  });

  it("formats featured amounts with grouping", () => {
    assert.equal(formatWholeMoney(120000), "$120,000");
  });

  it("keeps cents on exact amounts and signs balances", () => {
    assert.equal(formatExactMoney(1500), "$1,500");
    assert.equal(formatExactMoney(1500.5), "$1,500.50");
    assert.equal(formatSignedMoney(1500), "+$1,500");
    assert.equal(formatSignedMoney(-1500), "−$1,500");
    assert.equal(formatSignedMoney(0), "$0");
  });
});
