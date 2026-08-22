import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  amountToIncomeInput,
  buildCreateIncomePayload,
  incomeAmountMessage,
  incomeDateMessage,
  incomeDescriptionMessage,
  normalizeIncomeDescription,
  parseIncomeAmountInput,
} from "./income-input.ts";

const members = ["carlos", "diana"];
const categories = ["cat-income"];

function request(
  overrides: Partial<Parameters<typeof buildCreateIncomePayload>[0]> = {},
) {
  return {
    householdId: "h1",
    categoryId: "cat-income",
    amount: 40000,
    description: "Sueldo",
    occurredAt: "2026-08-21",
    activeMemberIds: members,
    allowedCategoryIds: categories,
    ...overrides,
  };
}

describe("income amount parsing", () => {
  it("does not coerce invalid input to 0", () => {
    assert.equal(parseIncomeAmountInput("40000"), 40000);
    assert.equal(parseIncomeAmountInput("1200.50"), 1200.5);
    assert.equal(parseIncomeAmountInput("0"), 0);
    assert.equal(parseIncomeAmountInput(""), null);
    assert.equal(parseIncomeAmountInput("abc"), null);
    assert.equal(parseIncomeAmountInput("1e3"), null);
    assert.equal(parseIncomeAmountInput("NaN"), null);
    assert.equal(parseIncomeAmountInput("Infinity"), null);
    assert.equal(parseIncomeAmountInput("10.123"), null);
  });

  it("formats an amount for the edit form without coercing invalid values", () => {
    assert.equal(amountToIncomeInput(40000), "40000");
    assert.equal(amountToIncomeInput(40000.5), "40000.50");
  });

  it("rejects empty, zero, negative, invalid, and oversized amounts", () => {
    assert.match(incomeAmountMessage(""), /válido/i);
    assert.match(incomeAmountMessage("0"), /válido/i);
    assert.match(incomeAmountMessage("-10"), /negativo/i);
    assert.match(incomeAmountMessage("abc"), /válido/i);
    assert.match(incomeAmountMessage("10.123"), /válido/i);
    assert.match(incomeAmountMessage("99999999999"), /grande/i);
    assert.equal(incomeAmountMessage("40000"), null);
  });
});

describe("income description", () => {
  it("trims and rejects empty or whitespace-only copy", () => {
    assert.equal(normalizeIncomeDescription("  Sueldo  "), "Sueldo");
    assert.equal(normalizeIncomeDescription("   "), null);
    assert.match(incomeDescriptionMessage("   "), /descripción/i);
  });

  it("keeps unicode and enforces a max length", () => {
    assert.equal(normalizeIncomeDescription("Niño 🎁"), "Niño 🎁");
    assert.equal(normalizeIncomeDescription("a".repeat(81)), null);
    assert.equal(normalizeIncomeDescription("a".repeat(80)), "a".repeat(80));
  });
});

describe("income date", () => {
  it("requires a valid calendar date", () => {
    assert.match(incomeDateMessage(""), /válida/i);
    assert.match(incomeDateMessage("   "), /válida/i);
    assert.match(incomeDateMessage("2026-02-31"), /válida/i);
    assert.match(incomeDateMessage("not-a-date"), /válida/i);
    assert.equal(incomeDateMessage("2026-08-21"), null);
  });
});

describe("buildCreateIncomePayload", () => {
  it("builds a valid income without a client-supplied member id", () => {
    const result = buildCreateIncomePayload(request(), "carlos");
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.data.householdId, "h1");
    assert.equal(result.data.categoryId, "cat-income");
    assert.equal(result.data.amount, 40000);
    assert.equal(result.data.description, "Sueldo");
    assert.equal(result.data.occurredAt, "2026-08-21");
    assert.equal("memberId" in result.data, false);
    assert.equal("createdBy" in result.data, false);
  });

  it("rejects amount 0, negative, NaN, and Infinity", () => {
    assert.equal(buildCreateIncomePayload(request({ amount: 0 }), "carlos").ok, false);
    assert.equal(buildCreateIncomePayload(request({ amount: -5 }), "carlos").ok, false);
    assert.equal(
      buildCreateIncomePayload(request({ amount: Number.NaN }), "carlos").ok,
      false,
    );
    assert.equal(
      buildCreateIncomePayload(request({ amount: Number.POSITIVE_INFINITY }), "carlos").ok,
      false,
    );
  });

  it("rejects an empty or whitespace description", () => {
    const result = buildCreateIncomePayload(request({ description: "  " }), "carlos");
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "invalid_description");
  });

  it("rejects an impossible date", () => {
    const result = buildCreateIncomePayload(request({ occurredAt: "2026-02-31" }), "carlos");
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "invalid_date");
  });

  it("requires a category from the active household", () => {
    const missing = buildCreateIncomePayload(request({ categoryId: "" }), "carlos");
    assert.equal(missing.ok, false);
    if (missing.ok === false) assert.equal(missing.error, "invalid_category");

    const other = buildCreateIncomePayload(request({ categoryId: "cat-other" }), "carlos");
    assert.equal(other.ok, false);
    if (other.ok === false) assert.equal(other.error, "invalid_category");
  });

  it("rejects a historical member", () => {
    const result = buildCreateIncomePayload(
      request({ activeMemberIds: ["diana"] }),
      "carlos",
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "not_a_member");
  });

  it("rejects a missing household", () => {
    const result = buildCreateIncomePayload(request({ householdId: "" }), "carlos");
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "not_a_member");
  });

  it("accepts a valid past calendar date", () => {
    const result = buildCreateIncomePayload(request({ occurredAt: "2026-01-15" }), "carlos");
    assert.equal(result.ok, true);
  });
});
