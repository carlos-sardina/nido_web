import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getCurrentMonthRange,
  shiftMonth,
  todayIso,
} from "./dates.ts";
import {
  ALL_MEMBERS_PAYER,
  amountToExpenseInput,
  buildCreateExpensePayload,
  expenseAmountMessage,
  expenseDateMessage,
  expenseDescriptionMessage,
  normalizeExpenseDescription,
  parseExpenseAmountInput,
  resolveExpenseParticipantIds,
  resolveExpensePayerId,
  showExpenseParticipantPicker,
  showExpensePayerPicker,
} from "./expense-input.ts";

const members = ["diana", "carlos"];
const categories = ["cat-h1"];

function request(overrides: Partial<Parameters<typeof buildCreateExpensePayload>[0]> = {}) {
  return {
    householdId: "h1",
    categoryId: "cat-h1",
    amount: 700,
    description: "Internet",
    occurredAt: todayIso(),
    scope: "personal" as const,
    participantIds: members,
    activeMemberIds: members,
    allowedCategoryIds: categories,
    ...overrides,
  };
}

describe("amountToExpenseInput", () => {
  it("round-trips a stored amount without using floats", () => {
    assert.equal(amountToExpenseInput(700), "700");
    assert.equal(amountToExpenseInput(700.5), "700.50");
  });
});

describe("parseExpenseAmountInput", () => {
  it("parses a valid amount and does not coerce invalid input to 0", () => {
    assert.equal(parseExpenseAmountInput("1200.50"), 1200.5);
    assert.equal(parseExpenseAmountInput("0"), 0);
    assert.equal(parseExpenseAmountInput("abc"), null);
    assert.equal(parseExpenseAmountInput("1e3"), null);
    assert.equal(parseExpenseAmountInput(""), null);
  });
});

describe("expenseAmountMessage", () => {
  it("rejects zero, negative, invalid, and oversized amounts", () => {
    assert.match(expenseAmountMessage(""), /válido/i);
    assert.match(expenseAmountMessage("0"), /válido/i);
    assert.match(expenseAmountMessage("-10"), /negativo/i);
    assert.match(expenseAmountMessage("abc"), /válido/i);
    assert.match(expenseAmountMessage("10.123"), /válido/i);
    assert.match(expenseAmountMessage("99999999999"), /grande/i);
    assert.equal(expenseAmountMessage("700"), null);
  });
});

describe("expense date", () => {
  it("requires a date in the current calendar month", () => {
    const range = getCurrentMonthRange();
    assert.match(expenseDateMessage(""), /válida/i);
    assert.match(expenseDateMessage("2026-02-31"), /válida/i);
    assert.match(expenseDateMessage(shiftMonth(range, -1).end), /mes actual/i);
    assert.match(expenseDateMessage(shiftMonth(range, 1).start), /mes actual/i);
    assert.equal(expenseDateMessage(range.start), null);
    assert.equal(expenseDateMessage(todayIso()), null);
  });
});

describe("expense description", () => {
  it("trims and treats empty or whitespace-only copy as omitted", () => {
    assert.equal(normalizeExpenseDescription("  Netflix  "), "Netflix");
    assert.equal(normalizeExpenseDescription("   "), null);
    assert.equal(expenseDescriptionMessage("   "), null);
    assert.equal(expenseDescriptionMessage(""), null);
  });

  it("keeps unicode and enforces a max length", () => {
    assert.equal(normalizeExpenseDescription("Niño 🎁"), "Niño 🎁");
    assert.equal(normalizeExpenseDescription("a".repeat(81)), null);
    assert.match(expenseDescriptionMessage("a".repeat(81)), /80/);
  });
});

