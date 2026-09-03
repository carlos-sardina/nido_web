import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCreateRecurringIncomePayload,
  recurrenceEndDateMessage,
  recurrenceFrequencyMessage,
  recurrenceIncomeDescriptionMessage,
} from "./recurrence-input.ts";

const incomeInput = {
  householdId: "h1",
  categoryId: "c1",
  amount: 40000,
  description: "Sueldo",
  startDate: "2026-08-01",
  frequency: "monthly" as const,
  activeMemberIds: ["u1"],
  allowedCategoryIds: ["c1"],
};

describe("buildCreateRecurringIncomePayload", () => {
  it("accepts a valid monthly template and does not invent member_id", () => {
    const result = buildCreateRecurringIncomePayload(incomeInput, "u1");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.frequency, "monthly");
      assert.equal(result.data.startDate, "2026-08-01");
      assert.equal(result.data.endDate, null);
      assert.equal("memberId" in result.data, false);
      assert.equal("createdBy" in result.data, false);
    }
  });

  it("rejects amount, category, frequency, and inverted dates", () => {
    assert.equal(buildCreateRecurringIncomePayload({ ...incomeInput, amount: 0 }, "u1").ok, false);
    assert.equal(
      buildCreateRecurringIncomePayload({ ...incomeInput, categoryId: "other" }, "u1").ok,
      false,
    );
    assert.equal(
      buildCreateRecurringIncomePayload(
        { ...incomeInput, frequency: "daily" as never },
        "u1",
      ).ok,
      false,
    );
    const ended = buildCreateRecurringIncomePayload(
      { ...incomeInput, endDate: "2026-07-01" },
      "u1",
    );
    assert.equal(ended.ok, false);
    if (ended.ok === false) assert.equal(ended.error, "invalid_date");
  });

  it("rejects an empty description", () => {
    const result = buildCreateRecurringIncomePayload({ ...incomeInput, description: "  " }, "u1");
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "invalid_description");
  });

  it("rejects another household membership", () => {
    const result = buildCreateRecurringIncomePayload(
      { ...incomeInput, householdId: "", activeMemberIds: ["u2"] },
      "u1",
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "not_a_member");
  });
});

describe("recurrence field messages", () => {
  it("requires a schema frequency and a valid end date", () => {
    assert.equal(recurrenceFrequencyMessage("monthly"), null);
    assert.match(recurrenceFrequencyMessage("daily") ?? "", /frecuencia/i);
    assert.equal(recurrenceEndDateMessage("", "2026-08-01"), null);
    assert.match(recurrenceEndDateMessage("2026-07-01", "2026-08-01") ?? "", /fin/i);
  });

  it("still requires a description on recurring income templates", () => {
    assert.match(recurrenceIncomeDescriptionMessage("") ?? "", /descripción/i);
    assert.equal(recurrenceIncomeDescriptionMessage("Sueldo"), null);
  });
});
