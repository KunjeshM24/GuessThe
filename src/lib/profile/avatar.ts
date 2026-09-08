/**
 * Deterministic fallback avatar, so a profile without an uploaded picture
 * still has an identity. No upload, no network request, no dependency —
 * initials on a colour picked from the palette (GamePlan.md Section 6).
 *
 * Image upload is not built yet; a Google account's `avatar_url` is used when
 * present and this fills in otherwise.
 */

/** Palette entries that stay legible under parchment-coloured initials. */
const BACKGROUNDS = [
  "var(--color-ink)",
  "var(--color-moss)",
  "var(--color-brick)",
  "var(--color-ochre)",
  "var(--color-ink-faint)",
] as const;

export type GeneratedAvatar = {
  initials: string;
  background: string;
  /** Ochre is light enough to need dark text on it; the rest take parchment. */
  foreground: string;
};

/** FNV-1a. Stable across runs and processes, unlike hashing by object identity. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function generatedAvatar(username: string): GeneratedAvatar {
  const letters = username.replace(/[^A-Za-z0-9]/g, "");
  const initials = (letters.slice(0, 2) || "??").toUpperCase();
  const background = BACKGROUNDS[hash(username.toLowerCase()) % BACKGROUNDS.length];

  return {
    initials,
    background,
    foreground:
      background === "var(--color-ochre)" ? "var(--color-ink)" : "var(--color-parchment)",
  };
}
