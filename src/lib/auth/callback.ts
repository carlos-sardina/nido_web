/**
 * Cookie adapter used by the auth callback's route-local Supabase client.
 * Session cookies are written onto the same redirect response the browser
 * will follow. PKCE only — no access or refresh tokens in the URL.
 */
export type CallbackCookie = {
  name: string;
  value: string;
};

export type CallbackCookieToSet = CallbackCookie & {
  options?: Record<string, unknown>;
};

export type CallbackRedirectResponse = {
  cookies: {
    set: (name: string, value: string, options?: Record<string, unknown>) => void;
  };
  headers: {
    set: (name: string, value: string) => void;
  };
};

export type CallbackCookieMethods = {
  getAll: () => CallbackCookie[];
  setAll: (cookiesToSet: CallbackCookieToSet[], headers: Record<string, string>) => void;
};

export function bindCookiesToRedirectResponse(
  response: CallbackRedirectResponse,
  cookieStore: {
    getAll: () => CallbackCookie[];
    set?: (name: string, value: string, options?: Record<string, unknown>) => void;
  },
): CallbackCookieMethods {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet, headers) {
      cookiesToSet.forEach(({ name, value, options }) => {
        try {
          cookieStore.set?.(name, value, options);
        } catch {
          // The redirect response is the source of truth for the browser.
          // The request cookie store can reject writes in some Next.js contexts.
        }
        response.cookies.set(name, value, options);
      });
      Object.entries(headers ?? {}).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    },
  };
}

/**
 * Exchanges a PKCE auth code and returns the redirect that already carries
 * the session cookies. Create the success redirect before the exchange so
 * `setAll` can write onto that same response object.
 *
 * Callers must pass destinations already resolved with
 * `resolveCallbackRedirectUrl` / `safeNextPath`.
 */
export async function completeAuthCallback<T extends CallbackRedirectResponse>(input: {
  code: string | null;
  successUrl: string;
  errorUrl: string;
  createRedirect: (url: string) => T;
  readCookies: () => CallbackCookie[];
  writeRequestCookie?: (name: string, value: string, options?: Record<string, unknown>) => void;
  successCookies?: CallbackCookieToSet[];
  exchangeCodeForSession: (
    code: string,
    cookies: CallbackCookieMethods,
  ) => Promise<{ error: { message: string } | null }>;
}): Promise<T> {
  if (!input.code) {
    return input.createRedirect(input.errorUrl);
  }

  const response = input.createRedirect(input.successUrl);
  const cookies = bindCookiesToRedirectResponse(response, {
    getAll: input.readCookies,
    set: input.writeRequestCookie,
  });

  const { error } = await input.exchangeCodeForSession(input.code, cookies);

  if (!error) {
    (input.successCookies ?? []).forEach(({ name, value, options }) => {
      try {
        input.writeRequestCookie?.(name, value, options);
      } catch {
        // The redirect response is the source of truth for the browser.
      }
      response.cookies.set(name, value, options);
    });
    return response;
  }

  console.error("Auth code exchange failed", error.message);
  return input.createRedirect(input.errorUrl);
}
