import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMonthRange } from "./dates.ts";
import {
  buildMsiInstallmentPlan,
  installmentHasLedgerPayment,
  memberCooperationTotals,
  msiFirstDueDate,
  netPurchaseCost,
  nextPendingDuesMonth,
  openPurchaseBalance,
  type PurchaseRow,
} from "./compras.ts";

describe("msiFirstDueDate", () => {
  it("uses same-month payment when payment day is after cut", () => {
    assert.equal(msiFirstDueDate("2026-11-10", 15, 28), "2026-11-28");
  });

  it("rolls to next cut when purchase is after cut day", () => {
    assert.equal(msiFirstDueDate("2026-11-20", 15, 28), "2026-12-28");
  });

  it("pays next month when payment day is before cut day", () => {
    assert.equal(msiFirstDueDate("2026-11-10", 20, 7), "2026-12-07");
  });
});

describe("buildMsiInstallmentPlan", () => {
  it("splits remainder into the last installment", () => {
    const plan = buildMsiInstallmentPlan(1000, 3, "2026-12-07");
    assert.equal(plan.length, 3);
    assert.deepEqual(
      plan.map((row) => row.amount),
      [333.33, 333.33, 333.34],
    );
    assert.deepEqual(
      plan.map((row) => row.dueDate),
      ["2026-12-07", "2027-01-07", "2027-02-07"],
    );
  });
});

describe("netPurchaseCost", () => {
  it("subtracts expected bonuses", () => {
    assert.equal(
      netPurchaseCost(12000, [{ amount: 1000 }, { amount: 500 }]),
      10500,
    );
  });
});

describe("memberCooperationTotals", () => {
  it("applies share percent to gross and net", () => {
    const purchases = [
      {
        grossAmount: 10000,
        bonuses: [{ amount: 1000 }],
        shares: [
          { memberId: "a", percent: 60 },
          { memberId: "b", percent: 40 },
        ],
      },
    ] as PurchaseRow[];

    const totals = memberCooperationTotals(purchases, ["a", "b"]);
    assert.deepEqual(totals.a, { gross: 6000, net: 5400 });
    assert.deepEqual(totals.b, { gross: 4000, net: 3600 });
  });
});

describe("openPurchaseBalance", () => {
  it("uses unpaid installments for MSI", () => {
    assert.equal(
      openPurchaseBalance({
        grossAmount: 900,
        installments: [
          { amount: 300, paidAt: "2026-11-01" },
          { amount: 300, paidAt: null },
          { amount: 300, paidAt: null },
        ],
        payments: [],
      } as Pick<PurchaseRow, "grossAmount" | "installments" | "payments">),
      600,
    );
  });

  it("uses gross minus payments for cash", () => {
    assert.equal(
      openPurchaseBalance({
        grossAmount: 4000,
        installments: [],
        payments: [{ amount: 1500 }],
      } as Pick<PurchaseRow, "grossAmount" | "installments" | "payments">),
      2500,
    );
  });
});

describe("installmentHasLedgerPayment", () => {
  it("detects linked installment ids", () => {
    assert.equal(
      installmentHasLedgerPayment("i2", [
        { installmentIds: ["i1"] },
        { installmentIds: ["i2", "i3"] },
      ]),
      true,
    );
    assert.equal(installmentHasLedgerPayment("i9", [{ installmentIds: ["i1"] }]), false);
  });
});

describe("nextPendingDuesMonth", () => {
  it("skips empty current month and returns the next with dues", () => {
    const november = getMonthRange(2026, 11);
    const purchases = [
      {
        installments: [
          { amount: 1000, paidAt: null, dueDate: "2026-12-25" },
          { amount: 1000, paidAt: null, dueDate: "2027-01-25" },
        ],
      },
    ] as PurchaseRow[];

    const next = nextPendingDuesMonth(purchases, november);
    assert.equal(next.isCurrent, false);
    assert.equal(next.range.month, 12);
    assert.equal(next.amount, 1000);
  });
});
