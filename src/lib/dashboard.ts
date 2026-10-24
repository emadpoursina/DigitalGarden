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

/* ================================================================== *
 * F4 T010 — "Seeds needing attention" (D5, plan contract §5, US3)
 * The weekly-tending surface: the seeds that have gone longest without
 * being tended, oldest first, capped at the shipped limit.
 * ================================================================== */

/** What the attention list orders on — the recent shape plus the lifecycle. */
export interface SeedAttentionNote extends RecentNoteLike {
  /** One of `NOTE_STATUSES`; only `'seed'` rows qualify. */
  status: string;
}

/** Rows the seeds section shows (D5 literal — binding for future consumers). */
export const SEEDS_ATTENTION_LIMIT = 5;

/**
 * Return the `limit` SEEDS that have gone least-recently-updated first
 * (ascending — the oldest seed "needs attention" most), capped at `limit`.
 *
 * Filter is exact `status === 'seed'` (growing/evergreen/archived never
 * qualify); ties on `updated` break by `slug` ASC for a deterministic
 * render; the limit is clamped with the same discipline as
 * {@link selectRecentNotes}; the input array is never mutated.
 */
export function selectSeedsNeedingAttention<T extends SeedAttentionNote>(
  notes: readonly T[],
  limit: number,
): T[] {
  const cap = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0;

  return notes
    .filter((note) => note.status === 'seed')
    .sort((a, b) => {
      if (a.updated !== b.updated) return a.updated < b.updated ? -1 : 1;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    })
    .slice(0, cap);
}
