import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import type { CreateIncomeRequest } from "./financial/income-input.ts";
import {
  completeJoinInvitationWithAuth,
  joinDisplayNameDecision,
  joinIncomeCategoryId,
  joinIncomeDecision,
  type JoinIncomeCategory,
  type JoinInvitationAuth,
} from "./join-invitation.ts";

const TOKEN = "aaaaaaaaaaaaaaaa";
const TODAY = "2026-08-31";
const INCOME_AMOUNT = 40000;

const accepted = {
  householdId: "hh-1",
  householdName: "Casa Roma",
};

const sueldo: JoinIncomeCategory = { id: "cat-sueldo", name: "Sueldo" };

function auth(input: {
  userId?: string | null;
  email?: string | null;
  profileName?: string | null;
  profileError?: "network" | "unauthenticated";
  updateName?: (name: string) => NidoResult<{ id: string; display_name: string }>;
  accept?: (token: string) => NidoResult<{ householdId: string; householdName: string }>;
  categories?: JoinIncomeCategory[];
  categoriesError?: "network";
  createIncomeResult?: NidoResult<{ id: string }>;
  onUpdate?: (name: string) => void;
  onAccept?: (token: string) => void;
  onListCategories?: (householdId: string) => void;
  onCreateIncome?: (request: CreateIncomeRequest) => void;
}): JoinInvitationAuth {
  return {
    getUserId: async () => (input.userId === undefined ? "user-1" : input.userId),
    getUserEmail: async () =>
      input.email === undefined ? "nido.smoke.diana.924@nido.test" : input.email,
    getProfileDisplayName: async () => {
      if (input.profileError) return nidoFail(input.profileError);
      return nidoOk(input.profileName === undefined ? "nido.smoke.diana.924" : input.profileName);
    },
    updateDisplayName: async (name) => {
      input.onUpdate?.(name);
      return input.updateName
        ? input.updateName(name)
        : nidoOk({ id: "user-1", display_name: name });
    },
    acceptInvitation: async (token) => {
      input.onAccept?.(token);
      return input.accept ? input.accept(token) : nidoOk(accepted);
    },
    listIncomeCategories: async (householdId) => {
      input.onListCategories?.(householdId);
      if (input.categoriesError) return nidoFail(input.categoriesError);
      return nidoOk(input.categories ?? [sueldo]);
    },
    createIncome: async (request) => {
      input.onCreateIncome?.(request);
      return input.createIncomeResult ?? nidoOk({ id: "inc-1" });
    },
    todayIso: () => TODAY,
  };
}

describe("joinDisplayNameDecision", () => {
  it("persists a valid entered name when the profile still has the email fallback", () => {
    assert.deepEqual(
      joinDisplayNameDecision({
        enteredName: "  Diana  ",
        currentDisplayName: "nido.smoke.diana.924",
        email: "nido.smoke.diana.924@nido.test",
      }),
      { kind: "persist", displayName: "Diana" },
    );
  });

  it("keeps accented names and rejects empty input", () => {
    assert.deepEqual(
      joinDisplayNameDecision({
        enteredName: "Sofía",
        currentDisplayName: "nido.test.user",
        email: "nido.test.user@nido.test",
      }),
      { kind: "persist", displayName: "Sofía" },
    );
    assert.equal(
      joinDisplayNameDecision({
        enteredName: "   ",
        currentDisplayName: "nido.test.user",
        email: "nido.test.user@nido.test",
      }).kind,
      "need_name",
    );
  });

  it("does not overwrite a valid chosen name", () => {
    assert.deepEqual(
      joinDisplayNameDecision({
        enteredName: "Sofía",
        currentDisplayName: "Carlos",
        email: "carlos@example.com",
      }),
      { kind: "skip" },
    );
    assert.deepEqual(
      joinDisplayNameDecision({
        enteredName: undefined,
        currentDisplayName: "Carlos",
        email: "carlos@example.com",
      }),
      { kind: "skip" },
    );
  });
});

describe("joinIncomeDecision", () => {
  it("persists a positive monthly amount", () => {
    assert.deepEqual(joinIncomeDecision(40000), { kind: "persist", amount: 40000 });
    assert.deepEqual(joinIncomeDecision(40000.129), { kind: "persist", amount: 40000.13 });
  });

  it("skips persist when the amount is zero", () => {
    assert.deepEqual(joinIncomeDecision(0), { kind: "skip" });
  });

  it("rejects missing or invalid amounts", () => {
    assert.equal(joinIncomeDecision(undefined).kind, "need_income");
    assert.equal(joinIncomeDecision(null).kind, "need_income");
    assert.equal(joinIncomeDecision(Number.NaN).kind, "need_income");
    assert.equal(joinIncomeDecision(-1).kind, "need_income");
    assert.equal(joinIncomeDecision(10_000_000_000).kind, "need_income");
  });
});

