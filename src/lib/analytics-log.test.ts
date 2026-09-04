import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANALYTICS_LOG_PREFIX,
  formatAnalyticsLog,
  parseAnalyticsLogBody,
} from "./analytics-log.ts";

describe("parseAnalyticsLogBody", () => {
  it("accepts a named event with flat props", () => {
    const parsed = parseAnalyticsLogBody({
      name: "Expense created",
      props: { email: "alex@example.com", username: "Alex", scope: "shared" },
    });
    assert.deepEqual(parsed, {
      name: "Expense created",
      props: { email: "alex@example.com", username: "Alex", scope: "shared" },
    });
  });

  it("rejects missing names and nested props", () => {
    assert.equal(parseAnalyticsLogBody({ props: { email: "a@b.c" } }), null);
    const parsed = parseAnalyticsLogBody({
      name: "Login completed",
      props: { email: "a@b.c", nested: { no: true } },
    });
    assert.deepEqual(parsed, {
      name: "Login completed",
      props: { email: "a@b.c" },
    });
  });
});

describe("formatAnalyticsLog", () => {
  it("prefixes a searchable line for Vercel Logs", () => {
    const line = formatAnalyticsLog("Signup completed", {
      email: "alex@example.com",
      username: "Alex",
      source: "onboarding",
    });
    assert.equal(line.startsWith(`${ANALYTICS_LOG_PREFIX} `), true);
    assert.match(line, /"event":"Signup completed"/);
    assert.match(line, /"email":"alex@example.com"/);
  });
});
