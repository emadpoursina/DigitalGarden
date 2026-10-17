/**
 * F2 T010 — `POST /api/capture` endpoint (plan Interface Contracts §1).
 *
 * Deliberately a THIN adapter: parse JSON → `saveCapture(resolveVaultDir(), …)`
 * → map the plain-data result to the contract's status/body table. No path
 * logic, no validation rules, no git knowledge lives here — all of that is
 * `src/lib/capture.ts`, which is unit-tested without HTTP.
 *
 *   201 { slug, status:'seed', git }
 *   409 { error:'slug-conflict', slug }
 *   400 { error:'title-required' } | { error:'invalid-payload' }
 *   500 { error:'save-failed', message }
 *   405 JSON for GET
 */
import type { APIRoute } from 'astro';

import { saveCapture, type CaptureInput } from '../../lib/capture';
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

  const { title, body, tagsText, mode } = payload as Record<string, unknown>;
  const result = await saveCapture(resolveVaultDir(), {
    title,
    body,
    tagsText,
    mode,
  } as unknown as CaptureInput);

  switch (result.kind) {
    case 'saved':
      return json(201, { slug: result.slug, status: result.status, git: result.git });
    case 'conflict':
      return json(409, { error: 'slug-conflict', slug: result.slug });
    case 'invalid':
      return json(400, { error: result.error });
    case 'error':
      return json(500, { error: 'save-failed', message: result.message });
  }
};

export const GET: APIRoute = () => json(405, { error: 'method-not-allowed' });
