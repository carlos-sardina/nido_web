import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPullResistance,
  canBeginPull,
  isArmed,
  isAtScrollStart,
  nextPullPhase,
  PULL_REFRESH_THRESHOLD_PX,
  pullProgress,
  shouldAcceptRefresh,
  shouldTriggerRefresh,
} from "./pull-to-refresh.ts";

describe("isAtScrollStart", () => {
  it("is true only at scrollTop 0", () => {
    assert.equal(isAtScrollStart(0), true);
    assert.equal(isAtScrollStart(1), false);
    assert.equal(isAtScrollStart(48), false);
  });
});

describe("canBeginPull", () => {
  it("starts only from the top while idle", () => {
    assert.equal(canBeginPull({ scrollTop: 0, refreshing: false }), true);
    assert.equal(canBeginPull({ scrollTop: 12, refreshing: false }), false);
    assert.equal(canBeginPull({ scrollTop: 0, refreshing: true }), false);
  });
});

describe("pull threshold and progress", () => {
  it("uses a mobile threshold in the 64–96 px range", () => {
    assert.equal(PULL_REFRESH_THRESHOLD_PX >= 64, true);
    assert.equal(PULL_REFRESH_THRESHOLD_PX <= 96, true);
  });

  it("reports progress before the threshold and arms at the threshold", () => {
    assert.equal(pullProgress(0), 0);
    assert.equal(pullProgress(PULL_REFRESH_THRESHOLD_PX / 2), 0.5);
    assert.equal(pullProgress(PULL_REFRESH_THRESHOLD_PX), 1);
    assert.equal(pullProgress(PULL_REFRESH_THRESHOLD_PX + 40), 1);
    assert.equal(isArmed(PULL_REFRESH_THRESHOLD_PX - 1), false);
    assert.equal(isArmed(PULL_REFRESH_THRESHOLD_PX), true);
  });

  it("applies resistance so the visual pull is shorter than the finger travel", () => {
    const raw = 80;
    const resisted = applyPullResistance(raw);
    assert.equal(resisted > 0, true);
    assert.equal(resisted < raw, true);
    assert.equal(applyPullResistance(-10), 0);
  });
});

describe("shouldTriggerRefresh", () => {
  it("fires only from the top after the threshold", () => {
    assert.equal(
      shouldTriggerRefresh({
        scrollTop: 0,
        pullDistance: PULL_REFRESH_THRESHOLD_PX,
        refreshing: false,
      }),
      true,
    );
    assert.equal(
      shouldTriggerRefresh({
        scrollTop: 0,
        pullDistance: PULL_REFRESH_THRESHOLD_PX - 1,
        refreshing: false,
      }),
      false,
    );
    assert.equal(
      shouldTriggerRefresh({
        scrollTop: 20,
        pullDistance: PULL_REFRESH_THRESHOLD_PX + 10,
        refreshing: false,
      }),
      false,
    );
  });

  it("does not fire while a refresh is already running", () => {
    assert.equal(
      shouldTriggerRefresh({
        scrollTop: 0,
        pullDistance: PULL_REFRESH_THRESHOLD_PX,
        refreshing: true,
      }),
      false,
    );
    assert.equal(shouldAcceptRefresh(true), false);
    assert.equal(shouldAcceptRefresh(false), true);
  });
});

describe("nextPullPhase", () => {
  it("moves pull → armed → refreshing → idle", () => {
    assert.equal(
      nextPullPhase({ refreshing: false, tracking: true, pullDistance: 20 }),
      "pulling",
    );
    assert.equal(
      nextPullPhase({
        refreshing: false,
        tracking: true,
        pullDistance: PULL_REFRESH_THRESHOLD_PX,
      }),
      "armed",
    );
    assert.equal(
      nextPullPhase({
        refreshing: true,
        tracking: true,
        pullDistance: PULL_REFRESH_THRESHOLD_PX,
      }),
      "refreshing",
    );
    assert.equal(
      nextPullPhase({ refreshing: false, tracking: false, pullDistance: 0 }),
      "idle",
    );
  });
});
