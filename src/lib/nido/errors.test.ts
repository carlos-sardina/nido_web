import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NidoError, nidoErrorFromUnknown, userMessageFor } from "./errors.ts";

describe("nidoErrorFromUnknown", () => {
  it("maps stable RPC messages to domain errors", () => {
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.already_in_nido" }).code,
      "already_in_nido",
    );
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.invitation_expired" }).code,
      "invitation_expired",
    );
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.invitation_accepted" }).code,
      "invitation_accepted",
    );
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.invitation_invalid" }).code,
      "invitation_invalid",
    );
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.already_member" }).code,
      "already_member",
    );
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.last_owner" }).code,
      "last_owner",
    );
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.cannot_transfer_to_self" }).code,
      "cannot_transfer_to_self",
    );
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.invalid_transfer_target" }).code,
      "invalid_transfer_target",
    );
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.cannot_remove_self" }).code,
      "cannot_remove_self",
    );
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.invalid_remove_target" }).code,
      "invalid_remove_target",
    );
  });

  it("maps a duplicate pending invitation without exposing Postgres", () => {
    const error = nidoErrorFromUnknown({
      message: "duplicate key value violates unique constraint \"household_invitations_pending_email_idx\"",
      code: "23505",
    });
    assert.equal(error.code, "invite_pending");
    assert.equal(error.message, userMessageFor("invite_pending"));
    assert.equal(error.message.includes("duplicate key"), false);
  });

  it("does not expose raw Postgres text to users", () => {
    const error = nidoErrorFromUnknown({
      message: "duplicate key value violates unique constraint",
      code: "23505",
    });
    assert.equal(error.code, "already_in_nido");
    assert.equal(error.message.includes("duplicate key"), false);
    assert.equal(error instanceof NidoError, true);
  });

  it("keeps invitation copy in Spanish", () => {
    assert.match(userMessageFor("invitation_invalid"), /no es válida/i);
    assert.match(userMessageFor("invitation_expired"), /expiró/i);
    assert.match(userMessageFor("invitation_accepted"), /ya fue aceptada/i);
    assert.match(userMessageFor("already_in_nido"), /un Nido/i);
    assert.match(userMessageFor("already_member"), /este Nido/i);
    assert.match(userMessageFor("cannot_transfer_to_self"), /ti mismo/i);
    assert.match(userMessageFor("invalid_transfer_target"), /miembro activo/i);
    assert.match(userMessageFor("cannot_remove_self"), /Salir del Nido/i);
    assert.match(userMessageFor("invalid_remove_target"), /eliminar/i);
    assert.match(userMessageFor("last_owner"), /transfiere la propiedad/i);
    assert.match(userMessageFor("invalid_amount"), /monto válido/i);
    assert.match(userMessageFor("invalid_category"), /categoría/i);
    assert.match(userMessageFor("invalid_split"), /división/i);
    assert.match(userMessageFor("invalid_visibility"), /visibles al Nido/i);
  });

  it("maps expense RPC messages without exposing Postgres", () => {
    assert.equal(nidoErrorFromUnknown({ message: "nido.invalid_amount" }).code, "invalid_amount");
    assert.equal(nidoErrorFromUnknown({ message: "nido.invalid_category" }).code, "invalid_category");
    assert.equal(nidoErrorFromUnknown({ message: "nido.invalid_split" }).code, "invalid_split");
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.invalid_visibility" }).code,
      "invalid_visibility",
    );
    assert.equal(nidoErrorFromUnknown({ message: "nido.expense_not_found" }).code, "expense_not_found");
    assert.equal(nidoErrorFromUnknown({ message: "nido.expense_deleted" }).code, "expense_deleted");
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.expense_has_refunds" }).code,
      "expense_has_refunds",
    );
    assert.match(userMessageFor("expense_has_refunds"), /devoluciones/i);
    assert.match(userMessageFor("expense_not_found"), /encontramos/i);
    assert.match(userMessageFor("expense_deleted"), /eliminado/i);
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.goal_not_found" }).code,
      "goal_not_found",
    );
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.goal_archived" }).code,
      "goal_archived",
    );
    assert.match(userMessageFor("goal_not_found"), /meta/i);
    assert.match(userMessageFor("goal_archived"), /archivada/i);
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.contribution_not_found" }).code,
      "contribution_not_found",
    );
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.contribution_deleted" }).code,
      "contribution_deleted",
    );
    assert.match(userMessageFor("contribution_not_found"), /aportación/i);
    assert.match(userMessageFor("contribution_deleted"), /eliminada/i);
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.income_not_found" }).code,
      "income_not_found",
    );
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.income_deleted" }).code,
      "income_deleted",
    );
    assert.match(userMessageFor("income_not_found"), /ingreso/i);
    assert.match(userMessageFor("income_deleted"), /eliminado/i);
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.budget_not_found" }).code,
      "budget_not_found",
    );
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.budget_deleted" }).code,
      "budget_deleted",
    );
    assert.match(userMessageFor("budget_not_found"), /presupuesto/i);
    assert.match(userMessageFor("budget_deleted"), /eliminado/i);
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.recurrence_not_found" }).code,
      "recurrence_not_found",
    );
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.recurrence_inactive" }).code,
      "recurrence_inactive",
    );
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.recurrence_not_due" }).code,
      "recurrence_not_due",
    );
    assert.equal(
      nidoErrorFromUnknown({
        message: 'duplicate key value violates unique constraint "incomes_recurring_occurrence_live_idx"',
        code: "23505",
      }).code,
      "conflict",
    );
    assert.equal(
      nidoErrorFromUnknown({
        message: 'duplicate key value violates unique constraint "categories_name_type_idx"',
        code: "23505",
      }).code,
      "conflict",
    );
    assert.match(userMessageFor("recurrence_not_due"), /periodo/i);
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.forbidden" }).message.includes("auth.uid"),
      false,
    );
  });
});
