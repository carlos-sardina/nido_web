import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyOnboardingData } from "./draft.ts";
import {
  ONBOARDING_INCOME_CATEGORY_NAME,
  ONBOARDING_INCOME_DESCRIPTION,
  buildOnboardingEstimates,
  hasOptionalSavings,
  onboardingEstimateCategoryName,
  planOnboardingFinances,
  selectedEstimatedExpenses,
} from "./financial-plan.ts";
import type { OData } from "../types.ts";
import { DEFAULT_EXPENSE_CATEGORIES } from "../nido/financial/categories.ts";

function minimalDraft(): OData {
  const data = emptyOnboardingData();
  data.nestName = "Casa Roma";
  data.userName = "Carlos";
  data.salary = "40000";
  data.contrib = "equal";
  return data;
}

function completeDraft(): OData {
  const data = minimalDraft();
  data.savings = "12000";
  data.savingsShared = "8000";
  data.expenses = [
    { name: "Renta", icon: "🏢", selected: true, amount: "8000", type: "shared", kind: "recurring" },
  ];
  data.contrib = "equal";
  return data;
}

describe("onboarding financial plan — draft shapes", () => {
  it("maps a complete draft to income, savings, estimates, and split", () => {
    const result = planOnboardingFinances(completeDraft());
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.plan.householdName, "Casa Roma");
    assert.equal(result.plan.displayName, "Carlos");
    assert.equal(result.plan.income.persist, true);
    assert.equal(result.plan.income.amount, 40000);
    assert.equal(result.plan.income.categoryName, ONBOARDING_INCOME_CATEGORY_NAME);
    assert.equal(result.plan.income.description, ONBOARDING_INCOME_DESCRIPTION);
    assert.equal(result.plan.splitMethod, "equal");
    assert.equal(result.plan.savingsPersonal.persist, true);
    assert.equal(result.plan.savingsPersonal.amount, 12000);
    assert.equal(result.plan.savingsPersonal.scope, "personal");
    assert.equal(result.plan.savingsShared.persist, true);
    assert.equal(result.plan.savingsShared.amount, 8000);
    assert.equal(result.plan.savingsShared.scope, "shared");
    assert.equal(result.plan.estimates.length, 1);
    assert.equal(result.plan.estimates[0]?.name, "Renta");
    assert.equal(result.plan.estimates[0]?.type, "shared");
    assert.equal(result.plan.estimates[0]?.amount, 8000);
    assert.deepEqual(result.plan.skipped, []);
  });

  it("maps a minimal draft without inventing savings or estimates", () => {
    const result = planOnboardingFinances(minimalDraft());
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.plan.income.persist, true);
    assert.equal(result.plan.income.amount, 40000);
    assert.equal(result.plan.splitMethod, "equal");
    assert.equal(result.plan.savingsPersonal.persist, false);
    assert.equal(result.plan.savingsShared.persist, false);
    assert.deepEqual(result.plan.estimates, []);
    assert.equal(result.plan.skipped.includes("income_zero"), false);
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

describe("onboarding financial plan — savings", () => {
  it("persists a valid personal savings amount as stock", () => {
    const result = planOnboardingFinances({ ...minimalDraft(), savings: "1500" });
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.plan.savingsPersonal.persist, true);
    assert.equal(result.plan.savingsPersonal.amount, 1500);
    assert.equal(result.plan.savingsPersonal.scope, "personal");
    assert.equal(result.plan.savingsShared.persist, false);
  });

  it("persists a valid shared savings amount as stock", () => {
    const result = planOnboardingFinances({ ...minimalDraft(), savingsShared: "2000" });
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.plan.savingsShared.persist, true);
    assert.equal(result.plan.savingsShared.amount, 2000);
    assert.equal(result.plan.savingsShared.scope, "shared");
  });

  it("persists a zero savings amount as stock", () => {
    const result = planOnboardingFinances({
      ...minimalDraft(),
      savings: "0",
      savingsShared: "0",
    });
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.plan.savingsPersonal.persist, true);
    assert.equal(result.plan.savingsPersonal.amount, 0);
    assert.equal(result.plan.savingsShared.persist, true);
    assert.equal(result.plan.savingsShared.amount, 0);
  });

  it("rejects invalid savings and does not coerce them", () => {
    for (const value of ["abc", "-10", "1e6", "1.234", "Infinity"]) {
      assert.equal(planOnboardingFinances({ ...minimalDraft(), savings: value }).ok, false, value);
      assert.equal(planOnboardingFinances({ ...minimalDraft(), savingsShared: value }).ok, false, value);
    }
  });

  it("normalizes currency formatting before persist", () => {
    const result = planOnboardingFinances({
      ...minimalDraft(),
      savings: "$1,500.50",
      savingsShared: "  800  ",
    });
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.plan.savingsPersonal.amount, 1500.5);
    assert.equal(result.plan.savingsShared.amount, 800);
  });

  it("does not turn savings into income, expense, or a goal", () => {
    const result = planOnboardingFinances({
      ...minimalDraft(),
      savings: "1500",
      savingsShared: "2000",
    });
    assert.equal(hasOptionalSavings({ savings: "1500", savingsShared: "2000" }), true);
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.plan.income.amount, 40000);
    assert.equal(result.plan.income.persist, true);
    assert.deepEqual(result.plan.estimates, []);
    assert.equal("goal" in result.plan, false);
    assert.equal("expense" in result.plan, false);
  });
});

