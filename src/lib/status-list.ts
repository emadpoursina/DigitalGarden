/**
 * F4 T008 — shared lifecycle-state list selection + copy (plan contract §4).
 *
 * THE F6 reuse surface: `/status/[state]` and the future `/tags/[tag]` both
 * need "filter exactly → order newest-first → param-driven heading/empty
 * copy", so both live here as pure functions. DOM-free and fs-free — the
 * page does the reading, this does the selection and the words.
 *
 * Ordering discipline is `selectRecentNotes`' (F2): ISO-8601 timestamps
 * compared as plain strings (lexicographic === chronological for `YYYY-MM-DD…`),
 * with `slug` ASC as the tie-break so a render never shuffles between requests.
 */
import type { NoteStatus } from './notes';

/** The fields selection needs; `src/lib/notes.ts`'s `Note` satisfies it. */
export interface StatusListNote {
  /** Stable identity of the note (also its file name). */
  slug: string;
  /** Display title (the row's link text). */
  title: string;
  /** One of `NOTE_STATUSES`. */
  status: string;
  /** ISO-8601 `updated` timestamp from the note's frontmatter. */
  updated: string;
}

/**
 * Every note whose status is EXACTLY `state`, newest-updated first.
 *
 * Filtering is exact equality — archived never leaks into a live state and
 * vice versa (spec US2). The input array is never mutated (filter returns a
 * fresh array before the sort). Ties on `updated` fall back to `slug` ASC.
 *
 * `state` is the raw route param: the PAGE validates it against
 * `NOTE_STATUSES` (unknown → 404) before calling, so an invalid state here
 * is a caller error, not a user-facing case.
 */
export function selectByStatus<T extends StatusListNote>(notes: readonly T[], state: string): T[] {
  return notes
    .filter((note) => note.status === state)
    .sort((a, b) => {
      if (a.updated !== b.updated) return a.updated < b.updated ? 1 : -1;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
}

/** Param-driven copy for one state — heading AND empty text together. */
export interface StatusListCopy {
  /** The page `<h1>` for this state. */
  heading: string;
  /** Shown instead of the table when no note carries this state. */
  empty: string;
}

/**
 * Copy is NAMED BY PARAMETER, never seed-shaped for another state (D4):
 * F6 reuses this exact pattern, and a route like `/status/archived` must
 * never greet the reader with "seeds".
 */
const COPY: Record<NoteStatus, StatusListCopy> = {
  seed: {
    heading: 'Seed notes',
    empty: 'No seed notes yet — capture a thought to plant one.',
  },
  growing: {
    heading: 'Growing notes',
    empty: 'No growing notes yet — promote a note once it starts taking shape.',
  },
  evergreen: {
    heading: 'Evergreen notes',
    empty: 'No evergreen notes yet — a well-tended note graduates here.',
  },
  archived: {
    heading: 'Archived notes',
    empty: 'No archived notes yet — archive a note to file it away.',
  },
};

/**
 * Copy lookup. An unknown state throws (caller error): the page 404s before
 * it ever asks, so reaching this with a bad value is a wiring bug worth
 * hearing about — never a silent seed-shaped fallback.
 */
export function statusListCopy(state: string): StatusListCopy {
  const copy = COPY[state as NoteStatus];
  if (!copy) throw new Error(`Unknown lifecycle state "${state}"`);
  return copy;
}

/** The `<h1>` for a state (thin accessor over {@link statusListCopy}). */
export function statusHeading(state: string): string {
  return statusListCopy(state).heading;
}

/** The empty-state sentence for a state (thin accessor over {@link statusListCopy}). */
export function statusEmptyText(state: string): string {
  return statusListCopy(state).empty;
}
