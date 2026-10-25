/**
 * F5 T003 — pure, DOM-free search decision module (spec FR-003/004/005/010;
 * plan Interface Contracts §1 + Research R1/R2/R6; locked decisions D1/D6/D7).
 *
 * Same pattern as F3's `wikilink-client.ts` and F2's `capture-client.ts`:
 * every side effect (DOM, navigation, timers) stays in `src/pages/search.astro`,
 * so the whole surface is testable under plain `vitest run` with no browser.
 *
 * Contents:
 *   - `SEARCH_OPTIONS` / `SEARCH_DEFAULTS` — the MiniSearch contract (Q1, R1)
 *   - `buildSearchIndex` / `searchIndex` — index construction + ranked query
 *     with the default-exclude archive filter (D5)
 *   - `buildSnippet` — ~160-char escaped window around the earliest body hit
 *     with a single `<mark>`, plus the title/tag-only fallback (D6, Q3)
 *   - `upsertDoc` / `removeDoc` — the in-memory session-refresh half of D4
 *   - `resultsKeyCommand` + `moveSelection` — container-scoped results keys
 *     (D7; `moveSelection` is F3's wrap discipline, re-exported verbatim)
 *   - `escapeHtml` — the escape primitive shared by snippet rendering
 *
 * `SearchDoc` is imported TYPE-ONLY from `./notes`: no runtime dependency on
 * F1, zero hunks in `notes.ts` (D8), and nothing here ever touches the vault.
 */

import MiniSearch, { type Options, type SearchOptions } from 'minisearch';

import type { SearchDoc } from './notes';

// F3's wrap discipline, single-sourced (plan §1: "re-export or duplicate —
// tasks pin"); `wikilink-client.ts` is DOM-free, so this pulls in no DOM.
export { moveSelection } from './wikilink-client';

/* ------------------------------------------------------------------ *
 * R1 / Q1 — MiniSearch configuration (locked; do not re-tune here)
 * ------------------------------------------------------------------ */

/**
 * Index construction options, verbatim from plan §1: `slug` as identity and
 * exactly the fields rows display (D1) plus `status` for the D5 archive
 * filter. `body` is deliberately NOT stored — rows read snippets from the
 * embedded `SearchDoc[]` lookup, so the index heap holds display data only.
 *
 * `tags` is a `string[]`, which MiniSearch would not tokenize; `extractField`
 * joins it with spaces so tag terms index as text (Q1). Two details of
 * minisearch@7.2.0 shape that join:
 *
 * 1. **`extractField` also feeds `storeFields`** (`dist/es/index.js:1868`) —
 *    the joined string IS what `search()` hands back as `result.tags`, so
 *    {@link searchIndex} splits it back into the authored `string[]` (D1 row
 *    display set). To keep that round-trip exact for tags that themselves
 *    contain spaces (`"machine learning"` is a legal tag — `normalizeTags`
 *    only trims and dedupes), inner spaces are encoded as NBSP before the
 *    space-join: the default tokenizer splits on `[\n\r\p{Z}\p{P}]` and NBSP
 *    is `\p{Z}` (`index.js:2002`), so tokenization is unchanged, while
 *    splitting the stored value on `' '` stays unambiguous.
 * 2. Tokenization runs through `stringifyField` (`index.js:716`), so the
 *    stored/indexed value is `fieldValue.toString()` — no extra work needed.
 *
 * **Implementation note (Q1 vs minisearch@7.2.0)**: plan §1 writes `boost`
 * as a top-level constructor key, but in the installed 7.2.0 `Options<T>`
 * carries no `boost` — query-time options live under `searchOptions` (a
 * top-level `boost` would be accepted at runtime and silently ignored,
 * `dist/es/index.js:676` + `:1578`). So the title boost is set where it is
 * actually read: the constructor's `searchOptions.boost`, which every
 * `search()` call inherits (`:1565`) and per-call options merge over without
 * clobbering (`SEARCH_DEFAULTS` carries no `boost`). Values are unchanged:
 * title ×2, exactly as Q1 locked.
 */
export const SEARCH_OPTIONS: Options<SearchDoc> = {
  fields: ['title', 'body', 'tags'],
  idField: 'slug',
  storeFields: ['title', 'slug', 'tags', 'status'],
  extractField: (doc: SearchDoc, field: string): unknown => {
    if (field !== 'tags') return (doc as unknown as Record<string, unknown>)[field];
    // Q1: join tags with spaces so tag terms index as text. Inner spaces of
    // a single tag become NBSP first (see the header note) so the join stays
    // losslessly splittable when `storeFields` stores this same value.
    return (doc.tags ?? []).map((tag) => tag.replace(/ /g, '\u00A0')).join(' ');
  },
  searchOptions: { boost: { title: 2 } },
};

