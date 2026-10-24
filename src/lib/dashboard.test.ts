/**
 * F2 T012 tests — `selectRecentNotes` (plan §4, spec "Recent-Notes Entry",
 * FR-005/US2.2).
 *
 * The four cases T012 names: most-recently-updated first, limit 5, legacy
 * date-only timestamps sort correctly, empty vault → `[]`. Plus the two
 * properties the dashboard depends on that T012 does not name explicitly:
 * the input is never mutated, and equal timestamps are ordered
 * deterministically (a render must not shuffle between requests).
 *
 * Nothing here reads or writes the repository's own `vault/`: the empty-vault
 * case points at a directory that does not exist and is never created.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RECENT_NOTES_LIMIT, SEEDS_ATTENTION_LIMIT, selectRecentNotes, selectSeedsNeedingAttention } from './dashboard';
import { listNoteSlugs } from './notes';

interface Fixture {
  slug: string;
  title: string;
  status: string;
  updated: string;
}

/** Build a note-like fixture; only `slug`/`updated` drive ordering. */
function note(slug: string, updated: string): Fixture {
  return { slug, title: slug, status: 'seed', updated };
}

describe('selectRecentNotes', () => {
  it('orders most-recently-updated first (descending)', () => {
    const input = [
      note('older', '2026-01-02T08:00:00.000Z'),
      note('newest', '2026-03-05T12:00:00.000Z'),
      note('middle', '2026-02-14T09:30:00.000Z'),
    ];

    expect(selectRecentNotes(input, 5).map((n) => n.slug)).toEqual([
      'newest',
      'middle',
      'older',
    ]);
  });

  it('keeps at most `limit` rows', () => {
    const input = Array.from({ length: 7 }, (_, i) =>
      // 00:00:00, 01:00:00 … so ascending index == ascending time
      note(
        `note-${i}`,
        `2026-05-01T${String(i).padStart(2, '0')}:00:00.000Z`,
      ),
    );

    const capped = selectRecentNotes(input, 5);

    expect(capped).toHaveLength(5);
    expect(capped.map((n) => n.slug)).toEqual([
      'note-6',
      'note-5',
      'note-4',
      'note-3',
      'note-2',
    ]);

    // The shipped dashboard row count (plan "Scale/Scope": 5 rows).
    expect(RECENT_NOTES_LIMIT).toBe(5);
  });

  it('sorts legacy date-only timestamps correctly among full ISO timestamps', () => {
    const input = [
      // Legacy F1-style date-only values (no time component) …
      note('dated-new', '2026-04-01'),
      note('dated-old', '2026-01-15'),
      // … interleaved with full timestamps.
      note('full-mid', '2026-02-20T18:00:00.000Z'),
      note('full-latest', '2026-04-02T07:45:00.000Z'),
      // Same instant as `dated-new`, written the long way: lexicographic
      // comparison must still put the later instant on top.
      note('full-same-day', '2026-04-01T23:59:59.000Z'),
    ];

    expect(selectRecentNotes(input, 5).map((n) => n.slug)).toEqual([
      'full-latest',
      'full-same-day',
      'dated-new',
      'full-mid',
      'dated-old',
    ]);
  });

  it('returns [] for an empty vault', () => {
    // An empty/absent vault yields no slugs at all, and no rows after
    // selection — the dashboard's empty state.
    const missingVault = join(tmpdir(), `dg-dashboard-empty-${process.pid}`);
    const slugs = listNoteSlugs(missingVault);
    expect(slugs).toEqual([]); // no slug to order …
    expect(selectRecentNotes([], RECENT_NOTES_LIMIT)).toEqual([]); // … so no rows
  });

  it('does not mutate the input array', () => {
    const input = [note('a', '2026-01-01T00:00:00.000Z'), note('b', '2026-06-01T00:00:00.000Z')];
    const snapshot = [...input];

    selectRecentNotes(input, 1);

    expect(input).toEqual(snapshot);
  });

  it('breaks ties on `updated` deterministically by slug', () => {
    const same = '2026-07-01T10:00:00.000Z';
    const input = [note('zulu', same), note('alpha', same), note('mike', same)];

    expect(selectRecentNotes(input, 3).map((n) => n.slug)).toEqual([
      'alpha',
      'mike',
      'zulu',
    ]);
  });

  it('clamps a nonsensical limit instead of throwing', () => {
    const input = [note('a', '2026-01-01T00:00:00.000Z')];

    expect(selectRecentNotes(input, -3)).toEqual([]);
    expect(selectRecentNotes(input, Number.NaN)).toEqual([]);
    expect(selectRecentNotes(input, 1.9)).toHaveLength(1);
  });
});

