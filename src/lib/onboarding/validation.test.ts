import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyOnboardingData } from "./draft.ts";
import {
  canStartExclusiveAction,
  divisionMethodHint,
  hasSelectedExpense,
  personalExpenseTotal,
  validateDisplayName,
  validateHouseholdName,
  validateIncome,
  validateOnboardingFinalize,
  validateSavings,
} from "./validation.ts";

function sampleData() {
  const data = emptyOnboardingData();
  data.expenses = [
    { name: "Renta", icon: "🏢", selected: false, amount: "", type: "shared", kind: "recurring" },
    { name: "Gym", icon: "🏋️", selected: false, amount: "", type: "personal", kind: "recurring" },
  ];
  return data;
}

describe("onboarding field validation", () => {
  it("requires a household name and display name", () => {
    assert.equal(validateHouseholdName("  "), "Dale un nombre a tu Nido.");
    assert.equal(validateHouseholdName("Casa Roma"), null);
    assert.equal(validateDisplayName(""), "Ingresa el nombre que verán los demás miembros.");
    assert.equal(validateDisplayName("Carlos"), null);
  });

  it("rejects an invalid or negative income", () => {
    assert.equal(validateIncome(""), "Ingresa un monto válido.");
    assert.equal(validateIncome("-10"), "Ingresa un monto válido.");
    assert.equal(validateIncome("40000"), null);
  });

  it("allows empty savings and rejects invalid optional amounts", () => {
    assert.equal(validateSavings("", ""), null);
    assert.equal(validateSavings("1000", ""), null);
    assert.equal(validateSavings("", "abc"), "Ingresa un monto válido.");
  });

  it("requires at least one selected expense with an amount", () => {
    const data = sampleData();
    assert.equal(hasSelectedExpense(data), false);
    data.expenses[0] = { ...data.expenses[0], selected: true, amount: "8000" };
    assert.equal(hasSelectedExpense(data), true);
  });
});

describe("division method requirements", () => {
  it("explains missing income for proportional split", () => {
    const hint = divisionMethodHint({
      method: "proportional",
      income: "",
      personalExpenseTotal: 0,
    });
    assert.match(hint ?? "", /ingreso/);
    assert.match(hint ?? "", /después/);
  });

  it("explains missing personal expenses for capacity split", () => {
    const hint = divisionMethodHint({
      method: "capacity",
      income: "40000",
      personalExpenseTotal: 0,
    });
    assert.match(hint ?? "", /gastos personales/);
  });

  it("does not block equal split", () => {
    assert.equal(
      divisionMethodHint({
        method: "equal",
        income: "",
        personalExpenseTotal: 0,
      }),
      null,
    );
  });
});

describe("finalize and double-submit", () => {
  it("requires name, display name, and income before creating a Nido", () => {
    assert.equal(
      validateOnboardingFinalize({ nestName: "", userName: "Carlos", salary: "1" }),
      "Dale un nombre a tu Nido.",
    );
    assert.equal(
      validateOnboardingFinalize({ nestName: "Casa", userName: "", salary: "1" }),
      "Ingresa el nombre que verán los demás miembros.",
    );
    assert.equal(
      validateOnboardingFinalize({ nestName: "Casa", userName: "Carlos", salary: "" }),
      "Ingresa un monto válido.",
    );
    assert.equal(
      validateOnboardingFinalize({ nestName: "Casa", userName: "Carlos", salary: "40000" }),
      null,
    );
  });

  it("blocks a second submit while the first is in flight", () => {
    assert.equal(canStartExclusiveAction(false), true);
    assert.equal(canStartExclusiveAction(true), false);
  });

  it("sums selected personal expenses for capacity checks", () => {
    const data = sampleData();
    data.expenses[0] = { ...data.expenses[0], selected: true, amount: "1000", type: "personal" };
    data.expenses[1] = { ...data.expenses[1], selected: true, amount: "2000", type: "shared" };
    assert.equal(personalExpenseTotal(data), 1000);
  });
});