/**
 * Default query options (plan §1/R1): as-you-type prefix matching, typo
 * tolerance at a fractional fuzziness, and `AND` so multi-word queries narrow
 * instead of exploding into a low-relevance tail.
 */
export const SEARCH_DEFAULTS: SearchOptions = {
  prefix: true,
  fuzzy: 0.2,
  combineWith: 'AND',
};

/** A live MiniSearch instance over {@link SearchDoc}s. */
export type SearchIndex = MiniSearch<SearchDoc>;

/**
 * What a row can display, straight from the stored fields (D1). `slug` is
 * carried explicitly so callers never depend on MiniSearch's `id` shape.
 */
export interface StoredHit {
  slug: string;
  title: string;
  tags: string[];
  status: string;
}

/**
 * Build the client index: one fresh `MiniSearch` per `/search` load, no DOM.
 * Rebuilding per load IS the freshness path for cross-load reads (D4/R4);
 * in-session edits go through {@link upsertDoc} + `index.replace`.
 */
export function buildSearchIndex(docs: SearchDoc[]): SearchIndex {
  const index = new MiniSearch<SearchDoc>(SEARCH_OPTIONS);
  index.addAll(docs);
  return index;
}

/**
 * Run a query and return display-ready hits, ranked by relevance (title hits
 * boosted). An empty/whitespace query runs NO search — `[]`, so the caller
 * shows the empty-prompt state (FR-005).
 *
 * Archived docs stay in the index carrying their `status` (D5) and are
 * filtered here unless the archive filter is on.
 */
export function searchIndex(
  index: SearchIndex,
  query: string,
  options: { archiveShown: boolean },
): StoredHit[] {
  if (!query.trim()) return [];

  const results = index.search(query, SEARCH_DEFAULTS);
  const hits: StoredHit[] = [];

  for (const result of results) {
    const status = typeof result.status === 'string' ? result.status : '';
    if (!options.archiveShown && status === 'archived') continue;

    hits.push({
      slug: typeof result.slug === 'string' ? result.slug : String(result.id),
      title: typeof result.title === 'string' ? result.title : '',
      tags: storedTags(result.tags),
      status,
    });
  }

  return hits;
}

/**
 * Recover the authored `string[]` from what `storeFields` gives back.
 *
 * `saveStoredFields` stores whatever {@link SEARCH_OPTIONS.extractField}
 * returns (`minisearch/dist/es/index.js:1868`), i.e. the space-joined string
 * from Q1 — so a stored string is split on `' '` (unambiguous: inner tag
 * spaces were encoded as NBSP at extract time, see SEARCH_OPTIONS) and its
 * NBSPs decoded back to spaces. An already-array value (no join happened)
 * passes through untouched.
 */
function storedTags(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value !== 'string' || value === '') return [];
  return value.split(' ').map((tag) => tag.replace(/\u00A0/g, ' '));
}

/* ------------------------------------------------------------------ *
 * R2 / D6 / Q3 — snippet window
 * ------------------------------------------------------------------ */

/** Target snippet length in characters (D6 "~160 chars"). */
export const SNIPPET_LENGTH = 160;

export interface Snippet {
  /** Pre-escaped HTML: at most one `<mark>` around the first body hit. */
  html: string;
  /** `false` when no query term occurs in the body (title/tag-only hit). */
  matched: boolean;
}

/** Escape the four characters that matter for HTML text/attribute context. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Earliest case-insensitive occurrence of ANY term, or `null` (R2). */
function earliestHit(
  body: string,
  terms: string[],
): { start: number; end: number } | null {
  const haystack = body.toLowerCase();
  let best: { start: number; end: number } | null = null;

  for (const raw of terms) {
    const term = raw.trim().toLowerCase();
    if (!term) continue;
    const at = haystack.indexOf(term);
    if (at < 0) continue;
    if (best === null || at < best.start) best = { start: at, end: at + term.length };
  }

  return best;
}

/** Advance a mid-word start forward to the next word boundary (never past `floor`). */
function clampStart(body: string, start: number, floor: number): number {
  if (start <= 0) return 0;
  // Already sitting just after whitespace — nothing to trim.
  if (/\s/.test(body[start - 1] ?? '')) return start;

  const m = /\s/.exec(body.slice(start));
  if (!m) return start;
  const candidate = start + m.index + 1;
  return candidate <= floor ? candidate : start;
}

