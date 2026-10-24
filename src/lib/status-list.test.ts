/**
 * F4 T008 tests — `status-list` selection + param-driven copy (plan contract §4).
 *
 * The F6 reuse contract: exact filtering, `updated` DESC with slug ASC
 * tie-break, input never mutated, and copy that NAMES the requested state
 * (never seed-shaped for another one). Pure — no fs, no DOM, no vault.
 */
import { describe, expect, it } from 'vitest';

import { statusEmptyText, statusHeading, statusListCopy, selectByStatus } from './status-list';

interface Fixture {
  slug: string;
  title: string;
  status: string;
  updated: string;
}

function note(slug: string, status: string, updated: string): Fixture {
  return { slug, title: slug.toUpperCase(), status, updated };
}

const ALL: Fixture[] = [
  note('alpha', 'seed', '2026-03-01T10:00:00.000Z'),
  note('beta', 'growing', '2026-03-02T10:00:00.000Z'),
  note('gamma', 'evergreen', '2026-03-03T10:00:00.000Z'),
  note('delta', 'archived', '2026-03-04T10:00:00.000Z'),
  note('epsilon', 'seed', '2026-03-05T10:00:00.000Z'),
  note('zeta', 'growing', '2026-03-06T10:00:00.000Z'),
];

describe('selectByStatus', () => {
  it('filters by EXACT status — every state lists exactly its own notes, newest first', () => {
    expect(selectByStatus(ALL, 'seed').map((n) => n.slug)).toEqual(['epsilon', 'alpha']);
    expect(selectByStatus(ALL, 'growing').map((n) => n.slug)).toEqual(['zeta', 'beta']);
    expect(selectByStatus(ALL, 'evergreen').map((n) => n.slug)).toEqual(['gamma']);
    expect(selectByStatus(ALL, 'archived').map((n) => n.slug)).toEqual(['delta']);
  });

  it('archived never leaks into live states, nor they into archived (US2)', () => {
    const live = new Set(selectByStatus(ALL, 'seed').map((n) => n.slug));
    expect(live.has('delta')).toBe(false);
    expect(selectByStatus(ALL, 'archived').map((n) => n.slug)).not.toContain('alpha');
    // And an exact-match quibble: 'growing' must not match 'evergreen'.
    expect(selectByStatus(ALL, 'growing').map((n) => n.slug)).not.toContain('gamma');
  });

  it('orders newest-updated first (DESC)', () => {
    const input = [
      note('older', 'growing', '2026-01-02T08:00:00.000Z'),
      note('newest', 'growing', '2026-03-05T12:00:00.000Z'),
      note('middle', 'growing', '2026-02-14T09:30:00.000Z'),
    ];

    expect(selectByStatus(input, 'growing').map((n) => n.slug)).toEqual([
      'newest',
      'middle',
      'older',
    ]);
  });

  it('breaks ties on `updated` deterministically by slug ASC', () => {
    const same = '2026-07-01T10:00:00.000Z';
    const input = [note('zulu', 'seed', same), note('alpha', 'seed', same), note('mike', 'seed', same)];

    expect(selectByStatus(input, 'seed').map((n) => n.slug)).toEqual(['alpha', 'mike', 'zulu']);
  });

  it('never mutates the input array', () => {
    const snapshot = [...ALL];
    selectByStatus(ALL, 'seed');
    selectByStatus(ALL, 'archived');
    expect(ALL).toEqual(snapshot);
  });

  it('returns [] when nothing carries the state (empty list for the page)', () => {
    expect(selectByStatus(ALL, 'composting')).toEqual([]);
    expect(selectByStatus([], 'seed')).toEqual([]);
  });

  it('accepts the page-shaped rows ({ slug, title, status, updated })', () => {
    const rows = selectByStatus(
      [{ slug: 's', title: 'Title', status: 'evergreen', updated: '2026-01-01' }],
      'evergreen',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Title');
  });
});

describe('param-driven copy (D4 — never seed-shaped for another state)', () => {
  it('names each requested state in its heading', () => {
    expect(statusHeading('seed').toLowerCase()).toContain('seed');
    expect(statusHeading('growing').toLowerCase()).toContain('growing');
    expect(statusHeading('evergreen').toLowerCase()).toContain('evergreen');
    expect(statusHeading('archived').toLowerCase()).toContain('archived');
  });

  it('gives each state its own non-seed empty text', () => {
    const empties = ['seed', 'growing', 'evergreen', 'archived'].map(statusEmptyText);
    // Every empty text names its own state …
    expect(empties[0].toLowerCase()).toContain('seed');
    expect(empties[1].toLowerCase()).toContain('growing');
    expect(empties[2].toLowerCase()).toContain('evergreen');
    expect(empties[3].toLowerCase()).toContain('archived');
    // … and they are four DIFFERENT strings, none borrowed from 'seed'.
    expect(new Set(empties).size).toBe(4);
    for (const other of empties.slice(1)) {
      expect(other).not.toBe(empties[0]);
    }
  });

  it('returns heading AND empty together for the F6 consumer', () => {
    expect(statusListCopy('archived')).toEqual({
      heading: statusHeading('archived'),
      empty: statusEmptyText('archived'),
    });
  });

  it('throws for an invalid state — the page 404s before calling (caller error)', () => {
    // Not a fallback: an unknown state reaching the copy helpers is a wiring
    // bug, and a silent seed-shaped default would be exactly the bug D4 bans.
    expect(() => statusHeading('nonsense')).toThrow(/Unknown lifecycle state/);
    expect(() => statusEmptyText('nonsense')).toThrow(/Unknown lifecycle state/);
    expect(() => statusListCopy('')).toThrow(/Unknown lifecycle state/);
  });
});
