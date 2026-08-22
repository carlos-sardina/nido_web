import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyOnboardingData } from "./draft.ts";
import {
  canStartExclusiveAction,
  DISPLAY_NAME_MAX,
  divisionMethodHint,
  hasSelectedExpense,
  HOUSEHOLD_NAME_MAX,
  personalExpenseTotal,
  validateCustomExpenseName,
  validateDisplayName,
  validateExpenseEntry,
  validateHouseholdName,
  validateIncome,
  validateOnboardingFinalize,
  validateSavings,
} from "./validation.ts";
import { normalizeHouseholdName } from "../nido/rules.ts";

function sampleData() {
  const data = emptyOnboardingData();
  data.expenses = [
    { name: "Renta", icon: "🏢", selected: false, amount: "", type: "shared", kind: "recurring" },
    { name: "Gym", icon: "🏋️", selected: false, amount: "", type: "personal", kind: "recurring" },
  ];
  return data;
}

describe("onboarding field validation", () => {
  it("rejects an empty household name", () => {
    assert.equal(validateHouseholdName(""), "Dale un nombre a tu Nido.");
  });

  it("rejects a whitespace-only household name", () => {
    assert.equal(validateHouseholdName("  "), "Dale un nombre a tu Nido.");
  });

  it("trims a household name", () => {
    assert.equal(validateHouseholdName("  Casa Roma  "), null);
    assert.equal(normalizeHouseholdName("  Casa Roma  "), "Casa Roma");
  });

  it("accepts a unicode household name", () => {
    assert.equal(validateHouseholdName("Nido 🪺"), null);
    assert.equal(validateHouseholdName("家"), null);
    assert.equal(normalizeHouseholdName("José"), "José");
  });

  it("rejects an excessively long household name", () => {
    assert.match(validateHouseholdName("N".repeat(HOUSEHOLD_NAME_MAX + 1)) ?? "", /caracteres/);
  });

  it("allows the same household name for independent Nidos", () => {
    assert.equal(normalizeHouseholdName("Nido"), "Nido");
    assert.equal(normalizeHouseholdName("Casa"), "Casa");
    assert.equal(normalizeHouseholdName("Nido"), normalizeHouseholdName("  Nido  "));
  });

  it("rejects an empty display name", () => {
    assert.equal(validateDisplayName(""), "Ingresa el nombre que verán los demás miembros.");
  });

  it("rejects a whitespace-only display name", () => {
    assert.equal(validateDisplayName("   "), "Ingresa el nombre que verán los demás miembros.");
  });

  it("trims a display name", () => {
    assert.equal(validateDisplayName("  Carlos  "), null);
  });

  it("accepts a unicode display name", () => {
    assert.equal(validateDisplayName("José María"), null);
    assert.equal(validateDisplayName("李"), null);
  });

  it("rejects an excessively long display name", () => {
    assert.match(validateDisplayName("A".repeat(DISPLAY_NAME_MAX + 1)) ?? "", /caracteres/);
  });

  it("rejects an invalid or negative income", () => {
    assert.equal(validateIncome(""), "Ingresa un monto válido.");
    assert.equal(validateIncome("-10"), "El monto no puede ser negativo.");
    assert.equal(validateIncome("40000"), null);
  });

  it("allows empty savings and rejects invalid optional amounts", () => {
    assert.equal(validateSavings("", ""), null);
    assert.equal(validateSavings("1000", ""), null);
    assert.equal(validateSavings("", "abc"), "Ingresa un monto válido.");
  });

  it("requires at least one selected expense with a valid amount", () => {
    const data = sampleData();
    assert.equal(hasSelectedExpense(data), false);
    data.expenses[0] = { ...data.expenses[0], selected: true, amount: "8000" };
    assert.equal(hasSelectedExpense(data), true);
    data.expenses[0] = { ...data.expenses[0], selected: true, amount: "0" };
    assert.equal(hasSelectedExpense(data), false);
  });
});

describe("expense validation", () => {
  it("rejects an empty custom name", () => {
    assert.equal(validateCustomExpenseName(""), "Ingresa el nombre del gasto.");
    assert.equal(validateCustomExpenseName("   "), "Ingresa el nombre del gasto.");
  });

  it("rejects an invalid expense amount", () => {
    assert.equal(validateExpenseEntry({ amount: "abc", type: "personal" }), "Ingresa un monto válido.");
  });

  it("rejects a zero amount when adding an expense", () => {
    assert.equal(validateExpenseEntry({ amount: "0", type: "shared" }), "Ingresa un monto válido.");
  });

  it("rejects a negative expense amount", () => {
    assert.equal(validateExpenseEntry({ amount: "-5", type: "personal" }), "El monto no puede ser negativo.");
  });

  it("requires a personal or shared classification", () => {
    assert.equal(
      validateExpenseEntry({ amount: "100", type: "other" }),
      "Elige si el gasto es personal o compartido.",
    );
    assert.equal(validateExpenseEntry({ amount: "100", type: "personal" }), null);
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

  it("still sums selected personal expenses for onboarding totals", () => {
    const data = sampleData();
    data.expenses[0] = { ...data.expenses[0], selected: true, amount: "1000", type: "personal" };
    data.expenses[1] = { ...data.expenses[1], selected: true, amount: "2000", type: "shared" };
    assert.equal(personalExpenseTotal(data), 1000);
  });
});
