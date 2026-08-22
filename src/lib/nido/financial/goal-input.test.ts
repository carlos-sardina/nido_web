import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  amountToGoalInput,
  buildCreateGoalPayload,
  GOAL_DESCRIPTION_MAX,
  GOAL_NAME_MAX,
  goalAmountMessage,
  goalDateMessage,
  goalDescriptionMessage,
  goalNameMessage,
  normalizeGoalDescription,
  normalizeGoalName,
  parseGoalAmountInput,
} from "./goal-input.ts";

const members = ["diana", "carlos"];

function request(overrides: Partial<Parameters<typeof buildCreateGoalPayload>[0]> = {}) {
  return {
    householdId: "h1",
    name: "Viaje a Japón",
    amount: 80000,
    goalType: "purchase" as const,
    targetDate: "2027-03-01",
    description: "Primavera en Kioto",
    activeMemberIds: members,
    ...overrides,
  };
}

describe("goal amount parsing", () => {
  it("round-trips a stored amount", () => {
    assert.equal(amountToGoalInput(80000), "80000");
    assert.equal(amountToGoalInput(80000.5), "80000.50");
  });

  it("does not coerce invalid input to 0", () => {
    assert.equal(parseGoalAmountInput("80000"), 80000);
    assert.equal(parseGoalAmountInput("0"), 0);
    assert.equal(parseGoalAmountInput("abc"), null);
    assert.equal(parseGoalAmountInput("1e3"), null);
    assert.equal(parseGoalAmountInput(""), null);
  });

  it("rejects zero, negative, invalid, and oversized amounts", () => {
    assert.match(goalAmountMessage(""), /válido/i);
    assert.match(goalAmountMessage("0"), /válido/i);
    assert.match(goalAmountMessage("-10"), /negativo/i);
    assert.match(goalAmountMessage("abc"), /válido/i);
    assert.match(goalAmountMessage("10.123"), /válido/i);
    assert.match(goalAmountMessage("99999999999"), /grande/i);
    assert.equal(goalAmountMessage("80000"), null);
  });
});

describe("goal name", () => {
  it("trims and rejects empty or whitespace-only names", () => {
    assert.equal(normalizeGoalName("  Japón  "), "Japón");
    assert.equal(normalizeGoalName("   "), null);
    assert.match(goalNameMessage("   "), /nombre/i);
  });

  it("enforces a max length", () => {
    assert.equal(normalizeGoalName("a".repeat(GOAL_NAME_MAX)), "a".repeat(GOAL_NAME_MAX));
    assert.equal(normalizeGoalName("a".repeat(GOAL_NAME_MAX + 1)), null);
  });
});

describe("goal description", () => {
  it("treats empty copy as omitted", () => {
    assert.equal(normalizeGoalDescription("   "), null);
    assert.equal(goalDescriptionMessage("   "), null);
    assert.equal(normalizeGoalDescription("Fondo para imprevistos"), "Fondo para imprevistos");
  });

  it("enforces a max length", () => {
    assert.equal(normalizeGoalDescription("a".repeat(GOAL_DESCRIPTION_MAX + 1)), null);
    assert.match(goalDescriptionMessage("a".repeat(GOAL_DESCRIPTION_MAX + 1)), /descripción/i);
  });
});

describe("goal date", () => {
  it("allows an empty optional date", () => {
    assert.equal(goalDateMessage(""), null);
    assert.equal(goalDateMessage("   "), null);
  });

  it("rejects an impossible date", () => {
    assert.match(goalDateMessage("2026-02-31"), /válida/i);
    assert.match(goalDateMessage("not-a-date"), /válida/i);
  });

  it("accepts a valid calendar date", () => {
    assert.equal(goalDateMessage("2027-03-01"), null);
  });
});

describe("buildCreateGoalPayload", () => {
  it("builds a valid goal with optional date and description", () => {
    const result = buildCreateGoalPayload(request(), "diana");
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.data.name, "Viaje a Japón");
    assert.equal(result.data.amount, 80000);
    assert.equal(result.data.goalType, "purchase");
    assert.equal(result.data.targetDate, "2027-03-01");
    assert.equal(result.data.description, "Primavera en Kioto");
    assert.equal("currentAmount" in result.data, false);
  });

  it("omits blank optional fields", () => {
    const result = buildCreateGoalPayload(
      request({ targetDate: "", description: "   " }),
      "diana",
    );
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.data.targetDate, null);
    assert.equal(result.data.description, null);
  });

  it("rejects an empty name", () => {
    const result = buildCreateGoalPayload(request({ name: "   " }), "diana");
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "invalid_name");
  });

  it("rejects amount 0, negative, and non-finite values", () => {
    assert.equal(buildCreateGoalPayload(request({ amount: 0 }), "diana").ok, false);
    assert.equal(buildCreateGoalPayload(request({ amount: -5 }), "diana").ok, false);
    assert.equal(buildCreateGoalPayload(request({ amount: Number.NaN }), "diana").ok, false);
  });

  it("rejects an impossible date", () => {
    const result = buildCreateGoalPayload(request({ targetDate: "2026-02-31" }), "diana");
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "invalid_date");
  });

  it("does not invent a future-date restriction", () => {
    const result = buildCreateGoalPayload(request({ targetDate: "2099-01-01" }), "diana");
    assert.equal(result.ok, true);
  });

  it("rejects a historical member", () => {
    const result = buildCreateGoalPayload(
      request({ activeMemberIds: ["carlos"] }),
      "diana",
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "not_a_member");
  });

  it("rejects a missing household", () => {
    const result = buildCreateGoalPayload(request({ householdId: "" }), "diana");
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "not_a_member");
  });
});
