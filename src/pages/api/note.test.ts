/**
 * F3 T008 — `/api/note` contract tests (plan Interface Contracts §1).
 *
 * The handler is invoked DIRECTLY (no server, no network): each test points
 * `GARDEN_VAULT_DIR` at a fresh `mkdtemp` vault with its own `git init` and
 * one seed commit, so `git log` gives Q4 ("F3 saves create NO commit") a
 * baseline to assert against. The repository's own `vault/` listing is
 * snapshotted around the suite to prove nothing is written outside the
 * temp vaults.
 */
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createNote, readNote, readNoteWithSnapshot } from '../../lib/notes';
import { VAULT_DIR_ENV } from '../../lib/vault';
import { GET, POST } from './note';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEMP_DIRS: string[] = [];
const ORIGINAL_VAULT_OVERRIDE = process.env[VAULT_DIR_ENV];
const REPO_VAULT = join(process.cwd(), 'vault');
const REPO_VAULT_SNAPSHOT = existsSync(REPO_VAULT) ? readdirSync(REPO_VAULT).sort() : null;

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'F3 Tester',
  GIT_AUTHOR_EMAIL: 'f3-tester@example.com',
  GIT_COMMITTER_NAME: 'F3 Tester',
  GIT_COMMITTER_EMAIL: 'f3-tester@example.com',
};

let vault = '';
/** Paths chmod'ed down by a test, restored to `mode` in afterEach. */
const CHMOD_EDITS: Array<{ path: string; mode: number }> = [];

function makeVault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dg-api-note-'));
  TEMP_DIRS.push(dir);
  execFileSync('git', ['-C', dir, 'init', '-q'], { env: GIT_ENV });
  return dir;
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: GIT_ENV });
}

function seedCommit(dir: string): void {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'chore: seed vault');
}

