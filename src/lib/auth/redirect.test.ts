import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getOAuthRedirectTo, safeNextPath } from "./redirect.ts";

describe("getOAuthRedirectTo", () => {
  it("uses the current origin and the App Router callback path", () => {
    assert.equal(getOAuthRedirectTo("http://localhost:3000"), "http://localhost:3000/auth/callback");
    assert.equal(getOAuthRedirectTo("https://nido.example"), "https://nido.example/auth/callback");
  });

  it("strips a trailing slash from the origin", () => {
    assert.equal(getOAuthRedirectTo("http://localhost:3000/"), "http://localhost:3000/auth/callback");
  });

  it("preserves a safe next path for invitation return", () => {
    assert.equal(
      getOAuthRedirectTo("http://localhost:3000", "/join/abc"),
      "http://localhost:3000/auth/callback?next=%2Fjoin%2Fabc",
    );
  });

  it("ignores an unsafe next path", () => {
    assert.equal(
      getOAuthRedirectTo("http://localhost:3000", "https://evil.example"),
      "http://localhost:3000/auth/callback",
    );
  });
});

describe("safeNextPath", () => {
  it("allows same-origin relative paths", () => {
    assert.equal(safeNextPath("/"), "/");
    assert.equal(safeNextPath("/onboarding"), "/onboarding");
    assert.equal(safeNextPath("/join/token-value"), "/join/token-value");
  });

  it("rejects open redirects", () => {
    assert.equal(safeNextPath("https://evil.example"), "/");
    assert.equal(safeNextPath("//evil.example"), "/");
    assert.equal(safeNextPath("http://evil.example"), "/");
    assert.equal(safeNextPath(null), "/");
  });
});
