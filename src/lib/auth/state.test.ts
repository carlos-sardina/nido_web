import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { User } from "@supabase/supabase-js";
import { resolveAuthSnapshot } from "./state.ts";

function user(id = "user-1"): User {
  return {
    id,
    app_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00.000Z",
    user_metadata: {},
  } as User;
}

describe("resolveAuthSnapshot", () => {
  it("maps a missing user to unauthenticated (auth landing)", () => {
    assert.deepEqual(
      resolveAuthSnapshot({
        event: "INITIAL_SESSION",
        user: null,
        isPasswordRecoverySession: false,
        previousStatus: "loading",
      }),
      { status: "unauthenticated", user: null },
    );
  });

  it("maps a normal SIGNED_IN event to authenticated", () => {
    const signedIn = user();
    assert.deepEqual(
      resolveAuthSnapshot({
        event: "SIGNED_IN",
        user: signedIn,
        isPasswordRecoverySession: false,
        previousStatus: "unauthenticated",
      }),
      { status: "authenticated", user: signedIn },
    );
  });

  it("maps email confirmation SIGNED_IN to authenticated, not recovery", () => {
    const confirmed = user();
    assert.deepEqual(
      resolveAuthSnapshot({
        event: "SIGNED_IN",
        user: confirmed,
        isPasswordRecoverySession: false,
        previousStatus: "loading",
      }),
      { status: "authenticated", user: confirmed },
    );
  });

  it("maps PASSWORD_RECOVERY to recovery, not authenticated", () => {
    const recovering = user();
    const snapshot = resolveAuthSnapshot({
      event: "PASSWORD_RECOVERY",
      user: recovering,
      isPasswordRecoverySession: true,
      previousStatus: "unauthenticated",
    });
    assert.equal(snapshot.status, "recovery");
    assert.equal(snapshot.user, recovering);
  });

  it("maps a recovery marker on INITIAL_SESSION to recovery (cross-tab / PKCE)", () => {
    const recovering = user();
    const snapshot = resolveAuthSnapshot({
      event: "INITIAL_SESSION",
      user: recovering,
      isPasswordRecoverySession: true,
      previousStatus: "loading",
    });
    assert.equal(snapshot.status, "recovery");
  });

  it("maps a recovery marker on SIGNED_IN to recovery so other tabs do not treat it as login", () => {
    const recovering = user();
    const snapshot = resolveAuthSnapshot({
      event: "SIGNED_IN",
      user: recovering,
      isPasswordRecoverySession: true,
      previousStatus: "unauthenticated",
    });
    assert.equal(snapshot.status, "recovery");
  });

  it("does not demote an already authenticated tab when a recovery session appears", () => {
    const existing = user();
    const snapshot = resolveAuthSnapshot({
      event: "PASSWORD_RECOVERY",
      user: existing,
      isPasswordRecoverySession: true,
      previousStatus: "authenticated",
    });
    assert.equal(snapshot.status, "authenticated");
    assert.equal(snapshot.user, existing);
  });

  it("keeps recovery across TOKEN_REFRESHED until the password is updated", () => {
    const recovering = user();
    const snapshot = resolveAuthSnapshot({
      event: "TOKEN_REFRESHED",
      user: recovering,
      isPasswordRecoverySession: true,
      previousStatus: "recovery",
    });
    assert.equal(snapshot.status, "recovery");
  });

  it("maps USER_UPDATED after recovery to a normal authenticated session", () => {
    const updated = user();
    const snapshot = resolveAuthSnapshot({
      event: "USER_UPDATED",
      user: updated,
      isPasswordRecoverySession: true,
      previousStatus: "recovery",
    });
    assert.equal(snapshot.status, "authenticated");
    assert.equal(snapshot.user, updated);
  });

  it("maps SIGNED_OUT to unauthenticated and drops the user", () => {
    assert.deepEqual(
      resolveAuthSnapshot({
        event: "SIGNED_OUT",
        user: user(),
        isPasswordRecoverySession: true,
        previousStatus: "recovery",
      }),
      { status: "unauthenticated", user: null },
    );
  });

  it("does not leave recovery status after logout even if a stale marker remains", () => {
    const snapshot = resolveAuthSnapshot({
      event: "SIGNED_OUT",
      user: null,
      isPasswordRecoverySession: true,
      previousStatus: "authenticated",
    });
    assert.equal(snapshot.status, "unauthenticated");
    assert.equal(snapshot.user, null);
  });

  it("maps an expired recovery (no user) to unauthenticated", () => {
    assert.deepEqual(
      resolveAuthSnapshot({
        event: "INITIAL_SESSION",
        user: null,
        isPasswordRecoverySession: false,
        previousStatus: "loading",
      }),
      { status: "unauthenticated", user: null },
    );
  });
});