async function post(body: unknown): Promise<Response> {
  const request = new Request('http://localhost/api/note', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return (await POST({ request } as unknown as Parameters<typeof POST>[0])) as Response;
}

async function get(): Promise<Response> {
  const request = new Request('http://localhost/api/note', { method: 'GET' });
  return (await GET({ request } as unknown as Parameters<typeof GET>[0])) as Response;
}

function hashOf(slug: string): string {
  return readNoteWithSnapshot(vault, slug).snapshot.hash;
}

function bytes(slug: string): Buffer {
  return readFileSync(join(vault, `${slug}.md`));
}

beforeEach(() => {
  vault = makeVault();
  process.env[VAULT_DIR_ENV] = vault;
});

afterEach(() => {
  delete process.env[VAULT_DIR_ENV];
  for (const { path, mode } of CHMOD_EDITS) {
    try {
      chmodSync(path, mode);
    } catch {
      /* best effort: the temp entry may already be gone */
    }
  }
  CHMOD_EDITS.length = 0;
});

afterAll(() => {
  if (ORIGINAL_VAULT_OVERRIDE === undefined) delete process.env[VAULT_DIR_ENV];
  else process.env[VAULT_DIR_ENV] = ORIGINAL_VAULT_OVERRIDE;
  for (const dir of TEMP_DIRS) rmSync(dir, { recursive: true, force: true });

  // Nothing was ever written outside the temp vaults.
  if (REPO_VAULT_SNAPSHOT !== null) {
    expect(readdirSync(REPO_VAULT).sort()).toEqual(REPO_VAULT_SNAPSHOT);
  }
});

// ---------------------------------------------------------------------------
// T007/T008 — endpoint contract
// ---------------------------------------------------------------------------

describe('POST /api/note', () => {
  it('200: saves the body and returns backlinks recomputed in the SAME request (AC2/D6)', async () => {
    createNote(vault, { title: 'Beta Note', slug: 'beta', body: 'target' });
    createNote(vault, { title: 'Alpha', slug: 'alpha', body: 'page-load body' });
    const baseHash = hashOf('alpha');

    const res = await post({
      slug: 'alpha',
      body: 'See [[beta]] and [[No Such Note]].',
      baseHash,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as {
      slug: string;
      updated: string;
      backlinks: Record<string, Array<{ fromSlug: string; linkText: string }>>;
    };
    expect(body.slug).toBe('alpha');
    expect(typeof body.updated).toBe('string');
    expect(body.updated.length).toBeGreaterThan(0);
    // No further index refresh happened — the response already carries the
    // link created by THIS save, and the unresolved target contributes none.
    expect(body.backlinks).toEqual({
      beta: [{ fromSlug: 'alpha', linkText: 'beta' }],
    });
    // …and the bytes on disk really are the saved body.
    expect(readNote(vault, 'alpha').body).toBe('See [[beta]] and [[No Such Note]].');
  });

  it('200: an empty body is a valid save (a note may be a stub)', async () => {
    createNote(vault, { title: 'Stub', slug: 'stub', body: 'full text' });
    const res = await post({ slug: 'stub', body: '', baseHash: hashOf('stub') });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string; backlinks: unknown };
    expect(body.slug).toBe('stub');
    expect(body.backlinks).toEqual({});
    expect(readNote(vault, 'stub').body).toBe('');
  });

  it('404: unknown slug', async () => {
    const res = await post({ slug: 'missing-note', body: 'x', baseHash: 'deadbeef' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'note-not-found', slug: 'missing-note' });
  });

  it('400: malformed payload → invalid-payload with the vault untouched', async () => {
    createNote(vault, { title: 'Untouched', slug: 'untouched', body: 'original' });
    const before = bytes('untouched');
    const filesBefore = readdirSync(vault).sort();

    const malformed = await post('{not json');
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: 'invalid-payload' });

    const notAnObject = await post(['slug']);
    expect(notAnObject.status).toBe(400);
    expect(await notAnObject.json()).toEqual({ error: 'invalid-payload' });

    const missingHash = await post({ slug: 'untouched', body: 'x' });
    expect(missingHash.status).toBe(400);

    const emptySlug = await post({ slug: '   ', body: 'x', baseHash: 'h' });
    expect(emptySlug.status).toBe(400);

    const nonStringBody = await post({ slug: 'untouched', body: 42, baseHash: 'h' });
    expect(nonStringBody.status).toBe(400);

    const nonBooleanForce = await post({
      slug: 'untouched',
      body: 'x',
      baseHash: 'h',
      force: 'yes',
    });
    expect(nonBooleanForce.status).toBe(400);

    // A path-shaped slug can never name a note file → bad field, not 404.
    const traversal = await post({ slug: '../escape', body: 'x', baseHash: 'h' });
    expect(traversal.status).toBe(400);
    expect(await traversal.json()).toEqual({ error: 'invalid-payload' });

    for (const res of [missingHash, emptySlug, nonStringBody, nonBooleanForce]) {
      expect(res.headers.get('content-type')).toContain('application/json');
    }
    expect(bytes('untouched')).toEqual(before);
    expect(readdirSync(vault).sort()).toEqual(filesBefore);
    expect(existsSync(join(vault, '..', 'escape.md'))).toBe(false);
  });

  it('409 then force:true: external edit is never silently overwritten (FR-007)', async () => {
    createNote(vault, { title: 'Conflict', slug: 'conflict', body: 'page-load body' });
    const staleHash = hashOf('conflict');
    const file = join(vault, 'conflict.md');

    // Someone edits the file behind the app's back while the buffer is open.
    writeFileSync(file, `${readFileSync(file, 'utf8')}external change\n`, 'utf8');
    const external = readFileSync(file);

    const conflict = await post({ slug: 'conflict', body: 'my buffer', baseHash: staleHash });
    expect(conflict.status).toBe(409);
    const conflictBody = (await conflict.json()) as {
      error: string;
      disk: { updated: string; hash: string };
    };
    expect(conflictBody.error).toBe('external-edit-conflict');
    expect(typeof conflictBody.disk.updated).toBe('string');
    expect(conflictBody.disk.updated.length).toBeGreaterThan(0);
    expect(conflictBody.disk.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(conflictBody.disk.hash).not.toBe(staleHash);
    // Neither side changed: the external edit is still on disk, buffer unsaved.
    expect(readFileSync(file)).toEqual(external);

    // Explicit overwrite (the Overwrite control only) → 200 and the buffer lands.
    const forced = await post({
      slug: 'conflict',
      body: 'my buffer',
      baseHash: staleHash,
      force: true,
    });
    expect(forced.status).toBe(200);
    expect(readNote(vault, 'conflict').body).toBe('my buffer');
  });

  it('500: unwritable vault fails loudly (never silent)', async () => {
    createNote(vault, { title: 'Locked', slug: 'locked', body: 'before' });
    const before = bytes('locked');
    const file = join(vault, 'locked.md');
    const originalMode = statSync(file).mode & 0o777;
    // The FILE is what a save rewrites — take write permission away from it.
    chmodSync(file, 0o444);
    CHMOD_EDITS.push({ path: file, mode: originalMode });

    const res = await post({ slug: 'locked', body: 'after', baseHash: hashOf('locked') });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('save-failed');
    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeGreaterThan(0);
    expect(bytes('locked')).toEqual(before);
  });

  it('405 JSON for GET', async () => {
    const res = await get();
    expect(res.status).toBe(405);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'method-not-allowed' });
  });

  it('Q4: a save creates NO git commit — the seed commit is still HEAD', async () => {
    createNote(vault, { title: 'Tracked', slug: 'tracked', body: 'v1' });
    createNote(vault, { title: 'Linked', slug: 'linked', body: 'v1' });
    seedCommit(vault);

    const logBefore = git(vault, 'log', '--oneline');
    expect(git(vault, 'log', '-1', '--format=%s').trim()).toBe('chore: seed vault');

    const res = await post({ slug: 'tracked', body: 'v2 with [[linked]]', baseHash: hashOf('tracked') });
    expect(res.status).toBe(200);

    // Same history — the edit is on disk, uncommitted (F9 owns commit-on-save).
    expect(git(vault, 'log', '--oneline')).toBe(logBefore);
    expect(git(vault, 'log', '--oneline').trim().split('\n')).toHaveLength(1);
    expect(readNote(vault, 'tracked').body).toBe('v2 with [[linked]]');
    // …and git can see the working-tree change, i.e. nothing was committed.
    expect(git(vault, 'status', '--porcelain')).toContain('tracked.md');
    expect(statSync(join(vault, 'tracked.md')).isFile()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F4 T005 — extended status contract (plan Interface Contracts §1, D3, Q1/Q5)
// ---------------------------------------------------------------------------

describe('POST /api/note — F4 status contract', () => {
  /** Everything a status-only save must leave byte-identical on disk. */
  function contentOf(slug: string): Record<string, unknown> {
    const n = readNote(vault, slug);
    return {
      title: n.title,
      slug: n.slug,
      tags: n.tags,
      body: n.body,
      visibility: n.visibility,
      created: n.created,
    };
  }

  it('200: status-only save flips status, keeps disk truth, bumps `updated` monotonically (AC2/Q5)', async () => {
    createNote(vault, {
      title: 'Lifecycle',
      slug: 'lifecycle',
      body: 'the original body',
      tags: ['alpha', 'beta'],
    });
    const before = readNote(vault, 'lifecycle');
    expect(before.status).toBe('seed');
    const contentBefore = contentOf('lifecycle');
    const filesBefore = readdirSync(vault).sort();

    const res = await post({
      slug: 'lifecycle',
      status: 'growing',
      baseHash: hashOf('lifecycle'),
    });

    expect(res.status).toBe(200);
    const sent = (await res.json()) as { slug: string; status: string; updated: string; backlinks: unknown };
    expect(sent.slug).toBe('lifecycle');
    expect(sent.status).toBe('growing'); // 200 carries the SAVED value (contract §1)
    expect(typeof sent.updated).toBe('string');

    const after = readNote(vault, 'lifecycle');
    expect(after.status).toBe('growing');
    // Disk truth for every field that was NOT sent (Q1) — byte-identical.
    expect(contentOf('lifecycle')).toEqual(contentBefore);
    expect(after.body).toBe('the original body');
    expect(after.tags).toEqual(['alpha', 'beta']);
    // Q5: monotonic, never strict inequality (same-millisecond writes happen).
    expect(after.updated >= before.updated).toBe(true);
    // Only the note file changed — no new files appeared.
    expect(readdirSync(vault).sort()).toEqual(filesBefore);
  });

  it('200: body + status in one payload both apply', async () => {
    createNote(vault, { title: 'Both Fields', slug: 'both-fields', body: 'before' });
    const baseHash = hashOf('both-fields');

    const res = await post({
      slug: 'both-fields',
      body: 'after',
      status: 'evergreen',
      baseHash,
    });

    expect(res.status).toBe(200);
    const sent = (await res.json()) as { status: string };
    expect(sent.status).toBe('evergreen');
    const note = readNote(vault, 'both-fields');
    expect(note.body).toBe('after');
    expect(note.status).toBe('evergreen');
  });

  it('400: out-of-enum status → invalid-payload with the vault completely untouched', async () => {
    createNote(vault, { title: 'Untouched Status', slug: 'untouched-status', body: 'keep me' });
    const before = bytes('untouched-status');
    const filesBefore = readdirSync(vault).sort();

    for (const bad of ['mature', 'SEED', 42, '', null]) {
      const res = await post({
        slug: 'untouched-status',
        status: bad,
        baseHash: hashOf('untouched-status'),
      });
      expect(res.status).toBe(400);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.json()).toEqual({ error: 'invalid-payload' });
      expect(bytes('untouched-status')).toEqual(before);
      expect(readdirSync(vault).sort()).toEqual(filesBefore);
    }
    expect(readNote(vault, 'untouched-status').status).toBe('seed');
  });

  it('400: { slug, baseHash } with neither body nor status (at-least-one rule, Q1)', async () => {
    createNote(vault, { title: 'No Fields', slug: 'no-fields', body: 'stays' });
    const before = bytes('no-fields');

    const res = await post({ slug: 'no-fields', baseHash: hashOf('no-fields') });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid-payload' });
    expect(bytes('no-fields')).toEqual(before);
  });

  it('409 then force:true: a stale-hash status change never silently overwrites disk (SC-002)', async () => {
    createNote(vault, { title: 'Status Conflict', slug: 'status-conflict', body: 'page-load body' });
    const staleHash = hashOf('status-conflict');
    const file = join(vault, 'status-conflict.md');
    writeFileSync(file, `${readFileSync(file, 'utf8')}external change\n`, 'utf8');
    const external = readFileSync(file);

    const conflict = await post({
      slug: 'status-conflict',
      status: 'evergreen',
      baseHash: staleHash,
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: 'external-edit-conflict' });
    // Nothing written: neither the external edit nor the status moved.
    expect(readFileSync(file)).toEqual(external);
    expect(readNote(vault, 'status-conflict').status).toBe('seed');

    const forced = await post({
      slug: 'status-conflict',
      status: 'evergreen',
      baseHash: staleHash,
      force: true,
    });
    expect(forced.status).toBe(200);
    const note = readNote(vault, 'status-conflict');
    expect(note.status).toBe('evergreen'); // the status applied…
    expect(note.body).toContain('external change'); // …and the DISK body survived (disk truth)
  });

  it('FR-006: a status save creates NO git commit — the seed commit is still HEAD', async () => {
    createNote(vault, { title: 'Committed Seed', slug: 'committed-seed', body: 'v1' });
    seedCommit(vault);
    const logBefore = git(vault, 'log', '--oneline');

    const res = await post({
      slug: 'committed-seed',
      status: 'archived',
      baseHash: hashOf('committed-seed'),
    });
    expect(res.status).toBe(200);
    expect(readNote(vault, 'committed-seed').status).toBe('archived');

    expect(git(vault, 'log', '--oneline')).toBe(logBefore);
    expect(git(vault, 'log', '--oneline').trim().split('\n')).toHaveLength(1);
    // …and git sees the working-tree change, i.e. the status landed uncommitted.
    expect(git(vault, 'status', '--porcelain')).toContain('committed-seed.md');
  });

  it('regression: F3 body-save behavior is untouched by the extension', async () => {
    // The eight F3 cases above run untouched in the same suite; this pins the
    // two contract facts the extension could have disturbed: a body-only save
    // still does NOT flip status, and it now reports the status it kept.
    createNote(vault, { title: 'Body Only', slug: 'body-only', body: 'v1', tags: ['t'] });
    const res = await post({ slug: 'body-only', body: 'v2', baseHash: hashOf('body-only') });
    expect(res.status).toBe(200);
    const sent = (await res.json()) as { status: string; backlinks: unknown };
    expect(sent.status).toBe('seed');
    expect(sent.backlinks).toEqual({});
    const note = readNote(vault, 'body-only');
    expect(note.body).toBe('v2');
    expect(note.status).toBe('seed');
    expect(note.tags).toEqual(['t']);
  });
});
