import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_CATEGORY_EMOJI,
  emojiFromInput,
  isQuickCategoryEmoji,
  QUICK_CATEGORY_EMOJIS,
  resolveCategoryIcon,
} from "./category-icon.ts";

describe("emojiFromInput", () => {
  it("falls back when empty or whitespace", () => {
    assert.equal(emojiFromInput(""), DEFAULT_CATEGORY_EMOJI);
    assert.equal(emojiFromInput("   "), DEFAULT_CATEGORY_EMOJI);
  });

  it("keeps the last grapheme so a paste still yields one emoji", () => {
    assert.equal(emojiFromInput("🎸"), "🎸");
    assert.equal(emojiFromInput("💅🎸"), "🎸");
    assert.equal(emojiFromInput("🏋️"), "🏋️");
    assert.equal(emojiFromInput("🛍️"), "🛍️");
  });
});

describe("resolveCategoryIcon", () => {
  it("uses the onboarding default when missing", () => {
    assert.equal(resolveCategoryIcon(null), DEFAULT_CATEGORY_EMOJI);
    assert.equal(resolveCategoryIcon("  "), DEFAULT_CATEGORY_EMOJI);
    assert.equal(resolveCategoryIcon("🎮"), "🎮");
    assert.equal(resolveCategoryIcon("🏋️"), "🏋️");
  });
});

describe("quick category emojis", () => {
  it("includes the default and rejects unknown values", () => {
    assert.equal(QUICK_CATEGORY_EMOJIS[0], DEFAULT_CATEGORY_EMOJI);
    assert.equal(isQuickCategoryEmoji(DEFAULT_CATEGORY_EMOJI), true);
    assert.equal(isQuickCategoryEmoji("🎵"), false);
  });
});
