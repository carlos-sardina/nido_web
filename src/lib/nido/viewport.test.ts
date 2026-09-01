import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APP_HEIGHT_VAR,
  APP_OFFSET_TOP_VAR,
  applyAppViewport,
  isViewportZoomed,
  readAppViewport,
  resolveShellOffsetTop,
  shouldPreventPinchZoom,
} from "./viewport.ts";

describe("readAppViewport", () => {
  it("uses the visual viewport when it has a positive height", () => {
    assert.deepEqual(
      readAppViewport({ height: 640, offsetTop: 24, scale: 1 }, 844),
      { height: 640, offsetTop: 24, scale: 1 },
    );
  });

  it("falls back when visual viewport is missing or empty", () => {
    assert.deepEqual(readAppViewport(null, 844), {
      height: 844,
      offsetTop: 0,
      scale: 1,
    });
    assert.deepEqual(readAppViewport({ height: 0, offsetTop: -8 }, 800), {
      height: 800,
      offsetTop: 0,
      scale: 1,
    });
  });
});

describe("applyAppViewport", () => {
  it("writes pixel CSS variables for the app shell", () => {
    const properties = new Map<string, string>();
    applyAppViewport(
      { style: { setProperty: (name, value) => void properties.set(name, value) } },
      { height: 720, offsetTop: 12 },
    );
    assert.equal(properties.get(APP_HEIGHT_VAR), "720px");
    assert.equal(properties.get(APP_OFFSET_TOP_VAR), "12px");
  });
});

describe("pinch and leftover zoom", () => {
  it("blocks multi-touch pinch and treats off-1 scale as zoomed", () => {
    assert.equal(shouldPreventPinchZoom(1), false);
    assert.equal(shouldPreventPinchZoom(2), true);
    assert.equal(isViewportZoomed(1), false);
    assert.equal(isViewportZoomed(1.15), true);
  });
});

describe("resolveShellOffsetTop", () => {
  it("keeps the shell pinned at 0 unless leftover zoom is present", () => {
    assert.equal(resolveShellOffsetTop({ offsetTop: 48, scale: 1 }), 0);
    assert.equal(resolveShellOffsetTop({ offsetTop: 48, scale: 1.2 }), 48);
    assert.equal(resolveShellOffsetTop({ offsetTop: 0, scale: 1.2 }), 0);
  });
});
