import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DISPLAY_NAME_MAX } from "./rules.ts";
import {
  canSubmitDisplayName,
  updateMyDisplayNameWithAuth,
  type UpdateDisplayNameAuth,
} from "./update-display-name.ts";

function auth(input: {
  userId?: string | null;
  update?: (payload: { display_name: string }) => {
    data: { id: string; display_name: string } | null;
    error: unknown;
  };
  onUpdate?: (payload: { display_name: string }) => void;
}): UpdateDisplayNameAuth {
  return {
    getUserId: async () => (input.userId === undefined ? "user-1" : input.userId),
    updateSelfDisplayName: async (payload) => {
      input.onUpdate?.(payload);
      return input.update
        ? input.update(payload)
        : { data: { id: "user-1", display_name: payload.display_name }, error: null };
    },
  };
}

describe("updateMyDisplayNameWithAuth (unit, mocked auth adapter)", () => {
  it("normalizes valid names before writing display_name", async () => {
    const cases = [
      { input: "Carlos", expected: "Carlos" },
      { input: "  Carlos  ", expected: "Carlos" },
      { input: "Sofía", expected: "Sofía" },
    ];

    for (const { input, expected } of cases) {
      let payload: { display_name: string } | null = null;
      const result = await updateMyDisplayNameWithAuth(
        input,
        auth({ onUpdate: (next) => { payload = next; } }),
      );
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.data.display_name, expected);
      assert.deepEqual(payload, { display_name: expected });
    }
  });

  it("rejects empty, blank, and oversized names without writing", async () => {
    let called = 0;
    const adapter = auth({
      onUpdate: () => {
        called += 1;
      },
    });

    for (const input of ["", "   ", "C".repeat(DISPLAY_NAME_MAX + 1)]) {
      const result = await updateMyDisplayNameWithAuth(input, adapter);
      assert.equal(result.ok, false);
      if (result.ok === false) assert.equal(result.error.code, "invalid_name");
    }
    assert.equal(called, 0);
  });

  it("updates only display_name", async () => {
    const result = await updateMyDisplayNameWithAuth(
      "Carlos",
      auth({
        onUpdate: (payload) => {
          assert.deepEqual(Object.keys(payload), ["display_name"]);
          assert.equal(payload.display_name, "Carlos");
          assert.equal("id" in payload, false);
          assert.equal("avatar_url" in payload, false);
          assert.equal("created_at" in payload, false);
          assert.equal("updated_at" in payload, false);
          assert.equal("email" in payload, false);
        },
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.id, "user-1");
      assert.equal(result.data.display_name, "Carlos");
    }
  });

  it("does not report success when Supabase fails and allows retry", async () => {
    let attempts = 0;
    const adapter = auth({
      update: (payload) => {
        attempts += 1;
        if (attempts === 1) {
          return { data: null, error: { message: "network boom", code: "PGRST301" } };
        }
        return { data: { id: "user-1", display_name: payload.display_name }, error: null };
      },
    });

    const first = await updateMyDisplayNameWithAuth("  Sofía  ", adapter);
    assert.equal(first.ok, false);
    if (first.ok === false) assert.equal(first.error.code, "network");

    const second = await updateMyDisplayNameWithAuth("  Sofía  ", adapter);
    assert.equal(second.ok, true);
    if (second.ok) assert.equal(second.data.display_name, "Sofía");
    assert.equal(attempts, 2);
  });

  it("does not replace a chosen name with the email local-part", async () => {
    const result = await updateMyDisplayNameWithAuth(
      "Carlos",
      auth({
        onUpdate: (payload) => {
          assert.equal(payload.display_name, "Carlos");
          assert.notEqual(payload.display_name, "carlos");
        },
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.display_name, "Carlos");
  });

  it("does not call the update when the session is missing", async () => {
    let called = 0;
    const result = await updateMyDisplayNameWithAuth(
      "Carlos",
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

describe("canSubmitDisplayName", () => {
  it("blocks a second submit while saving", () => {
    assert.equal(canSubmitDisplayName(false), true);
    assert.equal(canSubmitDisplayName(true), false);
  });
});
