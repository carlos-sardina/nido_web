import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCreateExpensePayload,
  expenseAmountMessage,
  expenseDescriptionMessage,
  normalizeExpenseDescription,
  parseExpenseAmountInput,
} from "./expense-input.ts";

const members = ["diana", "carlos"];
const categories = ["cat-h1"];

function request(overrides: Partial<Parameters<typeof buildCreateExpensePayload>[0]> = {}) {
  return {
    householdId: "h1",
    categoryId: "cat-h1",
    amount: 700,
    description: "Internet",
    occurredAt: "2026-08-21",
    scope: "personal" as const,
    participantIds: members,
    activeMemberIds: members,
    allowedCategoryIds: categories,
    ...overrides,
  };
}

describe("parseExpenseAmountInput", () => {
  it("parses a valid amount and does not coerce invalid input to 0", () => {
    assert.equal(parseExpenseAmountInput("1200.50"), 1200.5);
    assert.equal(parseExpenseAmountInput("0"), 0);
    assert.equal(parseExpenseAmountInput("abc"), null);
    assert.equal(parseExpenseAmountInput("1e3"), null);
    assert.equal(parseExpenseAmountInput(""), null);
  });
});

describe("expenseAmountMessage", () => {
  it("rejects zero, negative, invalid, and oversized amounts", () => {
    assert.match(expenseAmountMessage(""), /válido/i);
    assert.match(expenseAmountMessage("0"), /válido/i);
    assert.match(expenseAmountMessage("-10"), /negativo/i);
    assert.match(expenseAmountMessage("abc"), /válido/i);
    assert.match(expenseAmountMessage("10.123"), /válido/i);
    assert.match(expenseAmountMessage("99999999999"), /grande/i);
    assert.equal(expenseAmountMessage("700"), null);
  });
});

describe("expense description", () => {
  it("trims and rejects empty or whitespace-only copy", () => {
    assert.equal(normalizeExpenseDescription("  Netflix  "), "Netflix");
    assert.equal(normalizeExpenseDescription("   "), null);
    assert.match(expenseDescriptionMessage("   "), /descripción/i);
  });

  it("keeps unicode and enforces a max length", () => {
    assert.equal(normalizeExpenseDescription("Niño 🎁"), "Niño 🎁");
    assert.equal(normalizeExpenseDescription("a".repeat(81)), null);
  });
});

describe("buildCreateExpensePayload", () => {
  it("builds a personal expense for the current user", () => {
    const result = buildCreateExpensePayload(request(), "diana");
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.data.scope, "personal");
    assert.equal(result.data.splits.length, 1);
    assert.equal(result.data.splits[0].memberId, "diana");
    assert.equal(result.data.splits[0].amount, 700);
    assert.equal(result.data.description, "Internet");
  });

  it("builds a shared equal split among selected members", () => {
    const result = buildCreateExpensePayload(
      request({ scope: "shared", amount: 100, participantIds: members }),
      "diana",
    );
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.data.scope, "shared");
    assert.equal(result.data.splits.length, 2);
    assert.equal(
      result.data.splits.reduce((sum, split) => sum + Math.round(split.amount * 100), 0),
      10000,
    );
  });

  it("rejects amount 0, negative, and non-finite values", () => {
    assert.equal(buildCreateExpensePayload(request({ amount: 0 }), "diana").ok, false);
    assert.equal(buildCreateExpensePayload(request({ amount: -5 }), "diana").ok, false);
    assert.equal(buildCreateExpensePayload(request({ amount: Number.NaN }), "diana").ok, false);
  });

  it("rejects an empty or whitespace description", () => {
    assert.equal(buildCreateExpensePayload(request({ description: "  " }), "diana").ok, false);
  });

  it("requires a category from the active household", () => {
    const missing = buildCreateExpensePayload(request({ categoryId: "" }), "diana");
    assert.equal(missing.ok, false);
    if (missing.ok === false) assert.equal(missing.error, "invalid_category");

    const other = buildCreateExpensePayload(request({ categoryId: "cat-other" }), "diana");
    assert.equal(other.ok, false);
    if (other.ok === false) assert.equal(other.error, "invalid_category");
  });

  it("accepts a valid calendar date including a past day", () => {
    const result = buildCreateExpensePayload(request({ occurredAt: "2026-01-15" }), "diana");
    assert.equal(result.ok, true);
  });

  it("does not invent a future-date restriction", () => {
    const result = buildCreateExpensePayload(request({ occurredAt: "2099-01-01" }), "diana");
    assert.equal(result.ok, true);
  });

  it("rejects an impossible date", () => {
    const result = buildCreateExpensePayload(request({ occurredAt: "2026-02-31" }), "diana");
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "invalid_date");
  });

  it("rejects a shared expense with an inactive or foreign member", () => {
    const result = buildCreateExpensePayload(
      request({ scope: "shared", participantIds: ["diana", "luis"] }),
      "diana",
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "invalid_split");
  });
});
