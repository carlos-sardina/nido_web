import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAuthRedirectTo, safeNextPath } from "./redirect.ts";

describe("getAuthRedirectTo", () => {
  it("uses the current origin and the App Router callback path", () => {
    assert.equal(getAuthRedirectTo("http://localhost:3000"), "http://localhost:3000/auth/callback");
    assert.equal(getAuthRedirectTo("https://nido.example"), "https://nido.example/auth/callback");
  });

  it("strips a trailing slash from the origin", () => {
    assert.equal(getAuthRedirectTo("http://localhost:3000/"), "http://localhost:3000/auth/callback");
  });

  it("preserves a safe next path for invitation or password update return", () => {
    assert.equal(
      getAuthRedirectTo("http://localhost:3000", "/join/abc"),
      "http://localhost:3000/auth/callback?next=%2Fjoin%2Fabc",
    );
    assert.equal(
      getAuthRedirectTo("http://localhost:3000", "/auth/update-password"),
      "http://localhost:3000/auth/callback?next=%2Fauth%2Fupdate-password",
    );
  });

  it("ignores an unsafe next path", () => {
    assert.equal(
      getAuthRedirectTo("http://localhost:3000", "https://evil.example"),
      "http://localhost:3000/auth/callback",
    );
  });
});

describe("safeNextPath", () => {
  it("allows same-origin relative paths", () => {
    assert.equal(safeNextPath("/"), "/");
    assert.equal(safeNextPath("/onboarding"), "/onboarding");
    assert.equal(safeNextPath("/join/token-value"), "/join/token-value");
    assert.equal(safeNextPath("/auth/update-password"), "/auth/update-password");
  });

  it("rejects open redirects", () => {
    assert.equal(safeNextPath("https://evil.example"), "/");
    assert.equal(safeNextPath("//evil.example"), "/");
    assert.equal(safeNextPath("http://evil.example"), "/");
    assert.equal(safeNextPath(null), "/");
  });
});
