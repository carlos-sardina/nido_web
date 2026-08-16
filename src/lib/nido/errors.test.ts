import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NidoError, nidoErrorFromUnknown } from "./errors.ts";

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
      nidoErrorFromUnknown({ message: "nido.last_owner" }).code,
      "last_owner",
    );
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
});
