import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  amountToBudgetInput,
  budgetAmountMessage,
  budgetDateMessage,
  budgetMonthInput,
  budgetRangeMessage,
  buildCreateBudgetPayload,
  parseBudgetAmountInput,
  parseBudgetMonthInput,
} from "./budget-input.ts";

const members = ["carlos", "diana"];
const categories = ["cat-expense"];

function request(
  overrides: Partial<Parameters<typeof buildCreateBudgetPayload>[0]> = {},
) {
  return {
    householdId: "h1",
    categoryId: "cat-expense",
    amount: 8000,
    startDate: "2026-08-01",
    activeMemberIds: members,
    allowedCategoryIds: categories,
    ...overrides,
  };
}

describe("budget amount parsing", () => {
  it("does not coerce invalid input to 0", () => {
    assert.equal(parseBudgetAmountInput("8000"), 8000);
    assert.equal(parseBudgetAmountInput("1200.50"), 1200.5);
    assert.equal(parseBudgetAmountInput("0"), 0);
    assert.equal(parseBudgetAmountInput(""), null);
    assert.equal(parseBudgetAmountInput("abc"), null);
    assert.equal(parseBudgetAmountInput("1e3"), null);
    assert.equal(parseBudgetAmountInput("NaN"), null);
    assert.equal(parseBudgetAmountInput("Infinity"), null);
    assert.equal(parseBudgetAmountInput("10.123"), null);
  });

  it("formats an amount for the edit form without coercing invalid values", () => {
    assert.equal(amountToBudgetInput(8000), "8000");
    assert.equal(amountToBudgetInput(8000.5), "8000.50");
  });

  it("rejects empty, zero, negative, invalid, and oversized amounts", () => {
    assert.match(budgetAmountMessage(""), /válido/i);
    assert.match(budgetAmountMessage("0"), /válido/i);
    assert.match(budgetAmountMessage("-10"), /negativo/i);
    assert.match(budgetAmountMessage("abc"), /válido/i);
    assert.match(budgetAmountMessage("10.123"), /válido/i);
    assert.match(budgetAmountMessage("99999999999"), /grande/i);
    assert.equal(budgetAmountMessage("8000"), null);
  });
});

describe("budget period", () => {
  it("accepts a calendar month and a date inside that month", () => {
    const fromMonth = parseBudgetMonthInput("2026-08");
    const fromDate = parseBudgetMonthInput("2026-08-21");
    assert.equal(fromMonth?.start, "2026-08-01");
    assert.equal(fromMonth?.end, "2026-08-31");
    assert.equal(fromDate?.start, "2026-08-01");
    assert.equal(fromDate?.end, "2026-08-31");
    assert.equal(budgetMonthInput("2026-08-01"), "2026-08");
    assert.equal(budgetDateMessage("2026-08"), null);
    assert.equal(budgetDateMessage(""), "El periodo no es válido.");
    assert.equal(budgetDateMessage("2026-13"), "El periodo no es válido.");
    assert.equal(budgetDateMessage("2026-02-31"), "El periodo no es válido.");
  });

  it("rejects a range that is not a full calendar month", () => {
    assert.equal(budgetRangeMessage("2026-08-01", "2026-08-31"), null);
    assert.match(budgetRangeMessage("2026-08-01", "2026-08-15"), /válido/i);
    assert.match(budgetRangeMessage("2026-08-15", "2026-08-01"), /válido/i);
    assert.match(budgetRangeMessage("2026-02-31", "2026-02-31"), /válido/i);
  });
});

describe("buildCreateBudgetPayload", () => {
  it("builds a monthly Nido payload without created_by or member_id", () => {
    const payload = buildCreateBudgetPayload(request(), "carlos");
    assert.equal(payload.ok, true);
    if (payload.ok) {
      assert.equal(payload.data.amount, 8000);
      assert.equal(payload.data.startDate, "2026-08-01");
      assert.equal(payload.data.endDate, "2026-08-31");
      assert.equal(payload.data.categoryId, "cat-expense");
      assert.equal(payload.data.personal, false);
      assert.equal("createdBy" in payload.data, false);
      assert.equal("memberId" in payload.data, false);
    }
  });

  it("marks a personal budget without accepting a client member_id", () => {
    const payload = buildCreateBudgetPayload(request({ personal: true }), "carlos");
    assert.equal(payload.ok, true);
    if (payload.ok) {
      assert.equal(payload.data.personal, true);
      assert.equal("memberId" in payload.data, false);
    }
  });

  it("rejects an inactive member, invalid amount, date, and category", () => {
    assert.equal(buildCreateBudgetPayload(request(), "luis").ok, false);
    assert.equal(buildCreateBudgetPayload(request({ amount: 0 }), "carlos").ok, false);
    assert.equal(buildCreateBudgetPayload(request({ amount: Number.NaN }), "carlos").ok, false);
    assert.equal(
      buildCreateBudgetPayload(request({ amount: Number.POSITIVE_INFINITY }), "carlos").ok,
      false,
    );
    assert.equal(buildCreateBudgetPayload(request({ startDate: "2026-02-31" }), "carlos").ok, false);
    assert.equal(buildCreateBudgetPayload(request({ categoryId: "other" }), "carlos").ok, false);
  });

  it("snaps a mid-month date to the calendar month", () => {
    const payload = buildCreateBudgetPayload(request({ startDate: "2026-08-21" }), "carlos");
    assert.equal(payload.ok, true);
    if (payload.ok) {
      assert.equal(payload.data.startDate, "2026-08-01");
      assert.equal(payload.data.endDate, "2026-08-31");
    }
  });
});
