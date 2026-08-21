import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatRelativeActivityDate,
  getCurrentMonthRange,
  getMonthRange,
  greetingForNow,
  isCalendarDate,
  isDateInRange,
  isoDate,
  NIDO_TIMEZONE,
  todayIso,
  zonedDateParts,
} from "./dates.ts";

describe("getMonthRange", () => {
  it("returns inclusive calendar bounds for a 31-day month", () => {
    const range = getMonthRange(2026, 8);
    assert.equal(range.start, "2026-08-01");
    assert.equal(range.end, "2026-08-31");
    assert.equal(range.month, 8);
    assert.equal(range.year, 2026);
    assert.equal(range.timeZone, NIDO_TIMEZONE);
    assert.match(range.label, /agosto de 2026/i);
  });

  it("handles February in a non-leap year", () => {
    const range = getMonthRange(2026, 2);
    assert.equal(range.start, "2026-02-01");
    assert.equal(range.end, "2026-02-28");
  });

  it("handles February in a leap year", () => {
    const range = getMonthRange(2024, 2);
    assert.equal(range.end, "2024-02-29");
  });
});

describe("getCurrentMonthRange", () => {
  it("uses America/Mexico_City, not UTC, at the month boundary", () => {
    // 2026-09-01 04:00 UTC = 2026-08-31 22:00 in Mexico City (UTC-6).
    const stillAugust = getCurrentMonthRange(new Date("2026-09-01T04:00:00.000Z"));
    assert.equal(stillAugust.month, 8);
    assert.equal(stillAugust.start, "2026-08-01");
    assert.equal(stillAugust.end, "2026-08-31");

    // 2026-09-01 07:00 UTC = 2026-09-01 01:00 in Mexico City.
    const september = getCurrentMonthRange(new Date("2026-09-01T07:00:00.000Z"));
    assert.equal(september.month, 9);
    assert.equal(september.start, "2026-09-01");
    assert.equal(september.end, "2026-09-30");
  });
});

describe("isDateInRange", () => {
  const range = getMonthRange(2026, 8);

  it("includes the first and last day", () => {
    assert.equal(isDateInRange("2026-08-01", range), true);
    assert.equal(isDateInRange("2026-08-31", range), true);
  });

  it("excludes adjacent days", () => {
    assert.equal(isDateInRange("2026-07-31", range), false);
    assert.equal(isDateInRange("2026-09-01", range), false);
  });
});

describe("greetingForNow", () => {
  it("returns Buenos días before noon in Mexico City", () => {
    assert.equal(greetingForNow(new Date("2026-08-21T16:00:00.000Z")), "Buenos días");
  });

  it("returns Buenas tardes in the afternoon", () => {
    assert.equal(greetingForNow(new Date("2026-08-21T20:00:00.000Z")), "Buenas tardes");
  });

  it("returns Buenas noches at night", () => {
    assert.equal(greetingForNow(new Date("2026-08-22T03:00:00.000Z")), "Buenas noches");
  });
});

describe("formatRelativeActivityDate", () => {
  const now = new Date("2026-08-21T18:00:00.000Z");

  it("labels the same calendar day as Hoy", () => {
    assert.equal(formatRelativeActivityDate("2026-08-21", null, now), "Hoy");
  });

  it("uses hours when created_at is recent on the same day", () => {
    assert.equal(
      formatRelativeActivityDate("2026-08-21", "2026-08-21T16:00:00.000Z", now),
      "Hace 2h",
    );
  });

  it("labels the previous calendar day as Ayer", () => {
    assert.equal(formatRelativeActivityDate("2026-08-20", null, now), "Ayer");
  });
});

describe("isCalendarDate / todayIso", () => {
  it("accepts a real calendar day and rejects impossible dates", () => {
    assert.equal(isCalendarDate("2026-08-21"), true);
    assert.equal(isCalendarDate("2026-02-31"), false);
    assert.equal(isCalendarDate("2026-13-01"), false);
    assert.equal(isCalendarDate("08-21-2026"), false);
  });

  it("uses America/Mexico_City for today, not UTC", () => {
    // 2026-08-22 05:00 UTC = 2026-08-21 23:00 in Mexico City (UTC-6).
    assert.equal(todayIso(new Date("2026-08-22T05:00:00.000Z")), "2026-08-21");
    assert.equal(todayIso(new Date("2026-08-22T07:00:00.000Z")), "2026-08-22");
  });
});
