import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Profile } from "./types.ts";
import {
  canSubmitPersonalVisibility,
  updatePersonalVisibilityWithAuth,
  type UpdatePersonalVisibilityAuth,
} from "./update-personal-visibility.ts";

const profile: Profile = {
  id: "u1",
  display_name: "Carlos",
  avatar_url: null,
  personal_visibility: "nido",
  created_at: "2026-08-21T00:00:00Z",
  updated_at: "2026-08-21T00:00:00Z",
};

function auth(input: {
  userId?: string | null;
  update?: (visibility: string) => { data: Profile | null; error: unknown };
  onUpdate?: (visibility: string) => void;
}): UpdatePersonalVisibilityAuth {
  return {
    getUserId: async () => (input.userId === undefined ? "u1" : input.userId),
    rpc: async (fn, args) => {
      assert.equal(fn, "update_personal_visibility");
      assert.equal("p_user_id" in args, false);
      assert.equal("p_id" in args, false);
      input.onUpdate?.(args.p_visibility);
      return input.update
        ? input.update(args.p_visibility)
        : { data: { ...profile, personal_visibility: args.p_visibility }, error: null };
    },
  };
}

describe("updatePersonalVisibilityWithAuth", () => {
  it("persists nido and private", async () => {
    for (const visibility of ["nido", "private"] as const) {
      const result = await updatePersonalVisibilityWithAuth(visibility, auth({}));
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.data.personal_visibility, visibility);
    }
  });

  it("rejects invalid values without calling the RPC", async () => {
    let called = 0;
    const adapter = auth({
      onUpdate: () => {
        called += 1;
      },
    });

    for (const visibility of ["solo yo", "shared", "", null, 1]) {
      const result = await updatePersonalVisibilityWithAuth(visibility, adapter);
      assert.equal(result.ok, false);
      if (result.ok === false) assert.equal(result.error.code, "invalid_visibility");
    }
    assert.equal(called, 0);
  });

  it("does not call the RPC when the session is missing", async () => {
    let called = 0;
    const result = await updatePersonalVisibilityWithAuth(
      "private",
      auth({
        userId: null,
        onUpdate: () => {
          called += 1;
        },
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.error.code, "unauthenticated");
    assert.equal(called, 0);
  });
});

describe("canSubmitPersonalVisibility", () => {
  it("blocks a second submit while saving", () => {
    assert.equal(canSubmitPersonalVisibility(false), true);
    assert.equal(canSubmitPersonalVisibility(true), false);
  });
});
