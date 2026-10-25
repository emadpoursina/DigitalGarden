/**
 * F5 T004 tests — `src/lib/search.ts` (plan Interface Contracts §1).
 *
 * Each block maps to a contract line: MiniSearch config + ranking (R1/Q1),
 * snippet window/escape/fallback (R2/D6/Q3), archive filter (D5), list
 * helpers for the in-memory session refresh (D4), and the container-scoped
 * key router (D7). Everything runs under plain `vitest run` — real MiniSearch
 * over fixture `SearchDoc[]`, no browser, no mocks, no fs.
 */
import { describe, expect, it } from 'vitest';

import type { SearchDoc } from './notes';
import {
  SEARCH_DEFAULTS,
  SEARCH_OPTIONS,
  SNIPPET_LENGTH,
  buildSearchIndex,
  buildSnippet,
  escapeHtml,
  moveSelection,
  removeDoc,
  resultsKeyCommand,
  searchIndex,
  upsertDoc,
} from './search';

/** ~200 words of filler so snippet windows have real context to cut. */
const FILLER =
  'quiet morning light settles over the raised beds while the gardener ' +
  'walks the paths with a notebook and a basket for the harvest rows';

function doc(over: Partial<SearchDoc> & { slug: string }): SearchDoc {
  return {
    title: over.slug,
    body: over.body ?? '',
    tags: [],
    status: 'growing',
    visibility: 'private',
    updated: '2026-10-01T10:00:00.000Z',
    ...over,
  };
}

/* ------------------------------------------------------------------ *
 * R1 / Q1 — MiniSearch configuration
 * ------------------------------------------------------------------ */

describe('SEARCH_OPTIONS / SEARCH_DEFAULTS (Q1, locked)', () => {
  it('indexes title/body/tags with title boosted, slug identity, display fields stored', () => {
    expect(SEARCH_OPTIONS.fields).toEqual(['title', 'body', 'tags']);
    // minisearch@7.2.0 reads query-time options from `searchOptions`, where a
    // top-level `boost` would be silently ignored — see SEARCH_OPTIONS docs.
    expect(SEARCH_OPTIONS.searchOptions?.boost).toEqual({ title: 2 });
    expect(SEARCH_OPTIONS.idField).toBe('slug');
    expect(SEARCH_OPTIONS.storeFields).toEqual(['title', 'slug', 'tags', 'status']);
  });

  it('joins tags with spaces so tag terms tokenize (extractField contract)', () => {
    const extract = SEARCH_OPTIONS.extractField;
    expect(typeof extract).toBe('function');
    const tags = ['retrieval-practice', 'spaced-repetition'];
    expect(extract?.(doc({ slug: 'a', tags }), 'tags')).toBe(
      'retrieval-practice spaced-repetition',
    );
    expect(extract?.(doc({ slug: 'a', title: 'Hello' }), 'title')).toBe('Hello');
  });

  it('uses prefix + fractional fuzzy + AND as the query defaults (R1)', () => {
    expect(SEARCH_DEFAULTS).toEqual({ prefix: true, fuzzy: 0.2, combineWith: 'AND' });
  });
});

/* ------------------------------------------------------------------ *
 * buildSearchIndex / searchIndex — ranking, identity, archive filter
 * ------------------------------------------------------------------ */

