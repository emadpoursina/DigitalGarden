/**
 * F3 T007 → F4 T004 — `POST /api/note` save endpoint (plan Interface
 * Contracts §1, F4 extension D3).
 *
 * Deliberately a THIN adapter, mirroring `api/capture.ts`: parse JSON → pure
 * `src/lib/notes.ts` calls → status table. No path logic, no resolution
 * logic, no git anywhere in this file (clarification Q4: F3 edits never
 * create a commit — F9 owns commit-on-save; F4 FR-006: a STATUS save never
 * commits either, and this file has no commit call to reach for).
 *
 * F4 extended payload (Q1): `{ slug, baseHash, force?, body?, status? }`
 * with AT LEAST ONE of `body`/`status`. An omitted field keeps its disk
 * value (disk truth for title/tags/body), so a status-only post cannot
 * clobber an edit made elsewhere and a body-only post cannot flip status.
 *
 *   200 { slug, status, updated, backlinks }   ← backlinks recomputed in THIS request
 *   409 { error:'external-edit-conflict', disk:{ updated, hash } }
 *   404 { error:'note-not-found', slug }
 *   400 { error:'invalid-payload' }    ← nothing written
 *   500 { error:'save-failed', message }
 *   405 JSON for GET
 *
 * Validation order (plan R2): every 400 class is decidable WITHOUT touching
 * the vault — JSON → object → slug → baseHash → presence → types →
 * `status` ∈ enum → `assertValidSlug` → vault ops — so a malformed request
 * can never create a partial write.
 */
import type { APIRoute } from 'astro';

import {
  assertValidSlug,
  ExternalEditConflictError,
  NoteNotFoundError,
  NOTE_STATUSES,
  readNote,
  refreshVaultIndex,
  saveNote,
  type Note,
  type NoteStatus,
} from '../../lib/notes';
import { resolveVaultDir } from '../../lib/vault';

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'invalid-payload' });
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return json(400, { error: 'invalid-payload' });
  }

  const { slug, body, baseHash, force, status } = payload as Record<string, unknown>;
  if (typeof slug !== 'string' || !slug.trim()) return json(400, { error: 'invalid-payload' });
  if (typeof baseHash !== 'string' || !baseHash) return json(400, { error: 'invalid-payload' });
  // Presence rule (Q1): at least one of `body` / `status` — a payload that
  // carries neither is a no-op the handler refuses instead of pretending to save.
  if (body === undefined && status === undefined) return json(400, { error: 'invalid-payload' });
  if (body !== undefined && typeof body !== 'string') return json(400, { error: 'invalid-payload' });
  if (status !== undefined && typeof status !== 'string') return json(400, { error: 'invalid-payload' });
  if (force !== undefined && typeof force !== 'boolean') {
    return json(400, { error: 'invalid-payload' });
  }
  // Out-of-enum status is rejected BEFORE any vault read/write (plan R2), so
  // a typo can never dress itself up as a 404/500 — and never lands on disk.
  if (status !== undefined && !(NOTE_STATUSES as readonly string[]).includes(status)) {
    return json(400, { error: 'invalid-payload' });
  }
  // A slug that can never name a file (path separators, case, …) is a bad
  // field, not a missing note — reject before touching the vault.
  try {
    assertValidSlug(slug);
  } catch {
    return json(400, { error: 'invalid-payload' });
  }

  const vault = resolveVaultDir();
  try {
    // Disk truth first: an OMITTED field keeps its on-disk value — a
    // status-only save can never clobber a body edited elsewhere, and a
    // body-only save can never flip status (spec FR-005, Q1).
    const current = readNote(vault, slug);
    const next: Note = {
      ...current,
      ...(body !== undefined ? { body } : {}),
      ...(status !== undefined ? { status: status as NoteStatus } : {}),
    };
    const { note } = saveNote(
      vault,
      next,
      {
        baseSlug: slug,
        // The conflict check compares hashes only; `mtimeMs` is carried by
        // the snapshot type but the contract's request carries `baseHash`.
        baseSnapshot: { slug, mtimeMs: 0, hash: baseHash },
        force: force ?? false,
      },
    );
    // D6 / FR-006: re-read the vault into the backlink index inside the same
    // save request, so the response's `backlinks` already reflects what was
    // just written (AC2's automated evidence, plan §1).
    const index = refreshVaultIndex(vault);
    return json(200, {
      slug: note.slug,
      status: note.status,
      updated: note.updated,
      backlinks: index.backlinks,
    });
  } catch (err) {
    if (err instanceof NoteNotFoundError) {
      return json(404, { error: 'note-not-found', slug });
    }
    if (err instanceof ExternalEditConflictError) {
      return json(409, {
        error: 'external-edit-conflict',
        disk: { updated: err.diskNote.updated, hash: err.diskSnapshot.hash },
      });
    }
    return json(500, {
      error: 'save-failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

export const GET: APIRoute = () => json(405, { error: 'method-not-allowed' });
