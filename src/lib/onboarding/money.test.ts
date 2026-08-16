import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatMoneyInput,
  isPositiveAmount,
  MAX_MONEY_AMOUNT,
  parseMoneyInput,
  validateExpenseAmount,
  validateOptionalAmount,
  validateRequiredAmount,
} from "./validation.ts";

describe("parseMoneyInput", () => {
  it("parses a plain number", () => {
    assert.equal(parseMoneyInput("40000"), 40000);
  });

  it("parses formatted Mexican amounts", () => {
    assert.equal(parseMoneyInput("$40,000"), 40000);
    assert.equal(parseMoneyInput("1,250.50"), 1250.5);
  });

  it("treats empty optional input as empty, not zero", () => {
    assert.equal(parseMoneyInput(""), null);
    assert.equal(parseMoneyInput("   "), null);
    assert.equal(parseMoneyInput(null), null);
  });

  it("rejects negative values", () => {
    assert.equal(parseMoneyInput("-100"), null);
    assert.equal(parseMoneyInput(" -1"), null);
  });

  it("rejects NaN and Infinity", () => {
    assert.equal(parseMoneyInput("NaN"), null);
    assert.equal(parseMoneyInput("Infinity"), null);
    assert.equal(parseMoneyInput("-Infinity"), null);
    assert.equal(parseMoneyInput("1e308"), null);
  });

  it("rejects malformed numeric strings without coercing them to zero", () => {
    assert.equal(parseMoneyInput("abc"), null);
    assert.equal(parseMoneyInput("12abc"), null);
    assert.notEqual(parseMoneyInput("abc"), 0);
  });

  it("rejects excessive decimals instead of rounding them", () => {
    assert.equal(parseMoneyInput("1.234"), null);
    assert.equal(parseMoneyInput("10.50"), 10.5);
  });

  it("treats zero as a valid number", () => {
    assert.equal(parseMoneyInput("0"), 0);
  });
});

describe("validateRequiredAmount / validateOptionalAmount", () => {
  it("requires a valid amount", () => {
    assert.equal(validateRequiredAmount(""), "Ingresa un monto válido.");
    assert.equal(validateRequiredAmount("100"), null);
    assert.equal(validateRequiredAmount("0"), null);
  });

  it("rejects a negative amount with a dedicated message", () => {
    assert.equal(validateRequiredAmount("-1"), "El monto no puede ser negativo.");
  });

  it("rejects an excessive amount", () => {
    assert.equal(validateRequiredAmount(String(MAX_MONEY_AMOUNT + 1)), "El monto es demasiado grande.");
  });

  it("allows an empty optional amount", () => {
    assert.equal(validateOptionalAmount(""), null);
    assert.equal(validateOptionalAmount("nope"), "Ingresa un monto válido.");
    assert.equal(validateOptionalAmount("2500"), null);
  });

  it("formats money for display without losing decimals", () => {
    assert.equal(formatMoneyInput("40000"), "40,000");
    assert.equal(formatMoneyInput("1250.5"), "1,250.5");
    assert.equal(formatMoneyInput(""), "");
  });

  it("treats a positive amount as selectable", () => {
    assert.equal(isPositiveAmount("0"), false);
    assert.equal(isPositiveAmount("1"), true);
    assert.equal(isPositiveAmount(""), false);
  });

  it("rejects zero when adding an expense", () => {
    assert.equal(validateExpenseAmount("0"), "Ingresa un monto válido.");
    assert.equal(validateExpenseAmount("25"), null);
    assert.equal(validateExpenseAmount("-3"), "El monto no puede ser negativo.");
  });
});