describe('searchIndex', () => {
  const BODY = `${FILLER} ${FILLER}`;

  const fixtures: SearchDoc[] = [
    doc({ slug: 'title-hit', title: 'garden guide', body: BODY }),
    doc({ slug: 'body-hit', title: 'cooking notes', body: `${BODY} garden` }),
    doc({ slug: 'tag-hit', title: 'reading list', body: BODY, tags: ['garden'] }),
    doc({ slug: 'archived-hit', title: 'garden archive', body: BODY, status: 'archived' }),
    doc({ slug: 'untouched', title: 'other note', body: BODY }),
  ];

  it('ranks a title match above a body-only match for the same term (boost 2)', () => {
    const index = buildSearchIndex(fixtures);
    const slugs = searchIndex(index, 'garden', { archiveShown: false }).map((h) => h.slug);

    expect(slugs).toContain('title-hit');
    expect(slugs).toContain('body-hit');
    expect(slugs.indexOf('title-hit')).toBeLessThan(slugs.indexOf('body-hit'));
  });

  it('matches a tag-only term through the extractField join', () => {
    const index = buildSearchIndex([
      doc({ slug: 'tagged', title: 'a', body: 'nothing relevant', tags: ['mythology'] }),
      doc({ slug: 'plain', title: 'b', body: 'nothing relevant' }),
    ]);

    const slugs = searchIndex(index, 'mythology', { archiveShown: false }).map((h) => h.slug);
    expect(slugs).toEqual(['tagged']);
  });

  it('keeps a multi-word tag exact AND indexes each of its words (Q1 join round-trip)', () => {
    const index = buildSearchIndex([
      doc({ slug: 'multi', title: 'a', body: 'nothing relevant', tags: ['machine learning', 'soil'] }),
      doc({ slug: 'plain', title: 'b', body: 'nothing relevant' }),
    ]);

    // each word of the tag is searchable on its own …
    expect(searchIndex(index, 'learning', { archiveShown: false }).map((h) => h.slug)).toEqual(['multi']);
    expect(searchIndex(index, 'machine', { archiveShown: false }).map((h) => h.slug)).toEqual(['multi']);
    // … and the stored/displayed tags come back exactly as authored
    const hit = searchIndex(index, 'soil', { archiveShown: false })[0];
    expect(hit.tags).toEqual(['machine learning', 'soil']);
  });

  it('treats slug as the identity — discard + re-add replaces by slug', () => {
    const index = buildSearchIndex([doc({ slug: 'one', title: 'before edit' })]);

    expect(index.has('one')).toBe(true);
    index.discard('one');
    expect(index.has('one')).toBe(false);
    expect(searchIndex(index, 'before', { archiveShown: false })).toHaveLength(0);

    index.add(doc({ slug: 'one', title: 'after edit' }));
    const hits = searchIndex(index, 'after', { archiveShown: false });
    expect(hits.map((h) => h.slug)).toEqual(['one']);
    expect(hits[0].title).toBe('after edit');
    expect(index.documentCount).toBe(1);
  });

  it('returns [] for an empty or whitespace-only query (FR-005)', () => {
    const index = buildSearchIndex(fixtures);

    expect(searchIndex(index, '', { archiveShown: false })).toEqual([]);
    expect(searchIndex(index, '   \n\t ', { archiveShown: true })).toEqual([]);
  });

  it('filters archived docs by default and includes them when archiveShown (D5)', () => {
    const index = buildSearchIndex(fixtures);

    const hidden = searchIndex(index, 'garden', { archiveShown: false });
    expect(hidden.map((h) => h.slug)).not.toContain('archived-hit');
    expect(hidden.every((h) => h.status !== 'archived')).toBe(true);

    const shown = searchIndex(index, 'garden', { archiveShown: true });
    expect(shown.map((h) => h.slug)).toContain('archived-hit');
    expect(shown.find((h) => h.slug === 'archived-hit')?.status).toBe('archived');
  });

  it('carries visibility on the doc (carried, never filtered in v1 — D5)', () => {
    const index = buildSearchIndex([
      doc({ slug: 'private-one', title: 'garden', visibility: 'private' }),
      doc({ slug: 'public-one', title: 'garden', visibility: 'public' }),
    ]);

    const slugs = searchIndex(index, 'garden', { archiveShown: false }).map((h) => h.slug);
    expect(slugs).toHaveLength(2);
  });

  it('returns title + slug + tags + status — the row display set (D1)', () => {
    const index = buildSearchIndex([
      doc({ slug: 'display', title: 'garden table', tags: ['a', 'b'], status: 'seed' }),
    ]);

    expect(searchIndex(index, 'garden', { archiveShown: false })).toEqual([
      { slug: 'display', title: 'garden table', tags: ['a', 'b'], status: 'seed' },
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * R2 / D6 / Q3 — snippet window
 * ------------------------------------------------------------------ */

describe('buildSnippet', () => {
  it('wraps the term in exactly one <mark> inside a ~160-char context window', () => {
    const body = `${FILLER} chamomile ${FILLER}`;
    const { html, matched } = buildSnippet(body, ['chamomile']);

    expect(matched).toBe(true);
    expect(html.match(/<mark>/g)).toHaveLength(1);
    expect(html.match(/<\/mark>/g)).toHaveLength(1);
    expect(html).toContain('<mark>chamomile</mark>');
    // window text ≤ SNIPPET_LENGTH, plus the 13 characters of <mark> tags
    expect(html.length).toBeLessThanOrEqual(SNIPPET_LENGTH + 13 + 20);

    const plain = html.replace(/<\/?mark>/g, '');
    expect(plain.length).toBeLessThanOrEqual(SNIPPET_LENGTH);
    expect(body).toContain(plain);
  });

  it('centers on the EARLIEST hit when several terms match (R2)', () => {
    const body = `alpha appears here first, then zulu arrives much later in the line`;
    const { html } = buildSnippet(body, ['zulu', 'alpha']);

    expect(html.indexOf('<mark>alpha</mark>')).toBe(0);
    expect(html).not.toContain('<mark>zulu</mark>');
  });

  it('matches the term case-insensitively and marks it as authored', () => {
    const { html } = buildSnippet('The Garden is waking up.', ['garden']);
    expect(html).toContain('<mark>Garden</mark>');
  });

  it('escapes body HTML — <script> and <img onerror> render as text', () => {
    const body = `intro <img onerror="alert(1)"> then <script>alert(2)</script> ends ${FILLER}`;
    const { html } = buildSnippet(body, ['script']);

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    // The <mark> wraps the matched term wherever it sits, so it may split an
    // already-escaped entity (`&lt;<mark>script</mark>&gt;`) — checking the
    // escaped text with the highlight tags removed asserts the XSS posture:
    // body markup survives only as escaped text.
    const plain = html.replace(/<\/?mark>/g, '');
    expect(plain).toContain('&lt;script&gt;');
    expect(plain).toContain('&lt;img onerror=');
  });

  it('escapes the QUERY term inside the <mark> (edge case: markup query)', () => {
    const body = `unsafe <script> block in the body ${FILLER}`;
    const { html, matched } = buildSnippet(body, ['<script>']);

    expect(matched).toBe(true);
    expect(html).toContain('<mark>&lt;script&gt;</mark>');
    expect(html).not.toContain('<mark><script></mark>');
  });

  it('falls back to the leading ~160 body chars for a title/tag-only hit (Q3)', () => {
    const body = `${FILLER} ${FILLER}`;
    const { html, matched } = buildSnippet(body, ['neverbodysthisword']);

    expect(matched).toBe(false);
    expect(html).not.toContain('<mark>');
    expect(html.length).toBeLessThanOrEqual(SNIPPET_LENGTH);
    expect(body.startsWith(html.replace(/&amp;/g, '&'))).toBe(true);
  });

  it('returns an empty snippet for an empty body — never a hole, never an error', () => {
    expect(buildSnippet('', ['anything'])).toEqual({ html: '', matched: false });
  });

  it('keeps the match intact when it sits near either end of the body', () => {
    const nearStart = `needle ${FILLER} ${FILLER}`;
    const nearEnd = `${FILLER} ${FILLER} needle`;

    for (const body of [nearStart, nearEnd]) {
      const { html, matched } = buildSnippet(body, ['needle']);
      expect(matched).toBe(true);
      expect(html).toContain('<mark>needle</mark>');
    }
  });

  it('handles a term longer than the window without throwing', () => {
    const long = 'x'.repeat(400);
    const { html, matched } = buildSnippet(long, ['x'.repeat(300)]);
    expect(matched).toBe(true);
    expect(html).toContain('<mark>');
  });
});

/* ------------------------------------------------------------------ *
 * R5 / D4 — session-refresh list helpers (no input mutation)
 * ------------------------------------------------------------------ */

describe('upsertDoc / removeDoc', () => {
  const a = doc({ slug: 'a', title: 'A' });
  const b = doc({ slug: 'b', title: 'B' });

  it('replaces by slug without touching the input array', () => {
    const docs = [a, b];
    const updated = doc({ slug: 'a', title: 'A edited' });

    const next = upsertDoc(docs, updated);

    expect(next).toHaveLength(2);
    expect(next[0].title).toBe('A edited');
    expect(next[0]).toBe(updated);
    expect(docs[0].title).toBe('A'); // input untouched
    expect(next).not.toBe(docs);
  });

  it('appends when the slug is new', () => {
    const next = upsertDoc([a], b);
    expect(next.map((d) => d.slug)).toEqual(['a', 'b']);
    expect(next).toHaveLength(2);
  });

  it('drops by slug without mutating the input (no-op when absent)', () => {
    const docs = [a, b];
    const next = removeDoc(docs, 'a');

    expect(next.map((d) => d.slug)).toEqual(['b']);
    expect(docs).toHaveLength(2);
    expect(removeDoc(docs, 'missing')).toEqual([a, b]);
    expect(removeDoc([], 'a')).toEqual([]);
  });

  it('upsert + remove round-trip keeps slug identity (session refresh shape)', () => {
    const docs = [a, b];
    const edited = upsertDoc(docs, doc({ slug: 'a', title: 'A2' }));
    const removed = removeDoc(edited, 'b');

    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ slug: 'a', title: 'A2' });
  });
});

/* ------------------------------------------------------------------ *
 * R6 / D7 — results key router + F3 wrap discipline
 * ------------------------------------------------------------------ */

describe('resultsKeyCommand', () => {
  it('returns null for EVERY key while the panel is not focused (D7)', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'Enter', 'a', 'k', 'Escape', 'Tab', ' ']) {
      expect(resultsKeyCommand({ key, panelFocused: false })).toBeNull();
    }
  });

  it('maps exactly ArrowUp/ArrowDown/Enter when the panel IS focused', () => {
    expect(resultsKeyCommand({ key: 'ArrowUp', panelFocused: true })).toBe('up');
    expect(resultsKeyCommand({ key: 'ArrowDown', panelFocused: true })).toBe('down');
    expect(resultsKeyCommand({ key: 'Enter', panelFocused: true })).toBe('enter');
  });

  it('maps every other focused key to null (no printable binding)', () => {
    for (const key of ['a', 'k', 'K', 'Escape', 'Tab', 'Space', ' ', 'F5']) {
      expect(resultsKeyCommand({ key, panelFocused: true })).toBeNull();
    }
  });
});

describe('moveSelection (F3 wrap discipline, re-exported)', () => {
  it('wraps at both ends', () => {
    expect(moveSelection(1, 3, 0)).toBe(1);
    expect(moveSelection(1, 3, 2)).toBe(0); // down past the end wraps
    expect(moveSelection(-1, 3, 0)).toBe(2); // up past the start wraps
    expect(moveSelection(-1, 3, 2)).toBe(1);
  });

  it('starts selection at the first row when nothing is selected yet', () => {
    expect(moveSelection(1, 3, -1)).toBe(0);
    expect(moveSelection(-1, 3, -1)).toBe(2);
  });

  it('returns -1 when there is nothing to pick', () => {
    expect(moveSelection(1, 0, 0)).toBe(-1);
    expect(moveSelection(-1, 0, -1)).toBe(-1);
  });
});

/* ------------------------------------------------------------------ *
 * escapeHtml — shared escape primitive
 * ------------------------------------------------------------------ */

describe('escapeHtml', () => {
  it('escapes &, <, > and "', () => {
    expect(escapeHtml('&<>"')).toBe('&amp;&lt;&gt;&quot;');
  });

  it('escapes ampersands first so entities are not double-escaped wrongly', () => {
    expect(escapeHtml('<a href="x">&amp;</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;amp;&lt;/a&gt;',
    );
  });

  it('leaves ordinary text alone', () => {
    expect(escapeHtml('plain garden text')).toBe('plain garden text');
  });
});
