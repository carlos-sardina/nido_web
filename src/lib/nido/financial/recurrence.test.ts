import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addRecurrencePeriod,
  canMutateRecurrence,
  frequencyLabel,
  isRecurrenceDue,
  isRecurrenceFrequency,
  recurrenceStatus,
} from "./recurrence.ts";

describe("recurrence frequencies (schema enum only)", () => {
  it("accepts weekly, biweekly, monthly, and yearly", () => {
    assert.equal(isRecurrenceFrequency("weekly"), true);
    assert.equal(isRecurrenceFrequency("biweekly"), true);
    assert.equal(isRecurrenceFrequency("monthly"), true);
    assert.equal(isRecurrenceFrequency("yearly"), true);
    assert.equal(isRecurrenceFrequency("daily"), false);
    assert.equal(frequencyLabel("biweekly"), "Quincenal");
  });

  it("advances weekly and biweekly by calendar days", () => {
    assert.equal(addRecurrencePeriod("2026-08-21", "weekly"), "2026-08-28");
    assert.equal(addRecurrencePeriod("2026-08-21", "biweekly"), "2026-09-04");
  });

  it("clamps monthly and yearly to the last day of the month", () => {
    assert.equal(addRecurrencePeriod("2026-01-31", "monthly"), "2026-02-28");
    assert.equal(addRecurrencePeriod("2026-01-15", "monthly", 31), "2026-02-28");
    assert.equal(addRecurrencePeriod("2024-02-29", "yearly"), "2025-02-28");
  });

  it("rejects an invalid date", () => {
    assert.equal(addRecurrencePeriod("2026-02-31", "monthly"), null);
  });
});

describe("recurrence status and due date", () => {
  it("marks a live due rule as active and due", () => {
    const rule = { isActive: true, nextOccurrence: "2026-08-01", today: "2026-08-21" };
    assert.equal(recurrenceStatus(rule), "active");
    assert.equal(isRecurrenceDue(rule), true);
  });

  it("does not treat a future next_occurrence as due", () => {
    const rule = { isActive: true, nextOccurrence: "2026-12-01", today: "2026-08-21" };
    assert.equal(isRecurrenceDue(rule), false);
  });

  it("pauses without deleting previous movements", () => {
    const rule = { isActive: false, nextOccurrence: "2026-08-01", today: "2026-08-21" };
    assert.equal(recurrenceStatus(rule), "paused");
    assert.equal(isRecurrenceDue(rule), false);
  });

  it("ends when end_date is before today or before the next cursor", () => {
    assert.equal(
      recurrenceStatus({
        isActive: true,
        nextOccurrence: "2026-09-01",
        endDate: "2026-08-01",
        today: "2026-08-21",
      }),
      "ended",
    );
    assert.equal(
      isRecurrenceDue({
        isActive: true,
        nextOccurrence: "2026-09-01",
        endDate: "2026-08-15",
        today: "2026-08-21",
      }),
      false,
    );
  });

  it("allows only the creator to mutate", () => {
    assert.equal(canMutateRecurrence({ createdBy: "carlos" }, "carlos"), true);
    assert.equal(canMutateRecurrence({ createdBy: "carlos" }, "diana"), false);
    assert.equal(canMutateRecurrence({ createdBy: "carlos" }, null), false);
  });
});
