import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyOnboardingData } from "./draft.ts";
import {
  ONBOARDING_INCOME_CATEGORY_NAME,
  ONBOARDING_INCOME_DESCRIPTION,
  hasOptionalSavings,
  planOnboardingFinances,
  selectedEstimatedExpenses,
} from "./financial-plan.ts";
import type { OData } from "../types.ts";

function minimalDraft(): OData {
  const data = emptyOnboardingData();
  data.nestName = "Casa Roma";
  data.userName = "Carlos";
  data.salary = "40000";
  return data;
}

function completeDraft(): OData {
  const data = minimalDraft();
  data.freelance = "5000";
  data.savings = "12000";
  data.savingsType = "both";
  data.savingsShared = "8000";
  data.expenses = [
    { name: "Renta", icon: "🏢", selected: true, amount: "8000", type: "shared", kind: "recurring" },
  ];
  data.contrib = "equal";
  return data;
}

describe("onboarding financial plan — draft shapes", () => {
  it("maps a complete draft to one income and skips the rest", () => {
    const result = planOnboardingFinances(completeDraft());
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.plan.householdName, "Casa Roma");
    assert.equal(result.plan.displayName, "Carlos");
    assert.equal(result.plan.income.persist, true);
    assert.equal(result.plan.income.amount, 40000);
    assert.equal(result.plan.income.categoryName, ONBOARDING_INCOME_CATEGORY_NAME);
    assert.equal(result.plan.income.description, ONBOARDING_INCOME_DESCRIPTION);
    assert.deepEqual(result.plan.skipped, [
      "freelance",
      "savings_personal",
      "savings_shared",
      "estimated_expenses",
      "division_method",
    ]);
  });

  it("maps a minimal draft to the same income persist decision", () => {
    const result = planOnboardingFinances(minimalDraft());
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.plan.income.persist, true);
    assert.equal(result.plan.income.amount, 40000);
    assert.ok(result.plan.skipped.includes("division_method"));
    assert.equal(result.plan.skipped.includes("savings_personal"), false);
    assert.equal(result.plan.skipped.includes("estimated_expenses"), false);
  });

  it("rejects a partially complete draft before any persist decision", () => {
    assert.equal(planOnboardingFinances({
      ...minimalDraft(),
      nestName: "",
    }).ok, false);
    assert.equal(planOnboardingFinances({
      ...minimalDraft(),
      userName: "",
    }).ok, false);
    assert.equal(planOnboardingFinances({
      ...minimalDraft(),
      salary: "",
    }).ok, false);
  });
});

describe("onboarding financial plan — income", () => {
  it("accepts a valid monthly income and documents Sueldo", () => {
    const result = planOnboardingFinances(minimalDraft());
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.plan.income.categoryName, "Sueldo");
    assert.equal(result.plan.income.description, "Ingreso mensual neto");
    assert.equal(result.plan.income.persist, true);
  });

  it("rejects an invalid income", () => {
    for (const salary of ["abc", "-10", "1e6", "1.234", "Infinity"]) {
      const result = planOnboardingFinances({ ...minimalDraft(), salary });
      assert.equal(result.ok, false, salary);
    }
  });

  it("does not persist a zero income as a movement", () => {
    const result = planOnboardingFinances({ ...minimalDraft(), salary: "0" });
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.plan.income.persist, false);
    assert.equal(result.plan.income.amount, 0);
    assert.ok(result.plan.skipped.includes("income_zero"));
  });
});

describe("onboarding financial plan — savings, estimates, division", () => {
  it("treats valid savings as optional draft-only amounts", () => {
    const data = { ...minimalDraft(), savings: "1500", savingsShared: "2000" };
    assert.equal(hasOptionalSavings(data), true);
    const result = planOnboardingFinances(data);
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.ok(result.plan.skipped.includes("savings_personal"));
    assert.ok(result.plan.skipped.includes("savings_shared"));
  });

  it("does not turn estimated monthly expenses into persistable rows", () => {
    const data = completeDraft();
    const selected = selectedEstimatedExpenses(data);
    assert.equal(selected.length, 1);
    assert.equal(selected[0]?.name, "Renta");
    const result = planOnboardingFinances(data);
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.ok(result.plan.skipped.includes("estimated_expenses"));
  });

  it("keeps the division method as a draft preference", () => {
    const equal = planOnboardingFinances({ ...minimalDraft(), contrib: "equal" });
    const proportional = planOnboardingFinances({ ...minimalDraft(), contrib: "proportional" });
    assert.equal(equal.ok, true);
    assert.equal(proportional.ok, true);
    if (equal.ok) assert.ok(equal.plan.skipped.includes("division_method"));
    if (proportional.ok) assert.ok(proportional.plan.skipped.includes("division_method"));
  });
});