describe("buildCreateExpensePayload", () => {
  it("builds a personal expense for the current user", () => {
    const result = buildCreateExpensePayload(request(), "diana");
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.data.scope, "personal");
    assert.equal(result.data.splits.length, 1);
    assert.equal(result.data.splits[0].memberId, "diana");
    assert.equal(result.data.splits[0].amount, 700);
    assert.equal(result.data.description, "Internet");
  });

  it("builds a shared equal split among selected members", () => {
    const result = buildCreateExpensePayload(
      request({ scope: "shared", amount: 100, participantIds: members }),
      "diana",
    );
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.data.scope, "shared");
    assert.equal(result.data.splits.length, 2);
    assert.equal(
      result.data.splits.reduce((sum, split) => sum + Math.round(split.amount * 100), 0),
      10000,
    );
  });

  it("rejects amount 0, negative, and non-finite values", () => {
    assert.equal(buildCreateExpensePayload(request({ amount: 0 }), "diana").ok, false);
    assert.equal(buildCreateExpensePayload(request({ amount: -5 }), "diana").ok, false);
    assert.equal(buildCreateExpensePayload(request({ amount: Number.NaN }), "diana").ok, false);
  });

  it("accepts an empty or whitespace description", () => {
    const blank = buildCreateExpensePayload(request({ description: "  " }), "diana");
    assert.equal(blank.ok, true);
    if (blank.ok) assert.equal(blank.data.description, null);

    const empty = buildCreateExpensePayload(request({ description: "" }), "diana");
    assert.equal(empty.ok, true);
    if (empty.ok) assert.equal(empty.data.description, null);

    const tooLong = buildCreateExpensePayload(request({ description: "a".repeat(81) }), "diana");
    assert.equal(tooLong.ok, false);
    if (tooLong.ok === false) assert.equal(tooLong.error, "invalid_description");
  });

  it("requires a category from the active household", () => {
    const missing = buildCreateExpensePayload(request({ categoryId: "" }), "diana");
    assert.equal(missing.ok, false);
    if (missing.ok === false) assert.equal(missing.error, "invalid_category");

    const other = buildCreateExpensePayload(request({ categoryId: "cat-other" }), "diana");
    assert.equal(other.ok, false);
    if (other.ok === false) assert.equal(other.error, "invalid_category");
  });

  it("accepts any day in the current calendar month", () => {
    const range = getCurrentMonthRange();
    assert.equal(buildCreateExpensePayload(request({ occurredAt: range.start }), "diana").ok, true);
    assert.equal(buildCreateExpensePayload(request({ occurredAt: range.end }), "diana").ok, true);
  });

  it("rejects a date outside the current month", () => {
    const previous = shiftMonth(getCurrentMonthRange(), -1);
    const next = shiftMonth(getCurrentMonthRange(), 1);
    const past = buildCreateExpensePayload(request({ occurredAt: previous.end }), "diana");
    const future = buildCreateExpensePayload(request({ occurredAt: next.start }), "diana");
    assert.equal(past.ok, false);
    if (past.ok === false) assert.equal(past.error, "invalid_date");
    assert.equal(future.ok, false);
    if (future.ok === false) assert.equal(future.error, "invalid_date");
  });

  it("rejects an impossible date", () => {
    const result = buildCreateExpensePayload(request({ occurredAt: "2026-02-31" }), "diana");
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "invalid_date");
  });

  it("rebuilds personal splits when switching from shared to personal", () => {
    const result = buildCreateExpensePayload(
      request({
        scope: "personal",
        amount: 90,
        participantIds: ["diana", "carlos"],
      }),
      "diana",
    );
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.data.splits.length, 1);
    assert.equal(result.data.splits[0].memberId, "diana");
    assert.equal(result.data.splits[0].amount, 90);
  });

  it("creates equal shared splits when switching from personal to shared", () => {
    const result = buildCreateExpensePayload(
      request({ scope: "shared", amount: 99, participantIds: members }),
      "diana",
    );
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.data.splits.length, 2);
    assert.equal(
      result.data.splits.reduce((sum, split) => sum + Math.round(split.amount * 100), 0),
      9900,
    );
  });

  it("rebuilds splits when participants change", () => {
    const two = buildCreateExpensePayload(
      request({ scope: "shared", amount: 30, participantIds: members }),
      "diana",
    );
    const three = buildCreateExpensePayload(
      request({
        scope: "shared",
        amount: 30,
        participantIds: ["diana", "carlos", "ana"],
        activeMemberIds: ["diana", "carlos", "ana"],
      }),
      "diana",
    );
    assert.equal(two.ok, true);
    assert.equal(three.ok, true);
    if (two.ok === false || three.ok === false) return;
    assert.equal(two.data.splits.length, 2);
    assert.equal(three.data.splits.length, 3);
    assert.equal(
      three.data.splits.reduce((sum, split) => sum + Math.round(split.amount * 100), 0),
      3000,
    );
  });

  it("rebuilds split amounts when the total changes", () => {
    const result = buildCreateExpensePayload(
      request({ scope: "shared", amount: 10, participantIds: members }),
      "diana",
    );
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(
      result.data.splits.reduce((sum, split) => sum + Math.round(split.amount * 100), 0),
      1000,
    );
  });

  it("rejects a shared expense with an inactive or foreign member", () => {
    const result = buildCreateExpensePayload(
      request({ scope: "shared", participantIds: ["diana", "luis"] }),
      "diana",
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "invalid_split");
  });

  it("records a household member as payer even when the writer is someone else", () => {
    const result = buildCreateExpensePayload(
      request({
        scope: "shared",
        amount: 100,
        payerId: "carlos",
        participantIds: members,
      }),
      "diana",
    );
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.data.payerId, "carlos");
    assert.equal(result.data.splits.length, 2);
  });

  it("rejects a payer who is not an active member", () => {
    const result = buildCreateExpensePayload(
      request({ scope: "shared", amount: 100, payerId: "luis", participantIds: members }),
      "diana",
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "not_a_member");
  });

  it("keeps the writer as payer when payerId is omitted", () => {
    const result = buildCreateExpensePayload(request(), "diana");
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.data.payerId, "diana");
  });

  it("stores a null payer when every member paid their share", () => {
    const result = buildCreateExpensePayload(
      request({
        scope: "shared",
        amount: 100,
        payerId: ALL_MEMBERS_PAYER,
        participantIds: members,
      }),
      "diana",
    );
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.data.payerId, null);
    assert.equal(result.data.scope, "shared");
    assert.equal(result.data.splits.length, 2);
  });

  it("rejects all-members payer on a personal expense", () => {
    const result = buildCreateExpensePayload(
      request({ scope: "personal", payerId: ALL_MEMBERS_PAYER }),
      "diana",
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "invalid_split");
  });
});

