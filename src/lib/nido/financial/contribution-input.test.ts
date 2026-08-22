import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCreateContributionPayload,
  contributionAmountMessage,
  contributionDateMessage,
  parseContributionAmountInput,
} from "./contribution-input.ts";

const members = ["carlos", "diana"];
const goals = ["g-carlos", "g-diana"];

function request(
  overrides: Partial<Parameters<typeof buildCreateContributionPayload>[0]> = {},
) {
  return {
    householdId: "h1",
    goalId: "g-carlos",
    amount: 500,
    contributedAt: "2026-08-21",
    activeMemberIds: members,
    allowedGoalIds: goals,
    ...overrides,
  };
}

describe("contribution amount parsing", () => {
  it("does not coerce invalid input to 0", () => {
    assert.equal(parseContributionAmountInput("500"), 500);
    assert.equal(parseContributionAmountInput("0"), 0);
    assert.equal(parseContributionAmountInput(""), null);
    assert.equal(parseContributionAmountInput("abc"), null);
    assert.equal(parseContributionAmountInput("1e3"), null);
    assert.equal(parseContributionAmountInput("NaN"), null);
    assert.equal(parseContributionAmountInput("Infinity"), null);
    assert.equal(parseContributionAmountInput("10.123"), null);
  });

  it("rejects empty, zero, negative, invalid, and oversized amounts", () => {
    assert.match(contributionAmountMessage(""), /válido/i);
    assert.match(contributionAmountMessage("0"), /válido/i);
    assert.match(contributionAmountMessage("-10"), /negativo/i);
    assert.match(contributionAmountMessage("abc"), /válido/i);
    assert.match(contributionAmountMessage("10.123"), /válido/i);
    assert.match(contributionAmountMessage("99999999999"), /grande/i);
    assert.equal(contributionAmountMessage("500"), null);
  });
});

describe("contribution date", () => {
  it("requires a valid calendar date", () => {
    assert.match(contributionDateMessage(""), /válida/i);
    assert.match(contributionDateMessage("   "), /válida/i);
    assert.match(contributionDateMessage("2026-02-31"), /válida/i);
    assert.match(contributionDateMessage("not-a-date"), /válida/i);
    assert.equal(contributionDateMessage("2026-08-21"), null);
  });
});

describe("buildCreateContributionPayload", () => {
  it("builds a valid contribution without a client-supplied member id", () => {
    const result = buildCreateContributionPayload(request(), "diana");
    assert.equal(result.ok, true);
    if (result.ok === false) return;
    assert.equal(result.data.goalId, "g-carlos");
    assert.equal(result.data.amount, 500);
    assert.equal(result.data.contributedAt, "2026-08-21");
    assert.equal("memberId" in result.data, false);
    assert.equal("createdBy" in result.data, false);
    assert.equal("householdId" in result.data, false);
  });

  it("allows an amount that would exceed the goal target", () => {
    const result = buildCreateContributionPayload(request({ amount: 999999 }), "carlos");
    assert.equal(result.ok, true);
  });

  it("rejects amount 0, negative, NaN, and Infinity", () => {
    assert.equal(buildCreateContributionPayload(request({ amount: 0 }), "carlos").ok, false);
    assert.equal(buildCreateContributionPayload(request({ amount: -5 }), "carlos").ok, false);
    assert.equal(
      buildCreateContributionPayload(request({ amount: Number.NaN }), "carlos").ok,
      false,
    );
    assert.equal(
      buildCreateContributionPayload(request({ amount: Number.POSITIVE_INFINITY }), "carlos").ok,
      false,
    );
  });

  it("rejects an impossible date", () => {
    const result = buildCreateContributionPayload(
      request({ contributedAt: "2026-02-31" }),
      "carlos",
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "invalid_date");
  });

  it("rejects a missing goal, another household's goal, and an archived goal", () => {
    const missing = buildCreateContributionPayload(request({ goalId: "nope" }), "carlos");
    assert.equal(missing.ok, false);
    if (missing.ok === false) assert.equal(missing.error, "goal_not_found");

    const otherHousehold = buildCreateContributionPayload(
      request({ goalId: "g-other-nido" }),
      "carlos",
    );
    assert.equal(otherHousehold.ok, false);
    if (otherHousehold.ok === false) assert.equal(otherHousehold.error, "goal_not_found");

    const archived = buildCreateContributionPayload(
      request({ goalId: "g-archived", allowedGoalIds: ["g-carlos"] }),
      "carlos",
    );
    assert.equal(archived.ok, false);
    if (archived.ok === false) assert.equal(archived.error, "goal_not_found");
  });

  it("rejects a historical member", () => {
    const result = buildCreateContributionPayload(
      request({ activeMemberIds: ["diana"] }),
      "carlos",
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "not_a_member");
  });

  it("rejects a missing household", () => {
    const result = buildCreateContributionPayload(request({ householdId: "" }), "carlos");
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error, "not_a_member");
  });

  it("lets an active member contribute to a goal created by someone else", () => {
    const result = buildCreateContributionPayload(request({ goalId: "g-diana" }), "carlos");
    assert.equal(result.ok, true);
  });
});
