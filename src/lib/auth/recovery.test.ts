import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_COOKIE_VALUE,
  PASSWORD_RECOVERY_PATH,
  RECOVERY_LINK_INVALID_MESSAGE,
  clearPasswordRecoveryMarker,
  hasPasswordRecoveryMarker,
  isPasswordRecoveryPath,
  markPasswordRecovery,
  recoveryMarkerCookiesForNext,
} from "./recovery.ts";
import { isTechnicalAuthLeak } from "./errors.ts";
import { safeNextPath } from "./redirect.ts";

const cookies = new Map<string, string>();

function installDocumentCookie() {
  const document = {
    get cookie() {
      return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(assignment: string) {
      const [pair, ...attrs] = assignment.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const maxAge = attrs.find((attr) => attr.trim().toLowerCase().startsWith("max-age="));
      const maxAgeValue = maxAge ? Number(maxAge.split("=")[1]) : NaN;
      if (!value || maxAgeValue === 0) cookies.delete(name);
      else cookies.set(name, value);
    },
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: document,
  });
}

describe("recoveryMarkerCookiesForNext", () => {
  it("marks only the password-update next path as recovery", () => {
    const cookiesToSet = recoveryMarkerCookiesForNext(PASSWORD_RECOVERY_PATH);
    assert.equal(cookiesToSet.length, 1);
    assert.equal(cookiesToSet[0].name, PASSWORD_RECOVERY_COOKIE);
    assert.equal(cookiesToSet[0].value, PASSWORD_RECOVERY_COOKIE_VALUE);
    assert.equal(cookiesToSet[0].options.httpOnly, false);
  });

  it("does not mark email confirmation or join callbacks as recovery", () => {
    assert.deepEqual(recoveryMarkerCookiesForNext(null), []);
    assert.deepEqual(recoveryMarkerCookiesForNext("/"), []);
    assert.deepEqual(recoveryMarkerCookiesForNext("/join/invite-token-value-1"), []);
  });

  it("does not mark an unsafe next URL as recovery", () => {
    assert.equal(safeNextPath("https://evil.example"), "/");
    assert.deepEqual(recoveryMarkerCookiesForNext(safeNextPath("https://evil.example")), []);
    assert.equal(isPasswordRecoveryPath("https://evil.example"), false);
    assert.equal(isPasswordRecoveryPath(safeNextPath("https://evil.example")), false);
  });
});

describe("password recovery marker", () => {
  it("round-trips in a cookie and clears on logout/cleanup", () => {
    installDocumentCookie();
    cookies.clear();

    assert.equal(hasPasswordRecoveryMarker(), false);
    markPasswordRecovery();
    assert.equal(hasPasswordRecoveryMarker(), true);
    assert.equal(document.cookie.includes("access_token"), false);
    assert.equal(document.cookie.includes("refresh_token"), false);

    clearPasswordRecoveryMarker();
    assert.equal(hasPasswordRecoveryMarker(), false);
  });

  it("does not keep a stale recovery flag after cleanup", () => {
    installDocumentCookie();
    cookies.clear();
    markPasswordRecovery();
    clearPasswordRecoveryMarker();
    markPasswordRecovery();
    clearPasswordRecoveryMarker();
    assert.equal(hasPasswordRecoveryMarker(), false);
  });
});

describe("recovery copy", () => {
  it("uses a Spanish invalid-link message without leaking provider errors", () => {
    assert.match(RECOVERY_LINK_INVALID_MESSAGE, /expiró|válido/i);
    assert.equal(isTechnicalAuthLeak(RECOVERY_LINK_INVALID_MESSAGE), false);
    assert.equal(RECOVERY_LINK_INVALID_MESSAGE.toLowerCase().includes("authapierror"), false);
  });
});
