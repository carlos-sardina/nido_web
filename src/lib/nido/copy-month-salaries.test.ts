import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copyForwardMonthSalariesWithAuth } from "./copy-month-salaries.ts";

describe("copyForwardMonthSalariesWithAuth", () => {
  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await copyForwardMonthSalariesWithAuth({
      getUserId: async () => null,
      rpc: async () => {
        called += 1;
        return { data: 0, error: null };
      },
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(called, 0);
  });

  it("does not send household_id or member_id from the client", async () => {
    const result = await copyForwardMonthSalariesWithAuth({
      getUserId: async () => "u1",
      rpc: async (fn, args) => {
        assert.equal(fn, "copy_forward_month_salaries");
        assert.equal(args, undefined);
        return { data: 2, error: null };
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.copied, 2);
  });

  it("treats a zero copy count as success", async () => {
    const result = await copyForwardMonthSalariesWithAuth({
      getUserId: async () => "u1",
      rpc: async () => ({ data: 0, error: null }),
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.copied, 0);
  });

  it("maps an authorization error from the RPC", async () => {
    const result = await copyForwardMonthSalariesWithAuth({
      getUserId: async () => "u1",
      rpc: async () => ({
        data: null,
        error: { message: "nido.not_a_member", code: "P0001" },
      }),
    });
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "not_a_member");
  });
});