/** Retreat a mid-word end back to the last word boundary (never before `floor`). */
function clampEnd(body: string, end: number, floor: number): number {
  if (end >= body.length) return body.length;
  // Ending exactly on whitespace is already a boundary.
  if (/\s/.test(body[end] ?? '')) return end;

  let lastWhitespace = -1;
  for (let i = end - 1; i > floor; i -= 1) {
    if (/\s/.test(body[i - 1] ?? '')) {
      lastWhitespace = i;
      break;
    }
  }
  return lastWhitespace > floor ? lastWhitespace : end;
}

/** Word-clamped ~160-char window that keeps `[from, to)` fully inside it. */
function snippetWindow(
  body: string,
  from: number,
  to: number,
): [number, number] {
  const span = to - from;
  const lead = Math.max(0, Math.floor((SNIPPET_LENGTH - span) / 2));

  let start = Math.max(0, from - lead);
  let end = Math.min(body.length, start + SNIPPET_LENGTH);
  start = Math.max(0, end - SNIPPET_LENGTH);

  // Never let the window geometry crowd out the match itself.
  if (start > from) start = from;
  if (end < to) end = to;

  start = clampStart(body, start, from);
  end = clampEnd(body, end, to);
  if (start > from) start = from;
  if (end < to) end = to;

  return [start, end];
}

/**
 * Build the row snippet (D6 + Q3, R2):
 *
 * - earliest case-insensitive term hit in the body → ~160-char word-clamped
 *   window around it, HTML-escaped, first hit only wrapped in `<mark>`
 * - no body hit (title/tag-only match) → escaped leading ~160 chars,
 *   `matched: false`, never a `<mark>` (highlighting must not lie)
 * - empty body → `{ html: '', matched: false }`
 *
 * Escape-then-mark ordering is the XSS posture: body HTML and the query term
 * are both escaped, so `<script>` and `<img onerror=…>` render as text.
 */
export function buildSnippet(body: string, terms: string[]): Snippet {
  if (!body) return { html: '', matched: false };

  const hit = earliestHit(body, terms);

  if (!hit) {
    const end = clampEnd(body, Math.min(body.length, SNIPPET_LENGTH), 0);
    return { html: escapeHtml(body.slice(0, end)), matched: false };
  }

  const [start, end] = snippetWindow(body, hit.start, hit.end);
  const text = body.slice(start, end);
  const local = hit.start - start;
  const marked = text.slice(local, local + (hit.end - hit.start));

  return {
    html:
      escapeHtml(text.slice(0, local)) +
      '<mark>' +
      escapeHtml(marked) +
      '</mark>' +
      escapeHtml(text.slice(local + marked.length)),
    matched: true,
  };
}

/* ------------------------------------------------------------------ *
 * R5 / D4 — in-memory session refresh (never mutates its input)
 * ------------------------------------------------------------------ */

/** Replace the doc with the same slug, or append it. Input stays untouched. */
export function upsertDoc(docs: SearchDoc[], doc: SearchDoc): SearchDoc[] {
  const at = docs.findIndex((d) => d.slug === doc.slug);
  if (at < 0) return [...docs, doc];

  const next = docs.slice();
  next[at] = doc;
  return next;
}

/** Drop the doc with the given slug (no-op if absent). Input stays untouched. */
export function removeDoc(docs: SearchDoc[], slug: string): SearchDoc[] {
  return docs.filter((d) => d.slug !== slug);
}

/* ------------------------------------------------------------------ *
 * R6 / D7 — results-panel key router (container-scoped by construction)
 * ------------------------------------------------------------------ */

export type ResultsKeyCommand = 'up' | 'down' | 'enter';

/**
 * THE results key router (D7/FR-010): returns a command only while the
 * results panel holds focus, and only for ArrowUp/ArrowDown/Enter. Every
 * other key — printable or not — maps to `null`, so nothing here can hijack
 * typing or the caret. The page wires ONE listener ON the panel, so focus
 * outside the panel never reaches this function at all.
 */
export function resultsKeyCommand(input: {
  key: string;
  panelFocused: boolean;
}): ResultsKeyCommand | null {
  if (!input.panelFocused) return null;

  switch (input.key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'Enter':
      return 'enter';
    default:
      return null;
  }
}
