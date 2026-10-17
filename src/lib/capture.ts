/**
 * F2 T008/T009 — quick-capture save path (plan §2, Research R3/R4).
 *
 * The whole capture operation lives here so it is testable without HTTP:
 *
 *   parseCaptureTags  — split comma-separated tag text, trim, drop empties
 *                       (F1's `createNote` still owns normalization, so
 *                       normalization has exactly one implementation owner).
 *   captureCommitMessage — the literal `docs(note): capture <slug>` (D3).
 *   commitCapture     — best-effort, file-scoped git commit: `add(<slug>.md)`
 *                       then `commit(msg, [<slug>.md])`, bounded by a ~900 ms
 *                       timeout, never throwing (FR-010: capture MUST NOT
 *                       block or fail because of git).
 *   saveCapture       — validate → createNote (write) → commitCapture.
 *                       Order is write-then-commit: a commit failure still
 *                       leaves the note on disk.
 *
 * simple-git footgun (plan R3, binding for F8/F9 too): simple-git@4 strips
 * every `GIT_*` variable from the child env unless the key is allowlisted in
 * `allowEnvironment`, and this host's git identity exists ONLY as the four
 * identity env vars — without the allowlist the commit always fails with
 * `Author identity unknown`.
 *
 * Results are plain data (never thrown): the endpoint maps them to
 * 201 / 409 / 400 / 500 (plan Interface Contracts §1).
 */
import { simpleGit } from 'simple-git';

import {
  createNote,
  slugify,
  SlugConflictError,
  type CreateInput,
} from './notes';

/**
 * Hard ceiling (ms) for each capture git command — the plan's ~900 ms
 * timeout, leaving headroom under the 1 s save+commit budget (SC-002).
 */
export const CAPTURE_COMMIT_TIMEOUT_MS = 900;

/** The four identity keys allowed through simple-git's env guard (plan R3). */
export const CAPTURE_IDENTITY_ENV = [
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
] as const;

/** Two-mode save contract (plan §2, decision A1): `new` explicit slug, `unique` auto-uniquified. */
export type CaptureMode = 'new' | 'unique';

export type CaptureInvalidReason = 'title-required' | 'invalid-payload';

/** Best-effort git outcome attached to every successful save (FR-010). */
export interface CaptureGitResult {
  committed: boolean;
  reason?: string;
}

export interface CaptureInput {
  title: string;
  body?: string;
  tagsText?: string;
  mode?: CaptureMode;
}

export type CaptureResult =
  | { kind: 'invalid'; error: CaptureInvalidReason }
  | { kind: 'conflict'; slug: string }
  | { kind: 'error'; message: string }
  | { kind: 'saved'; slug: string; status: 'seed'; git: CaptureGitResult };

export type CommitCaptureResult = { committed: true } | { committed: false; reason: string };

// ---------------------------------------------------------------------------
// Tags + commit message
// ---------------------------------------------------------------------------

/**
 * Split comma-separated capture tag text into trimmed, non-empty tags.
 * De-duplication/case handling is F1's `normalizeTags` (spec Q5).
 */
export function parseCaptureTags(text: string): string[] {
  if (typeof text !== 'string' || text === '') return [];
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/** D3 literal commit message: `docs(note): capture <slug>`. */
export function captureCommitMessage(slug: string): string {
  return `docs(note): capture ${slug}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Git commit (plan R3/R4)
// ---------------------------------------------------------------------------

/**
 * Commit exactly `<slug>.md` in the vault repo with the capture message.
 *
 * Never throws: every failure (non-repo vault, missing identity, timeout,
 * vanished file) degrades to `{ committed: false, reason }` so the save
 * itself is never reported as failed because of git (FR-010, SC-006).
 * The pathspec commit cannot sweep unrelated staged work (R4).
 */
export async function commitCapture(vaultDir: string, slug: string): Promise<CommitCaptureResult> {
  try {
    const git = simpleGit({
      baseDir: vaultDir,
      allowEnvironment: [...CAPTURE_IDENTITY_ENV],
      timeout: { block: CAPTURE_COMMIT_TIMEOUT_MS },
    });
    const file = `${slug}.md`;
    await git.add(file);
    await git.commit(captureCommitMessage(slug), [file]);
    return { committed: true };
  } catch (err) {
    return { committed: false, reason: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// saveCapture (plan §2 step 1–3)
// ---------------------------------------------------------------------------

/**
 * Validate → create (F1 `createNote`) → commit. Returns plain data:
 *
 * - `invalid`  — before ANY fs write or git call: `title-required` for an
 *   empty/whitespace title (FR-013), `invalid-payload` for a malformed
 *   payload (non-string title/body/tagsText, unknown `mode`).
 * - `conflict` — `mode:'new'` hit a live note's slug (SlugConflictError);
 *   nothing was written or overwritten (FR-008/SC-005).
 * - `error`    — NoteValidationError / fs failure: nothing reported as saved.
 * - `saved`    — note on disk (`status: 'seed'`, `visibility: 'private'`,
 *   slug derived from the title), plus the best-effort `git` outcome.
 */
export async function saveCapture(vaultDir: string, input: CaptureInput): Promise<CaptureResult> {
  const raw: Record<string, unknown> = (input ?? {}) as unknown as Record<string, unknown>;

  // 1. Payload shape (plan §2 step 1) — no fs/git touch before this passes.
  if (typeof raw.title !== 'string') return { kind: 'invalid', error: 'invalid-payload' };
  if (raw.body !== undefined && raw.body !== null && typeof raw.body !== 'string') {
    return { kind: 'invalid', error: 'invalid-payload' };
  }
  if (raw.tagsText !== undefined && raw.tagsText !== null && typeof raw.tagsText !== 'string') {
    return { kind: 'invalid', error: 'invalid-payload' };
  }
  const mode: unknown = raw.mode === undefined || raw.mode === null ? 'new' : raw.mode;
  if (mode !== 'new' && mode !== 'unique') return { kind: 'invalid', error: 'invalid-payload' };

  // 2. Title rule (FR-013) — empty/whitespace blocks BEFORE any write/commit.
  const title: string = raw.title;
  if (title.trim() === '') return { kind: 'invalid', error: 'title-required' };

  const body = typeof raw.body === 'string' ? raw.body : '';
  const tagsText = typeof raw.tagsText === 'string' ? raw.tagsText : '';

  try {
    const createInput: CreateInput = {
      title,
      body,
      tags: parseCaptureTags(tagsText),
      status: 'seed',
      visibility: 'private',
      // D2: `new` pins the title-derived slug (collision → SlugConflictError);
      // `unique` omits it so F1 auto-uniquifies (`title`, `title-2`, …).
      ...(mode === 'new' ? { slug: slugify(title) } : {}),
    };
    const { note } = createNote(vaultDir, createInput);

    // 3. Write-then-commit order (plan §2 step 3, R4).
    const git = await commitCapture(vaultDir, note.slug);
    return { kind: 'saved', slug: note.slug, status: 'seed', git };
  } catch (err) {
    if (err instanceof SlugConflictError) return { kind: 'conflict', slug: err.slug };
    return { kind: 'error', message: errorMessage(err) };
  }
}
