import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  copiedSalaryOccurredAt,
  isCopyableSalaryIncome,
  salaryAlreadyRepresentedInTarget,
  salariesToCopy,
  salariesToCopyAcrossMonths,
} from "./copy-salaries.ts";
import { getMonthRange } from "./dates.ts";
import type { IncomeRow } from "./types.ts";

const july = getMonthRange(2026, 7);
const august = getMonthRange(2026, 8);
const september = getMonthRange(2026, 9);
const sueldoIds = new Set(["sueldo"]);
const members = new Set(["carlos", "diana"]);

function income(
  partial: Partial<IncomeRow> & Pick<IncomeRow, "id" | "amount" | "occurredAt">,
): IncomeRow {
  return {
    householdId: "h1",
    memberId: "carlos",
    categoryId: "sueldo",
    description: "Nómina",
    recurringId: null,
    copiedFromId: null,
    createdBy: partial.memberId ?? "carlos",
    createdAt: `${partial.occurredAt}T12:00:00.000Z`,
    deletedAt: null,
    category: { id: "sueldo", name: "Sueldo", icon: "💰" },
    member: null,
    ...partial,
  };
}

describe("copiedSalaryOccurredAt", () => {
  it("keeps the same day of month", () => {
    assert.equal(copiedSalaryOccurredAt("2026-08-15", september), "2026-09-15");
  });

  it("clamps the 31st into February", () => {
    assert.equal(copiedSalaryOccurredAt("2026-01-31", getMonthRange(2026, 2)), "2026-02-28");
  });
});

describe("isCopyableSalaryIncome", () => {
  const filter = { sueldoCategoryIds: sueldoIds, activeMemberIds: members };

  it("accepts a live Sueldo of an active member", () => {
    assert.equal(isCopyableSalaryIncome(income({ id: "a", amount: 100, occurredAt: "2026-08-01" }), filter), true);
  });

  it("rejects Extra, recurring occurrences, deletes, and left members", () => {
    assert.equal(
      isCopyableSalaryIncome(
        income({
          id: "extra",
          amount: 100,
          occurredAt: "2026-08-01",
          categoryId: "extra",
          category: { id: "extra", name: "Extra", icon: "✨" },
        }),
        filter,
      ),
      false,
    );
    assert.equal(
      isCopyableSalaryIncome(
        income({ id: "rec", amount: 100, occurredAt: "2026-08-01", recurringId: "r1" }),
        filter,
      ),
      false,
    );
    assert.equal(
      isCopyableSalaryIncome(
        income({
          id: "del",
          amount: 100,
          occurredAt: "2026-08-01",
          deletedAt: "2026-08-02T00:00:00.000Z",
        }),
        filter,
      ),
      false,
    );
    assert.equal(
      isCopyableSalaryIncome(
        income({ id: "left", amount: 100, occurredAt: "2026-08-01", memberId: "sofia" }),
        filter,
      ),
      false,
    );
  });
});

describe("salaryAlreadyRepresentedInTarget", () => {
  it("treats a deleted descendant as already handled", () => {
    const source = income({ id: "aug", amount: 40000, occurredAt: "2026-08-05" });
    const deleted = income({
      id: "sep",
      amount: 40000,
      occurredAt: "2026-09-05",
      copiedFromId: "aug",
      deletedAt: "2026-09-06T00:00:00.000Z",
    });
    assert.equal(salaryAlreadyRepresentedInTarget(source, [deleted]), true);
  });

  it("matches a live Sueldo the user already typed this month", () => {
    const source = income({ id: "aug", amount: 40000, occurredAt: "2026-08-05" });
    const typed = income({ id: "sep", amount: 40000, occurredAt: "2026-09-01" });
    assert.equal(salaryAlreadyRepresentedInTarget(source, [typed]), true);
  });
});

describe("salariesToCopy", () => {
  const base = {
    sourceRange: august,
    targetRange: september,
    sueldoCategoryIds: sueldoIds,
    activeMemberIds: members,
  };

  it("copies each member's Sueldo and skips Extra", () => {
    const copies = salariesToCopy({
      ...base,
      sources: [
        income({ id: "c-aug", amount: 40000, occurredAt: "2026-08-15", memberId: "carlos" }),
        income({
          id: "d-aug",
          amount: 28000,
          occurredAt: "2026-08-10",
          memberId: "diana",
          createdBy: "diana",
        }),
        income({
          id: "bonus",
          amount: 5000,
          occurredAt: "2026-08-20",
          categoryId: "extra",
          category: { id: "extra", name: "Extra", icon: "✨" },
        }),
      ],
      targets: [],
    });
    assert.deepEqual(
      copies.map((row) => ({ sourceId: row.sourceId, amount: row.amount, occurredAt: row.occurredAt })),
      [
        { sourceId: "c-aug", amount: 40000, occurredAt: "2026-09-15" },
        { sourceId: "d-aug", amount: 28000, occurredAt: "2026-09-10" },
      ],
    );
  });

  it("does not copy again after a delete in the target month", () => {
    const source = income({ id: "aug", amount: 40000, occurredAt: "2026-08-15" });
    const copies = salariesToCopy({
      ...base,
      sources: [source],
      targets: [
        income({
          id: "sep",
          amount: 40000,
          occurredAt: "2026-09-15",
          copiedFromId: "aug",
          deletedAt: "2026-09-16T00:00:00.000Z",
        }),
      ],
    });
    assert.deepEqual(copies, []);
  });
});

describe("salariesToCopyAcrossMonths", () => {
  const filter = {
    currentRange: september,
    sueldoCategoryIds: sueldoIds,
    activeMemberIds: members,
    lookbackMonths: 3,
  };

  it("fills skipped months from the last live Sueldo", () => {
    const copies = salariesToCopyAcrossMonths({
      ...filter,
      incomes: [income({ id: "jul", amount: 40000, occurredAt: "2026-07-15" })],
    });
    assert.deepEqual(
      copies.map((row) => row.occurredAt),
      ["2026-08-15", "2026-09-15"],
    );
    assert.equal(copies[0]?.sourceId, "jul");
    assert.equal(copies[1]?.amount, 40000);
  });

  it("stops the chain after a deleted copy so past months stay unchanged", () => {
    const copies = salariesToCopyAcrossMonths({
      ...filter,
      incomes: [
        income({ id: "jul", amount: 40000, occurredAt: july.start }),
        income({
          id: "aug",
          amount: 40000,
          occurredAt: "2026-08-01",
          copiedFromId: "jul",
          deletedAt: "2026-08-02T00:00:00.000Z",
        }),
      ],
    });
    assert.deepEqual(copies, []);
  });

  it("uses the edited current-month amount for the next copy, not the past month", () => {
    const copies = salariesToCopyAcrossMonths({
      ...filter,
      currentRange: getMonthRange(2026, 10),
      lookbackMonths: 2,
      incomes: [
        income({ id: "aug", amount: 40000, occurredAt: "2026-08-15" }),
        income({
          id: "sep",
          amount: 45000,
          occurredAt: "2026-09-15",
          copiedFromId: "aug",
        }),
      ],
    });
    assert.equal(copies.length, 1);
    assert.equal(copies[0]?.sourceId, "sep");
    assert.equal(copies[0]?.amount, 45000);
    assert.equal(copies[0]?.occurredAt, "2026-10-15");
  });
});
