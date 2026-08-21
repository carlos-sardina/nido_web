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
    assert.match(userMessageFor("self_invite"), /ti mismo/i);
    assert.match(userMessageFor("invalid_amount"), /monto válido/i);
    assert.match(userMessageFor("invalid_category"), /categoría/i);
    assert.match(userMessageFor("invalid_split"), /división/i);
  });

  it("maps expense RPC messages without exposing Postgres", () => {
    assert.equal(nidoErrorFromUnknown({ message: "nido.invalid_amount" }).code, "invalid_amount");
    assert.equal(nidoErrorFromUnknown({ message: "nido.invalid_category" }).code, "invalid_category");
    assert.equal(nidoErrorFromUnknown({ message: "nido.invalid_split" }).code, "invalid_split");
    assert.equal(
      nidoErrorFromUnknown({ message: "nido.forbidden" }).message.includes("auth.uid"),
      false,
    );
  });
});