/* ================================================================== *
 * F4 T010 — `selectSeedsNeedingAttention` (D5, plan contract §5, US3)
 * ================================================================== */

describe('selectSeedsNeedingAttention', () => {
  function seed(slug: string, updated: string, status = 'seed'): Fixture {
    return { slug, title: slug, status, updated };
  }

  it('keeps ONLY seeds — growing/evergreen/archived are excluded', () => {
    const input = [
      seed('a-seed', '2026-01-01T00:00:00.000Z', 'seed'),
      seed('b-growing', '2026-01-02T00:00:00.000Z', 'growing'),
      seed('c-evergreen', '2026-01-03T00:00:00.000Z', 'evergreen'),
      seed('d-archived', '2026-01-04T00:00:00.000Z', 'archived'),
      seed('e-seed', '2026-01-05T00:00:00.000Z', 'seed'),
    ];

    expect(selectSeedsNeedingAttention(input, 10).map((n) => n.slug)).toEqual([
      'a-seed',
      'e-seed',
    ]);
  });

  it('orders LEAST recently updated first (ascending)', () => {
    const input = [
      seed('newer', '2026-03-05T12:00:00.000Z'),
      seed('oldest', '2026-01-02T08:00:00.000Z'),
      seed('middle', '2026-02-14T09:30:00.000Z'),
    ];

    expect(selectSeedsNeedingAttention(input, 5).map((n) => n.slug)).toEqual([
      'oldest',
      'middle',
      'newer',
    ]);
  });

  it('breaks ties on `updated` deterministically by slug', () => {
    const same = '2026-07-01T10:00:00.000Z';
    const input = [seed('zulu', same), seed('alpha', same), seed('mike', same)];

    expect(selectSeedsNeedingAttention(input, 3).map((n) => n.slug)).toEqual([
      'alpha',
      'mike',
      'zulu',
    ]);
  });

  it('caps at the given limit and clamps nonsense limits', () => {
    const input = Array.from({ length: 7 }, (_, i) =>
      // 00:00:00, 01:00:00 … so ascending index == ascending time
      seed(`seed-${i}`, `2026-05-01T${String(i).padStart(2, '0')}:00:00.000Z`),
    );

    expect(selectSeedsNeedingAttention(input, 3).map((n) => n.slug)).toEqual([
      'seed-0',
      'seed-1',
      'seed-2',
    ]);
    expect(selectSeedsNeedingAttention(input, -3)).toEqual([]);
    expect(selectSeedsNeedingAttention(input, Number.NaN)).toEqual([]);
    expect(selectSeedsNeedingAttention(input, 2.9)).toHaveLength(2);
  });

  it('the default limit constant is 5 (D5 literal) and caps the shipped list', () => {
    expect(SEEDS_ATTENTION_LIMIT).toBe(5);
    expect(RECENT_NOTES_LIMIT).toBe(5); // the F2 literal is untouched
    const seven = Array.from({ length: 7 }, (_, i) =>
      seed(`s${i}`, `2026-05-0${i + 1}T00:00:00.000Z`),
    );
    expect(
      selectSeedsNeedingAttention(seven, SEEDS_ATTENTION_LIMIT).map((n) => n.slug),
    ).toEqual(['s0', 's1', 's2', 's3', 's4']);
  });

  it('returns [] for empty input', () => {
    expect(selectSeedsNeedingAttention([], SEEDS_ATTENTION_LIMIT)).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = [
      seed('b', '2026-06-01T00:00:00.000Z', 'seed'),
      seed('a', '2026-01-01T00:00:00.000Z', 'growing'),
    ];
    const snapshot = [...input];

    selectSeedsNeedingAttention(input, 1);

    expect(input).toEqual(snapshot);
  });

  it('leaves selectRecentNotes behavior untouched (F2 regression)', () => {
    const input = [
      seed('older', '2026-01-02T08:00:00.000Z', 'seed'),
      seed('newest', '2026-03-05T12:00:00.000Z', 'archived'),
    ];
    // Recent notes ignore status entirely and still order DESC.
    expect(selectRecentNotes(input, 5).map((n) => n.slug)).toEqual(['newest', 'older']);
  });
});
