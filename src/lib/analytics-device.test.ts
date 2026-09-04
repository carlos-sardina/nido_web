import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyticsBrowser,
  analyticsClientContext,
  analyticsDevice,
  analyticsOs,
} from "./analytics-device.ts";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const PIXEL =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

describe("analytics device context", () => {
  it("classifies common beta devices", () => {
    assert.equal(analyticsOs(IPHONE), "ios");
    assert.equal(analyticsBrowser(IPHONE), "safari");
    assert.equal(analyticsDevice({ userAgent: IPHONE, maxTouchPoints: 5, width: 390 }), "mobile");

    assert.equal(analyticsOs(PIXEL), "android");
    assert.equal(analyticsBrowser(PIXEL), "chrome");
    assert.equal(analyticsDevice({ userAgent: PIXEL, maxTouchPoints: 5, width: 412 }), "mobile");

    assert.equal(analyticsDevice({ userAgent: IPAD, maxTouchPoints: 5, width: 1024 }), "tablet");
    assert.equal(analyticsOs(MAC_CHROME), "macos");
    assert.equal(analyticsBrowser(MAC_CHROME), "chrome");
    assert.equal(analyticsDevice({ userAgent: MAC_CHROME, maxTouchPoints: 0, width: 1440 }), "desktop");
  });

  it("packs a flat payload for logs", () => {
    const props = analyticsClientContext({
      userAgent: IPHONE,
      maxTouchPoints: 5,
      width: 390,
      height: 844,
      standalone: true,
      language: "es-MX",
      path: "/",
    });
    assert.deepEqual(props, {
      path: "/",
      standalone: true,
      device: "mobile",
      os: "ios",
      browser: "safari",
      language: "es-MX",
      viewport: "390x844",
    });
  });
});
