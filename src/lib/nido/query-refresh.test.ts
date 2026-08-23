import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { beginQueryFetch, finishQueryFetch } from "./query-refresh.ts";

describe("beginQueryFetch", () => {
  it("uses initialLoading when there is no data yet", () => {
    const started = beginQueryFetch({ hasData: false, inFlight: false });
    assert.equal(started.accepted, true);
    if (started.accepted) {
      assert.deepEqual(started.flags, { initialLoading: true, refreshing: false });
    }
  });

  it("uses refreshing and keeps the initial-load flag off when data already exists", () => {
    const started = beginQueryFetch({ hasData: true, inFlight: false });
    assert.equal(started.accepted, true);
    if (started.accepted) {
      assert.deepEqual(started.flags, { initialLoading: false, refreshing: true });
    }
  });

  it("ignores a second refresh while one is in flight", () => {
    const first = beginQueryFetch({ hasData: true, inFlight: false });
    assert.equal(first.accepted, true);
    const second = beginQueryFetch({ hasData: true, inFlight: true });
    assert.deepEqual(second, { accepted: false });
    const third = beginQueryFetch({ hasData: true, inFlight: true });
    assert.deepEqual(third, { accepted: false });
  });
});

describe("finishQueryFetch", () => {
  it("returns idle with the new data on success", () => {
    const finished = finishQueryFetch({
      previous: { id: "old" },
      result: { ok: true, data: { id: "new" } },
    });
    assert.deepEqual(finished, {
      data: { id: "new" },
      error: null,
      flags: { initialLoading: false, refreshing: false },
    });
  });

  it("returns idle, keeps previous data, and surfaces the error on failure", () => {
    const finished = finishQueryFetch({
      previous: { id: "old" },
      result: { ok: false, error: "network" },
    });
    assert.deepEqual(finished, {
      data: { id: "old" },
      error: "network",
      flags: { initialLoading: false, refreshing: false },
    });
  });

  it("keeps a null previous value on the first failed load", () => {
    const finished = finishQueryFetch({
      previous: null,
      result: { ok: false, error: "network" },
    });
    assert.equal(finished.data, null);
    assert.equal(finished.error, "network");
    assert.deepEqual(finished.flags, { initialLoading: false, refreshing: false });
  });

  it("walks pull → refreshing → idle on success and keeps data on error", () => {
    const start = beginQueryFetch({ hasData: true, inFlight: false });
    assert.equal(start.accepted, true);
    if (!start.accepted) return;
    assert.equal(start.flags.refreshing, true);

    const ignored = beginQueryFetch({ hasData: true, inFlight: true });
    assert.equal(ignored.accepted, false);

    const failed = finishQueryFetch({
      previous: { id: "kept" },
      result: { ok: false, error: "network" },
    });
    assert.deepEqual(failed.data, { id: "kept" });
    assert.equal(failed.flags.refreshing, false);

    const ok = finishQueryFetch({
      previous: { id: "kept" },
      result: { ok: true, data: { id: "fresh" } },
    });
    assert.deepEqual(ok.data, { id: "fresh" });
    assert.deepEqual(ok.flags, { initialLoading: false, refreshing: false });
  });
});
