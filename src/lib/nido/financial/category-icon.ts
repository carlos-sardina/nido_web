/** Default icon when the user does not pick another emoji. Matches onboarding. */
export const DEFAULT_CATEGORY_EMOJI = "💳";

export const QUICK_CATEGORY_EMOJIS = [
  "💳",
  "🎓",
  "🏋️",
  "🛍️",
  "💅",
  "🍺",
  "🐱",
  "🐕",
  "🏥",
  "✈️",
  "📚",
  "🎮",
  "🧘",
  "🚲",
  "🎸",
] as const;

export type QuickCategoryEmoji = (typeof QUICK_CATEGORY_EMOJIS)[number];

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function isQuickCategoryEmoji(value: string): value is QuickCategoryEmoji {
  return (QUICK_CATEGORY_EMOJIS as readonly string[]).includes(value);
}

function lastGrapheme(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  let last: string | undefined;
  for (const { segment } of graphemeSegmenter.segment(trimmed)) {
    last = segment;
  }
  return last;
}

/** Keeps the last emoji from a free-text field, including ZWJ / variation-selector sequences. */
export function emojiFromInput(value: string, fallback = DEFAULT_CATEGORY_EMOJI): string {
  return lastGrapheme(value) ?? fallback;
}

export function resolveCategoryIcon(icon: string | null | undefined): string {
  const trimmed = icon?.trim() ?? "";
  return trimmed || DEFAULT_CATEGORY_EMOJI;
}