describe("joinIncomeCategoryId", () => {
  it("matches the onboarding Sueldo catalog name without inventing aliases", () => {
    assert.equal(joinIncomeCategoryId([sueldo, { id: "cat-extra", name: "Extra" }]), "cat-sueldo");
    assert.equal(joinIncomeCategoryId([{ id: "cat-s", name: "  sueldo  " }]), "cat-s");
    assert.equal(joinIncomeCategoryId([{ id: "cat-extra", name: "Extra" }]), null);
  });
});

describe("completeJoinInvitationWithAuth", () => {
  it("rejects an unauthenticated caller before name, income, or accept", async () => {
    let updates = 0;
    let accepts = 0;
    let incomes = 0;
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN, enteredName: "Diana", incomeAmount: INCOME_AMOUNT },
      auth({
        userId: null,
        onUpdate: () => {
          updates += 1;
        },
        onAccept: () => {
          accepts += 1;
        },
        onCreateIncome: () => {
          incomes += 1;
        },
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(updates, 0);
    assert.equal(accepts, 0);
    assert.equal(incomes, 0);
  });

  it("rejects an invalid token before name, income, or accept", async () => {
    let updates = 0;
    let accepts = 0;
    const result = await completeJoinInvitationWithAuth(
      { token: "bad", enteredName: "Diana", incomeAmount: INCOME_AMOUNT },
      auth({
        onUpdate: () => {
          updates += 1;
        },
        onAccept: () => {
          accepts += 1;
        },
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invitation_invalid");
    assert.equal(updates, 0);
    assert.equal(accepts, 0);
  });

  it("persists the entered name before a successful accept", async () => {
    const names: string[] = [];
    const tokens: string[] = [];
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN, enteredName: "  Diana  ", incomeAmount: INCOME_AMOUNT },
      auth({
        onUpdate: (name) => names.push(name),
        onAccept: (token) => tokens.push(token),
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.householdId, "hh-1");
      assert.equal(result.data.persistedDisplayName, "Diana");
      assert.equal(result.data.persistedIncomeId, "inc-1");
    }
    assert.deepEqual(names, ["Diana"]);
    assert.deepEqual(tokens, [TOKEN]);
  });

  it("does not accept when the fallback profile has no entered name", async () => {
    let accepts = 0;
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN, incomeAmount: INCOME_AMOUNT },
      auth({
        onAccept: () => {
          accepts += 1;
        },
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invalid_name");
    assert.equal(accepts, 0);
  });

  it("does not accept when updating the display name fails", async () => {
    let accepts = 0;
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN, enteredName: "Diana", incomeAmount: INCOME_AMOUNT },
      auth({
        updateName: () => nidoFail("network"),
        onAccept: () => {
          accepts += 1;
        },
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "network");
    assert.equal(accepts, 0);
  });

  it("does not accept when monthly income is missing or invalid", async () => {
    let updates = 0;
    let accepts = 0;
    const missing = await completeJoinInvitationWithAuth(
      { token: TOKEN, enteredName: "Diana" },
      auth({
        onUpdate: () => {
          updates += 1;
        },
        onAccept: () => {
          accepts += 1;
        },
      }),
    );
    const invalid = await completeJoinInvitationWithAuth(
      { token: TOKEN, enteredName: "Diana", incomeAmount: -10 },
      auth({
        onUpdate: () => {
          updates += 1;
        },
        onAccept: () => {
          accepts += 1;
        },
      }),
    );
    assert.equal(missing.ok, false);
    if (missing.ok === false) assert.equal(missing.error.code, "invalid_amount");
    assert.equal(invalid.ok, false);
    if (invalid.ok === false) assert.equal(invalid.error.code, "invalid_amount");
    assert.equal(updates, 0);
    assert.equal(accepts, 0);
  });

  it("skips the profile update when the current name is already valid", async () => {
    let updates = 0;
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN, enteredName: "Sofía", incomeAmount: INCOME_AMOUNT },
      auth({
        profileName: "Carlos",
        email: "carlos@example.com",
        onUpdate: () => {
          updates += 1;
        },
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.persistedDisplayName, null);
    assert.equal(updates, 0);
  });

  it("accepts once for an authenticated user with a valid name", async () => {
    let accepts = 0;
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN, incomeAmount: INCOME_AMOUNT },
      auth({
        profileName: "Carlos",
        email: "carlos@example.com",
        onAccept: () => {
          accepts += 1;
        },
      }),
    );
    assert.equal(result.ok, true);
    assert.equal(accepts, 1);
  });

  it("persists monthly income after a successful accept", async () => {
    const requests: CreateIncomeRequest[] = [];
    const households: string[] = [];
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN, incomeAmount: INCOME_AMOUNT },
      auth({
        profileName: "Carlos",
        email: "carlos@example.com",
        onListCategories: (householdId) => households.push(householdId),
        onCreateIncome: (request) => requests.push(request),
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.persistedIncomeId, "inc-1");
    assert.deepEqual(households, ["hh-1"]);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.householdId, "hh-1");
    assert.equal(requests[0]?.categoryId, "cat-sueldo");
    assert.equal(requests[0]?.amount, INCOME_AMOUNT);
    assert.equal(requests[0]?.description, "Ingreso mensual neto");
    assert.equal(requests[0]?.occurredAt, TODAY);
    assert.deepEqual(requests[0]?.activeMemberIds, ["user-1"]);
    assert.deepEqual(requests[0]?.allowedCategoryIds, ["cat-sueldo"]);
  });

  it("does not persist income when the declared amount is zero", async () => {
    let lists = 0;
    let incomes = 0;
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN, incomeAmount: 0 },
      auth({
        profileName: "Carlos",
        email: "carlos@example.com",
        onListCategories: () => {
          lists += 1;
        },
        onCreateIncome: () => {
          incomes += 1;
        },
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.persistedIncomeId, null);
    assert.equal(lists, 0);
    assert.equal(incomes, 0);
  });

  it("still joins when income persist fails after accept", async () => {
    let accepts = 0;
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN, incomeAmount: INCOME_AMOUNT },
      auth({
        profileName: "Carlos",
        email: "carlos@example.com",
        createIncomeResult: nidoFail("network"),
        onAccept: () => {
          accepts += 1;
        },
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.householdId, "hh-1");
      assert.equal(result.data.persistedIncomeId, null);
    }
    assert.equal(accepts, 1);
  });

  it("still joins when the Sueldo category is missing", async () => {
    let incomes = 0;
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN, incomeAmount: INCOME_AMOUNT },
      auth({
        profileName: "Carlos",
        email: "carlos@example.com",
        categories: [{ id: "cat-extra", name: "Extra" }],
        onCreateIncome: () => {
          incomes += 1;
        },
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.persistedIncomeId, null);
    assert.equal(incomes, 0);
  });

  it("does not persist income when accept fails", async () => {
    let incomes = 0;
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN, incomeAmount: INCOME_AMOUNT },
      auth({
        profileName: "Carlos",
        email: "carlos@example.com",
        accept: () => nidoFail("invitation_expired"),
        onCreateIncome: () => {
          incomes += 1;
        },
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "invitation_expired");
    assert.equal(incomes, 0);
  });

  it("returns already_in_nido from accept without a second membership call", async () => {
    let accepts = 0;
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN, incomeAmount: INCOME_AMOUNT },
      auth({
        profileName: "Carlos",
        email: "carlos@example.com",
        accept: () => nidoFail("already_in_nido"),
        onAccept: () => {
          accepts += 1;
        },
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "already_in_nido");
    assert.equal(accepts, 1);
  });

  it("returns already_member from accept without collapsing it into already_in_nido", async () => {
    const result = await completeJoinInvitationWithAuth(
      { token: TOKEN, incomeAmount: INCOME_AMOUNT },
      auth({
        profileName: "Carlos",
        email: "carlos@example.com",
        accept: () => nidoFail("already_member"),
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "already_member");
  });

  it("keeps invitation expired and accepted as distinct errors", async () => {
    const expired = await completeJoinInvitationWithAuth(
      { token: TOKEN, incomeAmount: INCOME_AMOUNT },
      auth({
        profileName: "Carlos",
        email: "carlos@example.com",
        accept: () => nidoFail("invitation_expired"),
      }),
    );
    const used = await completeJoinInvitationWithAuth(
      { token: TOKEN, incomeAmount: INCOME_AMOUNT },
      auth({
        profileName: "Carlos",
        email: "carlos@example.com",
        accept: () => nidoFail("invitation_accepted"),
      }),
    );
    assert.equal(expired.ok, false);
    if (expired.ok === false) assert.equal(expired.error.code, "invitation_expired");
    assert.equal(used.ok, false);
    if (used.ok === false) assert.equal(used.error.code, "invitation_accepted");
  });

  it("does not accept a second time after a successful join", async () => {
    let accepts = 0;
    const deps = auth({
      profileName: "Carlos",
      email: "carlos@example.com",
      onAccept: () => {
        accepts += 1;
      },
    });
    const first = await completeJoinInvitationWithAuth(
      { token: TOKEN, incomeAmount: INCOME_AMOUNT },
      deps,
    );
    assert.equal(first.ok, true);
    assert.equal(accepts, 1);
  });
});
