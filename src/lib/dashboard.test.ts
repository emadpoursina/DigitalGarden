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

import { RECENT_NOTES_LIMIT, selectRecentNotes } from './dashboard';
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
