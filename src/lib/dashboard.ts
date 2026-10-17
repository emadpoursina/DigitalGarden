/**
 * F2 T012 — dashboard recent-notes selection (plan §4 "Recent notes",
 * spec entity "Recent-Notes Entry", FR-005/US2.2).
 *
 * `selectRecentNotes(notes, limit)` is the dashboard's only ordering rule:
 * sort by `updated` DESC and keep the first `limit` entries. ISO-8601
 * timestamps are compared as plain strings — that is deliberate, not a
 * shortcut: lexicographic order over `YYYY-MM-DD…` equals chronological
 * order, and it also sorts F1's legacy date-only values (`2026-03-01`)
 * correctly against full timestamps (`2026-02-15T09:00:00.000Z`), because
 * a date-only string is a prefix of the longer form of the same instant.
 *
 * Owned exclusively by the implement-E card (T012, FLOW_ID
 * `flow_20261015_2154_f2qc9x`); consumed by `src/pages/index.astro` (T013).
 * Pure and DOM/fs-free — the page does the reading, this does the ordering.
 */

/** The fields ordering needs; `src/lib/notes.ts`'s `Note` satisfies it. */
export interface RecentNoteLike {
  /** Stable identity of the note (also its file name). */
  slug: string;
  /** ISO-8601 `updated` timestamp from the note's frontmatter. */
  updated: string;
}

/** Rows the dashboard shows — spec assumption, plan "Scale/Scope". */
export const RECENT_NOTES_LIMIT = 5;

/**
 * Return the `limit` most-recently-updated notes, newest first.
 *
 * The input array is never mutated (a copy is sorted). Ties on `updated`
 * fall back to `slug` ascending so a dashboard render is deterministic when
 * two notes share a timestamp.
 *
 * @param notes Notes to choose from (usually every live vault note).
 * @param limit How many rows to keep; clamped to a non-negative integer.
 */
export function selectRecentNotes<T extends RecentNoteLike>(
  notes: readonly T[],
  limit: number,
): T[] {
  const cap = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0;

  return [...notes]
    .sort((a, b) => {
      if (a.updated !== b.updated) return a.updated < b.updated ? 1 : -1;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    })
    .slice(0, cap);
}
