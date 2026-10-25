/**
 * F6 T003 tests — `tags.ts` selection + URL codec (plan contract §1, R6).
 *
 * Every index in here is built through the REAL `buildTagIndex` from
 * `src/lib/notes.ts` — never a mock — because AC3 is about the construction
 * path dropping keys, not just the projection over a hand-made object (plan
 * R6). The one deliberate exception is tagged below: proving that
 * `getAllTags` does NOT re-sort needs an already-unsorted input, and a
 * shuffled `Record` is exactly the input a re-sort would corrupt.
 *
 * Covered: alphabetical projection + counts + no-duplicate-casing +
 * no-re-sort, exact membership + case-fold + `updated` DESC + `slug` ASC
 * tie-break + input-mutation-free, codec round-trips (incl. `C++`, `a/b`,
 * `50%`, unicode, emoji) and the malformed-sequence no-throw miss.
 */
import { describe, expect, it } from 'vitest';

import { buildTagIndex, NOTE_STATUSES, type NoteFields } from './notes';
import { decodeTagParam, getAllTags, getNotesForTag, tagHref, type TaggableNote } from './tags';

/** Minimal `NoteFields` fixture — exactly what `buildTagIndex` consumes. */
function note(
  slug: string,
  tags: string[],
  updated: string,
  status: NoteFields['status'] = 'seed',
): NoteFields {
  return {
    slug,
    title: slug.toUpperCase(),
    tags,
    status,
    visibility: 'private',
    created: '2026-01-01T00:00:00.000Z',
    updated,
  };
}

describe('getAllTags', () => {
  it('projects the real index alphabetically with correct counts', () => {
    const index = buildTagIndex([
      note('gamma', ['beta', 'alpha'], '2026-03-01T10:00:00.000Z'),
      note('alpha', ['alpha'], '2026-03-02T10:00:00.000Z'),
      note('beta', ['gamma'], '2026-03-03T10:00:00.000Z'),
    ]);

    expect(getAllTags(index)).toEqual([
      { tag: 'alpha', count: 2 },
      { tag: 'beta', count: 1 },
      { tag: 'gamma', count: 1 },
    ]);
  });

  it('counts distinct notes, never duplicate casings of one tag', () => {
    const index = buildTagIndex([
      note('one', ['AI', 'ai'], '2026-03-01T10:00:00.000Z'),
      note('two', ['Ai'], '2026-03-02T10:00:00.000Z'),
    ]);

    expect(getAllTags(index)).toEqual([{ tag: 'ai', count: 2 }]);
  });

  it('preserves insertion order — getAllTags does NOT re-sort (single sort authority)', () => {
    // Deliberate exception to the "real index only" rule: `buildTagIndex`
    // always returns sorted keys, so a re-sort inside `getAllTags` would be
    // invisible there. A shuffled Record is the one input that proves it.
    const shuffled: Record<string, string[]> = {
      zulu: ['a'],
      alpha: ['b'],
      mike: ['c'],
    };

    expect(getAllTags(shuffled).map((entry) => entry.tag)).toEqual(['zulu', 'alpha', 'mike']);
  });

  it('is pure — the index object is not mutated', () => {
    const index = buildTagIndex([note('alpha', ['seedling'], '2026-03-01T10:00:00.000Z')]);
    const snapshot = JSON.parse(JSON.stringify(index)) as Record<string, string[]>;

    getAllTags(index);

    expect(index).toEqual(snapshot);
  });

  it('returns [] for an empty index (zero-tag vault → empty state, not an error)', () => {
    expect(getAllTags(buildTagIndex([]))).toEqual([]);
  });
});

describe('getNotesForTag', () => {
  const ALL: TaggableNote[] = [
    {
      slug: 'older',
      title: 'Older',
      tags: ['ai', 'writing'],
      status: 'seed',
      updated: '2026-01-02T08:00:00.000Z',
    },
    {
      slug: 'newest',
      title: 'Newest',
      tags: ['AI'],
      status: 'archived',
      updated: '2026-03-05T12:00:00.000Z',
    },
    {
      slug: 'middle',
      title: 'Middle',
      tags: ['Ai'],
      status: 'growing',
      updated: '2026-02-14T09:30:00.000Z',
    },
    {
      slug: 'untagged',
      title: 'Untagged',
      tags: [],
      status: 'evergreen',
      updated: '2026-04-01T00:00:00.000Z',
    },
    {
      slug: 'near-miss',
      title: 'Near miss',
      tags: ['domain-driven', 'ai-lab'],
      status: 'seed',
      updated: '2026-04-02T00:00:00.000Z',
    },
  ];

  it('matches EXACTLY — no prefix, no substring', () => {
    expect(getNotesForTag(ALL, 'ai').map((n) => n.slug)).not.toContain('near-miss');
    expect(getNotesForTag(ALL, 'domain-driven').map((n) => n.slug)).toEqual(['near-miss']);
    expect(getNotesForTag(ALL, 'driven').map((n) => n.slug)).toEqual([]);
    expect(getNotesForTag(ALL, 'writing').map((n) => n.slug)).toEqual(['older']);
  });

  it('case-folds both sides — every casing of a tag returns the same rows', () => {
    const expected = ['newest', 'middle', 'older'];
    expect(getNotesForTag(ALL, 'ai').map((n) => n.slug)).toEqual(expected);
    expect(getNotesForTag(ALL, 'AI').map((n) => n.slug)).toEqual(expected);
    expect(getNotesForTag(ALL, 'Ai').map((n) => n.slug)).toEqual(expected);
  });

  it('orders newest-updated first (DESC)', () => {
    expect(getNotesForTag(ALL, 'ai').map((n) => n.updated)).toEqual([
      '2026-03-05T12:00:00.000Z',
      '2026-02-14T09:30:00.000Z',
      '2026-01-02T08:00:00.000Z',
    ]);
  });

  it('breaks ties on `updated` deterministically by slug ASC', () => {
    const same = '2026-07-01T10:00:00.000Z';
    const rows: TaggableNote[] = [
      { slug: 'zulu', title: 'Z', tags: ['tie'], status: 'seed', updated: same },
      { slug: 'alpha', title: 'A', tags: ['tie'], status: 'seed', updated: same },
      { slug: 'mike', title: 'M', tags: ['tie'], status: 'seed', updated: same },
    ];

    expect(getNotesForTag(rows, 'tie').map((n) => n.slug)).toEqual(['alpha', 'mike', 'zulu']);
  });

  it('never mutates the input array', () => {
    const snapshot = JSON.parse(JSON.stringify(ALL)) as TaggableNote[];

    getNotesForTag(ALL, 'ai');
    getNotesForTag(ALL, 'nothing-here');

    expect(ALL).toEqual(snapshot);
  });

  it('includes archived notes with their status flag (no lifecycle filter)', () => {
    const rows = getNotesForTag(ALL, 'ai');
    const archived = rows.find((n) => n.slug === 'newest');
    expect(archived?.status).toBe('archived');
  });

  it('handles notes without a `tags` key and an empty query', () => {
    const bare: TaggableNote[] = [
      { slug: 'bare', title: 'Bare', status: 'seed', updated: '2026-01-01T00:00:00.000Z' },
    ];

    expect(getNotesForTag(bare, 'anything')).toEqual([]);
    expect(getNotesForTag(ALL, '')).toEqual([]);
    expect(getNotesForTag([], 'ai')).toEqual([]);
  });
});

