import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  completeAuthCallback,
  type CallbackCookieToSet,
  type CallbackRedirectResponse,
} from "./callback.ts";
import { resolveCallbackRedirectUrl, safeNextPath } from "./redirect.ts";

const ORIGIN = "https://nido-web-chi.vercel.app";
const SESSION_COOKIE = "sb-pxfdvhavcddqmhuljxlf-auth-token";

type FakeRedirect = CallbackRedirectResponse & {
  location: string;
  setCookies: Array<{ name: string; value: string }>;
};

function createRedirect(url: string): FakeRedirect {
  const setCookies: Array<{ name: string; value: string }> = [];
  const headers = new Map<string, string>([["Location", url]]);
  return {
    location: url,
    setCookies,
    cookies: {
      set(name, value) {
        setCookies.push({ name, value });
      },
    },
    headers: {
      set(name, value) {
        headers.set(name, value);
      },
    },
  };
}

function assertNoTokensInUrl(url: string) {
  assert.equal(url.includes("access_token"), false);
  assert.equal(url.includes("refresh_token"), false);
}

function urlsFor(next: string | null) {
  const destination = {
    origin: ORIGIN,
    next,
    forwardedHost: "nido-web-chi.vercel.app",
    isLocalEnv: false,
  };
  return {
    successUrl: resolveCallbackRedirectUrl({ ...destination, kind: "success" as const }),
    errorUrl: resolveCallbackRedirectUrl({ ...destination, kind: "error" as const }),
  };
}

async function runCallback(input: {
  code: string | null;
  next?: string | null;
  exchange: (
    code: string,
    cookies: { setAll: (cookiesToSet: CallbackCookieToSet[], headers: Record<string, string>) => void },
  ) => Promise<{ error: { message: string } | null }>;
  writeRequestCookie?: (name: string, value: string) => void;
}) {
  const { successUrl, errorUrl } = urlsFor(input.next ?? null);
  return completeAuthCallback({
    code: input.code,
    successUrl,
    errorUrl,
    createRedirect,
    readCookies: () => [],
    writeRequestCookie: input.writeRequestCookie,
    exchangeCodeForSession: input.exchange,
  });
}

describe("resolveCallbackRedirectUrl", () => {
  it("keeps a safe next path for password update", () => {
    assert.equal(
      resolveCallbackRedirectUrl({
        origin: ORIGIN,
        next: "/auth/update-password",
        forwardedHost: "nido-web-chi.vercel.app",
        isLocalEnv: false,
        kind: "success",
      }),
      `${ORIGIN}/auth/update-password`,
    );
  });

  it("rejects an absolute next URL", () => {
    assert.equal(safeNextPath("https://evil.example"), "/");
    assert.equal(
      resolveCallbackRedirectUrl({
        origin: ORIGIN,
        next: "https://evil.example",
        forwardedHost: "nido-web-chi.vercel.app",
        isLocalEnv: false,
        kind: "success",
      }),
      `${ORIGIN}/`,
    );
  });
});

describe("completeAuthCallback", () => {
  it("writes session cookies onto the same success redirect", async () => {
    const requestCookies: Array<{ name: string; value: string }> = [];
    const response = await runCallback({
      code: "pkce-code",
      writeRequestCookie: (name, value) => {
        requestCookies.push({ name, value });
      },
      exchange: async (_code, cookies) => {
        cookies.setAll(
          [{ name: SESSION_COOKIE, value: "session-cookie", options: { path: "/", sameSite: "lax" } }],
          { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0" },
        );
        return { error: null };
      },
    });

    assert.equal(response.location, `${ORIGIN}/`);
    assert.equal(
      response.setCookies.some((cookie) => cookie.name === SESSION_COOKIE && cookie.value === "session-cookie"),
      true,
    );
    assert.equal(
      requestCookies.some((cookie) => cookie.name === SESSION_COOKIE && cookie.value === "session-cookie"),
      true,
    );
    assertNoTokensInUrl(response.location);
  });

  it("redirects to /?auth=error when the code is missing and does not create a session", async () => {
    let exchanged = false;
    const response = await runCallback({
      code: null,
      exchange: async () => {
        exchanged = true;
        return { error: null };
      },
    });

    assert.equal(exchanged, false);
    assert.equal(response.location, `${ORIGIN}/?auth=error`);
    assert.equal(response.setCookies.length, 0);
    assertNoTokensInUrl(response.location);
  });

  it("redirects to /?auth=error when the exchange fails and does not create a session", async () => {
    const response = await runCallback({
      code: "pkce-code",
      exchange: async () => ({ error: { message: "invalid grant" } }),
    });

    assert.equal(response.location, `${ORIGIN}/?auth=error`);
    assert.equal(response.setCookies.length, 0);
    assertNoTokensInUrl(response.location);
  });

  it("preserves a safe next path after a successful exchange", async () => {
    const response = await runCallback({
      code: "pkce-code",
      next: "/auth/update-password",
      exchange: async (_code, cookies) => {
        cookies.setAll([{ name: SESSION_COOKIE, value: "session-cookie" }], {});
        return { error: null };
      },
    });

    assert.equal(response.location, `${ORIGIN}/auth/update-password`);
    assert.equal(
      response.setCookies.some((cookie) => cookie.name === SESSION_COOKIE),
      true,
    );
    assertNoTokensInUrl(response.location);
  });

  it("rejects an absolute next URL after a successful exchange", async () => {
    const response = await runCallback({
      code: "pkce-code",
      next: "https://evil.example",
      exchange: async (_code, cookies) => {
        cookies.setAll([{ name: SESSION_COOKIE, value: "session-cookie" }], {});
        return { error: null };
      },
    });

    assert.equal(response.location, `${ORIGIN}/`);
    assert.equal(response.location.startsWith("https://evil.example"), false);
    assertNoTokensInUrl(response.location);
  });
});