describe("expense form pickers", () => {
  it("asks who paid on a shared expense when there are at least two members", () => {
    assert.equal(showExpensePayerPicker("shared", 2), true);
    assert.equal(showExpensePayerPicker("shared", 3), true);
    assert.equal(showExpensePayerPicker("personal", 2), false);
    assert.equal(showExpensePayerPicker("shared", 1), false);
    assert.equal(showExpensePayerPicker(null, 2), false);
  });

  it("asks who participates only on a shared expense with more than two members", () => {
    assert.equal(showExpenseParticipantPicker("shared", 3), true);
    assert.equal(showExpenseParticipantPicker("shared", 2), false);
    assert.equal(showExpenseParticipantPicker("personal", 3), false);
    assert.equal(showExpenseParticipantPicker(null, 3), false);
  });

  it("uses every member as a participant when the Nido has two people", () => {
    assert.deepEqual(
      resolveExpenseParticipantIds("shared", ["diana", "carlos"], ["diana"]),
      ["diana", "carlos"],
    );
    assert.deepEqual(
      resolveExpenseParticipantIds("shared", ["diana", "carlos", "ana"], ["diana", "ana"]),
      ["diana", "ana"],
    );
  });

  it("defaults the payer to the current user on a personal expense", () => {
    assert.equal(
      resolveExpensePayerId("personal", "carlos", "diana", ["diana", "carlos"]),
      "diana",
    );
    assert.equal(
      resolveExpensePayerId("shared", "carlos", "diana", ["diana", "carlos"]),
      "carlos",
    );
    assert.equal(
      resolveExpensePayerId("shared", ALL_MEMBERS_PAYER, "diana", ["diana", "carlos"]),
      ALL_MEMBERS_PAYER,
    );
    assert.equal(
      resolveExpensePayerId("shared", "luis", "diana", ["diana", "carlos"]),
      "diana",
    );
  });
});