describe("onboarding financial plan — estimates", () => {
  it("maps a shared estimate to a household budget payload", () => {
    const data = completeDraft();
    const result = planOnboardingFinances(data);
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.plan.estimates[0]?.type, "shared");
    assert.equal(result.plan.estimates[0]?.amount, 8000);
    assert.equal(result.plan.estimates[0]?.name, "Renta");
  });

  it("maps a personal estimate to a personal budget payload", () => {
    const data = minimalDraft();
    data.expenses = [
      { name: "Gym", icon: "🏋️", selected: true, amount: "800", type: "personal", kind: "recurring" },
    ];
    const result = planOnboardingFinances(data);
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.plan.estimates[0]?.type, "personal");
    assert.equal(result.plan.estimates[0]?.amount, 800);
    assert.equal(result.plan.estimates[0]?.name, "Gym");
  });

  it("keeps the estimate name and does not map it to a default catalog alias", () => {
    assert.equal(onboardingEstimateCategoryName("  Renta  "), "Renta");
    assert.equal(onboardingEstimateCategoryName("Spotify"), "Spotify");
    assert.equal(onboardingEstimateCategoryName("Supermercado"), "Supermercado");
    const defaults = DEFAULT_EXPENSE_CATEGORIES.map((row) => row.name);
    assert.equal(defaults.includes("Renta"), false);
    assert.equal(defaults.includes("Spotify"), false);
    assert.equal(defaults.includes("Supermercado"), false);
    assert.notEqual(onboardingEstimateCategoryName("Renta"), "Vivienda");
    assert.notEqual(onboardingEstimateCategoryName("Spotify"), "Entretenimiento");
    assert.notEqual(onboardingEstimateCategoryName("Supermercado"), "Despensa");
    assert.notEqual(onboardingEstimateCategoryName("Supermercado"), "Comida");
  });

  it("reuses a matching default name without renaming it", () => {
    assert.equal(onboardingEstimateCategoryName("Restaurantes"), "Restaurantes");
    assert.equal(onboardingEstimateCategoryName("Limpieza"), "Limpieza");
    assert.equal(onboardingEstimateCategoryName("Mascotas"), "Mascotas");
    assert.ok(DEFAULT_EXPENSE_CATEGORIES.some((row) => row.name === "Restaurantes"));
  });

  it("skips blank and zero estimates and rejects invalid selected amounts", () => {
    const data = minimalDraft();
    data.expenses = [
      { name: "Renta", icon: "🏢", selected: true, amount: "", type: "shared", kind: "recurring" },
      { name: "Gym", icon: "🏋️", selected: true, amount: "0", type: "personal", kind: "recurring" },
      { name: "Spotify", icon: "🎵", selected: false, amount: "200", type: "personal", kind: "recurring" },
    ];
    const selected = selectedEstimatedExpenses(data);
    assert.equal(selected.length, 1);
    const built = buildOnboardingEstimates(data);
    assert.equal(built.ok, true);
    if (built.ok) assert.deepEqual(built.estimates, []);

    const invalid = planOnboardingFinances({
      ...minimalDraft(),
      expenses: [
        { name: "Renta", icon: "🏢", selected: true, amount: "-5", type: "shared", kind: "recurring" },
      ],
    });
    assert.equal(invalid.ok, false);
  });

  it("sums two estimates that resolve to the same name and scope", () => {
    const data = minimalDraft();
    data.expenses = [
      { name: "Renta", icon: "🏢", selected: true, amount: "8000", type: "shared", kind: "recurring" },
      { name: "renta", icon: "🏠", selected: true, amount: "2000", type: "shared", kind: "recurring" },
    ];
    const built = buildOnboardingEstimates(data);
    assert.equal(built.ok, true);
    if (built.ok === false) return;
    assert.equal(built.estimates.length, 1);
    assert.equal(built.estimates[0]?.amount, 10000);
    assert.equal(built.estimates[0]?.type, "shared");
  });

  it("does not create an expense payload from estimates", () => {
    const result = planOnboardingFinances(completeDraft());
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal("expenses" in result.plan, false);
    assert.ok(result.plan.estimates.every((row) => row.type === "shared" || row.type === "personal"));
  });
});

describe("onboarding financial plan — division", () => {
  it("persists equal and proportional", () => {
    const equal = planOnboardingFinances({ ...minimalDraft(), contrib: "equal" });
    const proportional = planOnboardingFinances({ ...minimalDraft(), contrib: "proportional" });
    assert.equal(equal.ok, true);
    assert.equal(proportional.ok, true);
    if (equal.ok) assert.equal(equal.plan.splitMethod, "equal");
    if (proportional.ok) assert.equal(proportional.plan.splitMethod, "proportional");
  });

  it("rejects capacity and any other method", () => {
    const capacity = planOnboardingFinances({
      ...minimalDraft(),
      contrib: "capacity" as OData["contrib"],
    });
    const other = planOnboardingFinances({
      ...minimalDraft(),
      contrib: "percentage" as OData["contrib"],
    });
    assert.equal(capacity.ok, false);
    assert.equal(other.ok, false);
  });

  it("defaults the draft to a valid product method, never capacity", () => {
    const data = emptyOnboardingData();
    assert.ok(data.contrib === "equal" || data.contrib === "proportional");
    assert.notEqual(data.contrib, "capacity");
  });
});
