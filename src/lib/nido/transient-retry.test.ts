import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nidoFail, nidoOk } from "./errors.ts";
import {
  isTransientMyNidoError,
  MY_NIDO_MAX_ATTEMPTS,
  withTransientRetry,
} from "./transient-retry.ts";

describe("isTransientMyNidoError", () => {
  it("retries only network and transient session establishment", () => {
    assert.equal(isTransientMyNidoError("network"), true);
    assert.equal(isTransientMyNidoError("unauthenticated"), true);
    assert.equal(isTransientMyNidoError("already_in_nido"), false);
    assert.equal(isTransientMyNidoError("already_member"), false);
    assert.equal(isTransientMyNidoError("forbidden"), false);
    assert.equal(isTransientMyNidoError("invitation_expired"), false);
    assert.equal(isTransientMyNidoError("invitation_accepted"), false);
    assert.equal(isTransientMyNidoError("invitation_invalid"), false);
    assert.equal(isTransientMyNidoError("invalid_name"), false);
  });
});

describe("withTransientRetry", () => {
  it("retries a first network error and returns the second success", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const result = await withTransientRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) return nidoFail("network");
        return nidoOk({ status: "active" });
      },
      { sleep: async (ms) => { delays.push(ms); } },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.data, { status: "active" });
    assert.equal(attempts, 2);
    assert.equal(delays.length, 1);
  });

  it("returns the last network error after the bounded retry", async () => {
    let attempts = 0;
    const result = await withTransientRetry(
      async () => {
        attempts += 1;
        return nidoFail("network");
      },
      { sleep: async () => undefined },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "network");
    assert.equal(attempts, MY_NIDO_MAX_ATTEMPTS);
    assert.equal(attempts <= 2, true);
  });

  it("does not retry a domain error", async () => {
    let attempts = 0;
    const result = await withTransientRetry(
      async () => {
        attempts += 1;
        return nidoFail("already_in_nido");
      },
      { sleep: async () => { throw new Error("should not sleep"); } },
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "already_in_nido");
    assert.equal(attempts, 1);
  });

  it("does not retry forever", async () => {
    let attempts = 0;
    await withTransientRetry(
      async () => {
        attempts += 1;
        return nidoFail("unauthenticated");
      },
      { maxAttempts: 2, sleep: async () => undefined },
    );
    assert.equal(attempts, 2);
  });

  it("does not delay a successful first attempt", async () => {
    let slept = 0;
    const result = await withTransientRetry(
      async () => nidoOk("ok"),
      { sleep: async () => { slept += 1; } },
    );
    assert.equal(result.ok, true);
    assert.equal(slept, 0);
  });
});
