import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatMoneyInput,
  isPositiveAmount,
  parseMoneyInput,
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

  it("rejects empty, negative, and non-numeric values", () => {
    assert.equal(parseMoneyInput(""), null);
    assert.equal(parseMoneyInput("   "), null);
    assert.equal(parseMoneyInput("-100"), null);
    assert.equal(parseMoneyInput("abc"), null);
  });

  it("treats zero as a valid number", () => {
    assert.equal(parseMoneyInput("0"), 0);
  });
});

describe("validateRequiredAmount / validateOptionalAmount", () => {
  it("requires a valid non-negative amount", () => {
    assert.equal(validateRequiredAmount(""), "Ingresa un monto válido.");
    assert.equal(validateRequiredAmount("-1"), "Ingresa un monto válido.");
    assert.equal(validateRequiredAmount("100"), null);
    assert.equal(validateRequiredAmount("0"), null);
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
});