describe('tagHref / decodeTagParam', () => {
  const ROUND_TRIPS = ['C++', 'a/b', '50%', 'café', '🌱 gardening', 'a b', 'ünicode-tag'];

  it('encodes a single path segment and decodes back to the canonical key', () => {
    for (const tag of ROUND_TRIPS) {
      const href = tagHref(tag);
      expect(href.startsWith('/tags/')).toBe(true);
      // One segment: no raw `/`, no raw `+`/`%` left for the router to eat.
      const segment = href.slice('/tags/'.length);
      expect(segment).not.toContain('/');
      expect(decodeTagParam(segment)).toBe(tag.toLowerCase());
    }
  });

  it('encodes the documented edges exactly', () => {
    expect(tagHref('C++')).toBe('/tags/C%2B%2B');
    expect(tagHref('a/b')).toBe('/tags/a%2Fb');
    expect(tagHref('50%')).toBe('/tags/50%25');
    expect(tagHref('café')).toBe('/tags/caf%C3%A9');
  });

  it('folds the decoded key to lowercase (open vocabulary, canonical key)', () => {
    expect(decodeTagParam('AI')).toBe('ai');
    expect(decodeTagParam('Cafe%20Society')).toBe('cafe society');
  });

  it('a malformed sequence never throws — it misses the index instead', () => {
    expect(() => decodeTagParam('%E0%A4%A')).not.toThrow();
    expect(decodeTagParam('%E0%A4%A')).toBe('%e0%a4%a');

    const index = buildTagIndex([note('alpha', ['ai'], '2026-03-01T10:00:00.000Z')]);
    const key = decodeTagParam('%E0%A4%A');
    expect(Object.keys(index)).not.toContain(key);
    expect(getNotesForTag(
      [{ slug: 'alpha', title: 'Alpha', tags: ['ai'], status: 'seed', updated: '2026-03-01T10:00:00.000Z' }],
      key,
    )).toEqual([]);
  });
});

describe('AC3 — a tag removed everywhere drops from the index on the next rebuild', () => {
  const withGarden: NoteFields[] = [
    note('compost', ['garden', 'soil'], '2026-03-01T10:00:00.000Z'),
    note('seedlings', ['Garden'], '2026-03-02T10:00:00.000Z', 'growing'),
    note('notes-on-notes', ['meta'], '2026-03-03T10:00:00.000Z'),
  ];

  it('a tag on two notes is present in a freshly rebuilt index', () => {
    const index = buildTagIndex(withGarden);

    expect(index).toHaveProperty('garden');
    expect(index['garden']).toEqual(['compost', 'seedlings']);
    expect(getAllTags(index).map((entry) => entry.tag)).toContain('garden');
    expect(getAllTags(index).find((entry) => entry.tag === 'garden')?.count).toBe(2);
  });

  it('the same tag, gone from every note, is absent from the next rebuild', () => {
    const removed = withGarden.map((n) => ({
      ...n,
      tags: n.tags.filter((tag) => tag.trim().toLowerCase() !== 'garden'),
    }));
    const index = buildTagIndex(removed);

    expect(index).not.toHaveProperty('garden');
    expect(getAllTags(index).map((entry) => entry.tag)).not.toContain('garden');
    // The rebuild is fresh state, not a merge: the other tags survive.
    expect(Object.keys(index)).toEqual(['meta', 'soil']);
  });

  it('every status stays in scope for tag browsing (archived included)', () => {
    const rows = NOTE_STATUSES.map((status, i) =>
      note(`note-${i}`, ['shared'], `2026-03-0${i + 1}T10:00:00.000Z`, status),
    );
    expect(getAllTags(buildTagIndex(rows))).toEqual([{ tag: 'shared', count: 4 }]);

    const tagged = getNotesForTag(
      rows.map((n) => ({
        slug: n.slug,
        title: n.title,
        tags: n.tags,
        status: n.status,
        updated: n.updated,
      })),
      'shared',
    );
    expect(tagged.map((n) => n.status)).toEqual(['archived', 'evergreen', 'growing', 'seed']);
  });
});
