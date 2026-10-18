/**
 * F3 T007 — `POST /api/note` save endpoint (plan Interface Contracts §1).
 *
 * Deliberately a THIN adapter, mirroring `api/capture.ts`: parse JSON → pure
 * `src/lib/notes.ts` calls → status table. No path logic, no resolution
 * logic, no git anywhere in this file (clarification Q4: F3 edits never
 * create a commit — F9 owns commit-on-save).
 *
 *   200 { slug, updated, backlinks }   ← backlinks recomputed in THIS request
 *   409 { error:'external-edit-conflict', disk:{ updated, hash } }
 *   404 { error:'note-not-found', slug }
 *   400 { error:'invalid-payload' }    ← nothing written
 *   500 { error:'save-failed', message }
 *   405 JSON for GET
 *
 * Body-only editing: `title` / `status` / `tags` are re-read from disk so a
 * save can never clobber metadata edited elsewhere (spec FR-005 assumption).
 */
import type { APIRoute } from 'astro';

import {
  assertValidSlug,
  ExternalEditConflictError,
  NoteNotFoundError,
  readNote,
  refreshVaultIndex,
  saveNote,
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

  const { slug, body, baseHash, force } = payload as Record<string, unknown>;
  if (typeof slug !== 'string' || !slug.trim()) return json(400, { error: 'invalid-payload' });
  if (typeof body !== 'string') return json(400, { error: 'invalid-payload' });
  if (typeof baseHash !== 'string' || !baseHash) return json(400, { error: 'invalid-payload' });
  if (force !== undefined && typeof force !== 'boolean') {
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
    const current = readNote(vault, slug);
    const { note } = saveNote(
      vault,
      { ...current, body }, // disk truth for title/status/tags — body-only edit
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
    return json(200, { slug: note.slug, updated: note.updated, backlinks: index.backlinks });
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
