import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { normalize } from "../../src/lib/engine/guess.ts";
import { getPack, PACK_SLUGS } from "../../src/packs/registry.ts";

/**
 * Content integrity, run over every pack that has a content file.
 *
 * This suite is deliberately pack-agnostic: it iterates PACK_SLUGS and knows
 * nothing about trees or objects. Adding a pack means adding a JSON file, and
 * these checks start covering it with no edit here — which is also the
 * clearest evidence that the engine itself is pack-agnostic.
 *
 * Hand-written content is where the leaks are. Two of these checks have
 * already caught real ones.
 */
type SeedPuzzle = {
  answer: string;
  aliases: string[];
  closeTerms: string[];
  hints: string[];
  fact: string;
};

type SeedPack = { pack: string; puzzles: SeedPuzzle[] };

const here = dirname(fileURLToPath(import.meta.url));

/** Generic qualifiers that carry no identifying information on their own. */
const GENERIC = new Set(["common", "european", "of", "the"]);

const hasWord = (haystack: string, word: string) => ` ${haystack} `.includes(` ${word} `);

/**
 * Words from an answer that actually identify it.
 *
 * The pack's own category noun is excluded: "tree" appears in Joshua Tree and
 * in half the hints of every tree puzzle, and carries no information inside a
 * pack where everything is a tree. This mirrors `normalizeGuess`, which drops
 * the same noun when matching a guess.
 */
const identifyingWords = (answer: string, packNoun: string) =>
  normalize(answer)
    .split(" ")
    .filter(
      (word) => word.length >= 3 && !GENERIC.has(word) && word !== normalize(packNoun),
    );

const packs = PACK_SLUGS.map((slug) => {
  const file = join(here, `${slug}.json`);
  return existsSync(file)
    ? { slug, data: JSON.parse(readFileSync(file, "utf8")) as SeedPack }
    : null;
}).filter((entry) => entry !== null);

test("every launch pack ships content", () => {
  assert.deepEqual(
    packs.map((p) => p.slug).sort(),
    [...PACK_SLUGS].sort(),
    "a pack in the registry has no content/packs/<slug>.json",
  );
});

for (const { slug, data } of packs) {
  test(`${slug}: a full month of puzzles with no repeats`, () => {
    assert.equal(data.pack, slug);
    assert.equal(data.puzzles.length, 30);

    const answers = data.puzzles.map((p) => normalize(p.answer));
    assert.equal(new Set(answers).size, 30, "duplicate answer in the pack");
  });

  test(`${slug}: every puzzle is structurally complete`, () => {
    for (const p of data.puzzles) {
      assert.ok(p.answer.trim().length > 0, "blank answer");
      assert.ok(
        p.hints.length >= 4 && p.hints.length <= 6,
        `${p.answer}: expected 4-6 hints, got ${p.hints.length}`,
      );
      assert.ok(p.closeTerms.length > 0, `${p.answer}: no close terms`);
      assert.ok(Array.isArray(p.aliases), `${p.answer}: aliases must be an array`);
      assert.ok(p.fact.trim().length > 20, `${p.answer}: fact too short to be useful`);

      for (const hint of p.hints) {
        assert.ok(hint.trim().length > 20, `${p.answer}: hint looks truncated`);
      }
    }
  });

  test(`${slug}: no hint gives away its own answer`, () => {
    const { noun } = getPack(slug);

    for (const p of data.puzzles) {
      const answer = normalize(p.answer);

      for (const [i, hint] of p.hints.entries()) {
        const text = normalize(hint);
        const where = `${p.answer} hint ${i + 1}`;

        assert.ok(!hasWord(text, answer), `${where} contains the answer`);

        for (const word of identifyingWords(p.answer, noun)) {
          assert.ok(!hasWord(text, word), `${where} contains answer word "${word}"`);
        }
        for (const term of p.closeTerms) {
          assert.ok(
            !hasWord(text, normalize(term)),
            `${where} contains close term "${term}"`,
          );
        }
      }
    }
  });

  /**
   * Pack UI copy ships to the browser on every page load, so an example that
   * happens to be one of the answers hands that day's puzzle away for free.
   * This caught exactly that in Task 2: the placeholder read "e.g. Silver Birch".
   */
  test(`${slug}: pack UI copy never names an answer or a close term`, () => {
    const { inputPlaceholder, howToPlay } = getPack(slug);
    const copy = [inputPlaceholder, ...howToPlay].map(normalize);

    for (const p of data.puzzles) {
      const forbidden = [normalize(p.answer), ...p.closeTerms.map(normalize)];

      for (const line of copy) {
        for (const term of forbidden) {
          assert.ok(
            !hasWord(line, term),
            `pack copy leaks "${term}" (answer: ${p.answer}) — "${line}"`,
          );
        }
      }
    }
  });

  test(`${slug}: aliases are distinct and normalize to something`, () => {
    for (const p of data.puzzles) {
      const seen = new Set([normalize(p.answer)]);
      for (const alias of p.aliases) {
        const key = normalize(alias);
        assert.ok(key.length > 0, `${p.answer}: alias "${alias}" normalizes to nothing`);
        assert.ok(!seen.has(key), `${p.answer}: duplicate alias "${alias}"`);
        seen.add(key);
      }
    }
  });
}
