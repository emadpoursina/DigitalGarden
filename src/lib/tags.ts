/**
 * F6 T002 — tag selection + URL codec (plan contract §1, decisions D2/R1/R3).
 *
 * THE F6 decision module: `/tags` and `/tags/[tag]` do the reading (their own
 * tolerant per-note pass), `buildTagIndex` in `src/lib/notes.ts` owns the
 * index construction (trim + lowercase keys, sorted keys, sorted slugs), and
 * THIS file owns everything between the two — projection, membership and the
 * URL codec. DOM-free, fs-free and dependency-free (zero imports on purpose),
 * so `tags.test.ts` can prove the discipline without a browser.
 *
 * Ordering authority lives in ONE place: `buildTagIndex`'s `.sort()`.
 * `getAllTags` therefore projects `Object.keys` order and MUST NOT re-sort —
 * two sort authorities (code-unit vs locale) could diverge and make the tag
 * index disagree with itself.
 */
/** The fields tag browsing needs; `src/lib/notes.ts`'s `Note` satisfies it. */
export interface TaggableNote {
  /** Stable identity of the note (also its file name). */
  slug: string;
  /** Display title (the row's link text). */
  title: string;
  /** Frontmatter tags as written (canonical key is trim + lowercase). */
  tags?: string[];
  /** One of `NOTE_STATUSES` — carried, never filtered (archived included). */
  status: string;
  /** ISO-8601 `updated` timestamp from the note's frontmatter. */
  updated: string;
}

/** One row of the tag index: the canonical key and how many notes carry it. */
export interface TagEntry {
  /** Lowercase canonical tag (the `buildTagIndex` key). */
  tag: string;
  /** `slugs.length` — notes carrying this tag, archived included. */
  count: number;
}

/**
 * Project the tag index into display rows: `[{tag, count}]` in
 * `Object.keys(index)` order.
 *
 * The index is already code-unit sorted by `buildTagIndex`, so this function
 * only projects — no `.sort()`, no `.filter()`, no mutation of the index
 * (asserted by test: a shuffled insertion order comes back in THAT order).
 */
export function getAllTags(tagIndex: Record<string, string[]>): TagEntry[] {
  const entries: TagEntry[] = [];
  for (const key of Object.keys(tagIndex)) {
    entries.push({ tag: key, count: tagIndex[key].length });
  }
  return entries;
}

/**
 * Every note carrying `tag`, newest-updated first.
 *
 * The query is case-folded ONCE (contract §1), each note's tags are folded the
 * same way `buildTagIndex` folds them (trim + lowercase) so the live page and
 * the index can never disagree about membership. Ties on `updated` break to
 * `slug` ASC — the F2/F4 ordering discipline, so a render never shuffles
 * between requests. The input array is never mutated: `filter` returns a fresh
 * array before the sort.
 *
 * An empty query can never match: `buildTagIndex` skips empty keys, and F1's
 * `normalizeTags` drops empty tags at parse time.
 */
export function getNotesForTag<T extends TaggableNote>(notes: readonly T[], tag: string): T[] {
  const key = tag.toLowerCase();
  if (!key) return [];
  return notes
    .filter((note) => (note.tags ?? []).some((candidate) => candidate.trim().toLowerCase() === key))
    .sort((a, b) => {
      if (a.updated !== b.updated) return a.updated < b.updated ? 1 : -1;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
}

/**
 * Canonical link for a tag: `'/tags/' + encodeURIComponent(tag)`.
 *
 * `encodeURIComponent`, never `encodeURI`: a tag lives in exactly ONE path
 * segment, so `/`, `+`, `%` and every non-ASCII character must be percent-
 * encoded or the route would split / mis-decode (`C++` → `/tags/C%2B%2B`,
 * `a/b` → `/tags/a%2Fb`, `50%` → `/tags/50%25`).
 */
export function tagHref(tag: string): string {
  return '/tags/' + encodeURIComponent(tag);
}

/**
 * Route param → canonical lookup key: decode, then lowercase.
 *
 * The `URIError` catch is the reason a mangled URL can never 500: a
 * malformed sequence (`%E0%A4%A`) stays as written, folds to lowercase and
 * simply misses every index key → the page's 200 empty state.
 */
export function decodeTagParam(param: string): string {
  try {
    return decodeURIComponent(param).toLowerCase();
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    return param.toLowerCase();
  }
}
