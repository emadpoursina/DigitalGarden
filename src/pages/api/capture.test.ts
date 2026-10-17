/**
 * F2 T011/T020 — `/api/capture` contract tests (plan Interface Contracts §1).
 *
 * The handler is invoked DIRECTLY (no server, no network): each test points
 * `GARDEN_VAULT_DIR` at a fresh `mkdtemp` vault with its own `git init`, so
 * every assertion runs against a hermetic temp repo. The repository's own
 * `vault/` listing is snapshotted around the suite to prove no note is ever
 * written outside the temp vault (T020 done-when).
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { CAPTURE_IDENTITY_ENV } from '../../lib/capture';
import { createNote, deleteNote } from '../../lib/notes';
import { VAULT_DIR_ENV } from '../../lib/vault';
import { GET, POST } from './capture';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEMP_DIRS: string[] = [];
const ORIGINAL_IDENTITY: Record<string, string | undefined> = {};
const ORIGINAL_VAULT_OVERRIDE = process.env[VAULT_DIR_ENV];

const REPO_VAULT = join(process.cwd(), 'vault');
const REPO_VAULT_SNAPSHOT = existsSync(REPO_VAULT) ? readdirSync(REPO_VAULT).sort() : null;

let vault = '';

function makeVault(withGit: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'dg-api-capture-'));
  TEMP_DIRS.push(dir);
  if (withGit) execFileSync('git', ['-C', dir, 'init', '-q']);
  return dir;
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
}

function hasCommit(dir: string): boolean {
  try {
    git(dir, 'rev-parse', '--verify', '--quiet', 'HEAD');
    return true;
  } catch {
    return false;
  }
}

/** Live note files in the vault (trash/dot-dirs excluded by F1 semantics). */
function noteFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort();
}

async function post(body: unknown): Promise<Response> {
  const request = new Request('http://localhost/api/capture', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return (await POST({ request } as unknown as Parameters<typeof POST>[0])) as Response;
}

async function get(): Promise<Response> {
  const request = new Request('http://localhost/api/capture', { method: 'GET' });
  return (await GET({ request } as unknown as Parameters<typeof GET>[0])) as Response;
}

beforeAll(() => {
  for (const key of CAPTURE_IDENTITY_ENV) {
    ORIGINAL_IDENTITY[key] = process.env[key];
    if (!process.env[key]) {
      process.env[key] = key.endsWith('EMAIL') ? 'capture-test@example.com' : 'Capture Test';
    }
  }
});

beforeEach(() => {
  vault = makeVault(true);
  process.env[VAULT_DIR_ENV] = vault;
});

afterEach(() => {
  delete process.env[VAULT_DIR_ENV];
});

afterAll(() => {
  if (ORIGINAL_VAULT_OVERRIDE === undefined) delete process.env[VAULT_DIR_ENV];
  else process.env[VAULT_DIR_ENV] = ORIGINAL_VAULT_OVERRIDE;
  for (const key of CAPTURE_IDENTITY_ENV) {
    const original = ORIGINAL_IDENTITY[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
  for (const dir of TEMP_DIRS) rmSync(dir, { recursive: true, force: true });

  // T020: nothing was ever written outside the temp vaults.
  if (REPO_VAULT_SNAPSHOT !== null) {
    expect(readdirSync(REPO_VAULT).sort()).toEqual(REPO_VAULT_SNAPSHOT);
  }
});

// ---------------------------------------------------------------------------
// T011 — endpoint contract
// ---------------------------------------------------------------------------

describe('POST /api/capture', () => {
  it('201 happy capture: body shape + note + commit in the temp vault', async () => {
    const res = await post({
      title: 'Probe Note',
      body: 'hello **world**',
      tagsText: 'a, A, b',
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      slug: string;
      status: string;
      git: { committed: boolean; reason?: string };
    };
    expect(body.slug).toBe('probe-note');
    expect(body.status).toBe('seed');
    expect(body.git).toEqual({ committed: true });

    expect(noteFiles(vault)).toEqual(['probe-note.md']);
    expect(git(vault, 'log', '-1', '--format=%s').trim()).toBe(
      'docs(note): capture probe-note',
    );
  });

  it('400 title-required for a whitespace title, with the vault still empty', async () => {
    const res = await post({ title: '   \t ' });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'title-required' });
    expect(noteFiles(vault)).toEqual([]);
    expect(hasCommit(vault)).toBe(false);
  });

  it('201 degraded: non-repo vault still saves with git.committed:false + reason', async () => {
    const plain = makeVault(false);
    process.env[VAULT_DIR_ENV] = plain;

    const res = await post({ title: 'No Git Vault', body: 'still saved' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { slug: string; status: string; git: { committed: boolean; reason?: string } };
    expect(body.slug).toBe('no-git-vault');
    expect(body.status).toBe('seed');
    expect(body.git.committed).toBe(false);
    expect(typeof body.git.reason).toBe('string');
    expect(body.git.reason!.length).toBeGreaterThan(0);
    expect(noteFiles(plain)).toEqual(['no-git-vault.md']);
  });

  it('400 invalid-payload for malformed JSON and a non-string title (U1)', async () => {
    const malformed = await post('{not json');
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: 'invalid-payload' });

    const nonString = await post({ title: 42 });
    expect(nonString.status).toBe(400);
    expect(await nonString.json()).toEqual({ error: 'invalid-payload' });

    const badMode = await post({ title: 'Ok', mode: 'clobber' });
    expect(badMode.status).toBe(400);
    expect(await badMode.json()).toEqual({ error: 'invalid-payload' });

    const notAnObject = await post(['title']);
    expect(notAnObject.status).toBe(400);
    expect(await notAnObject.json()).toEqual({ error: 'invalid-payload' });

    expect(noteFiles(vault)).toEqual([]);
    expect(hasCommit(vault)).toBe(false);
  });

  it('500 save-failed on vault IO failure', async () => {
    const asFile = join(tmpdir(), `dg-api-capture-not-a-dir-${Date.now()}.md`);
    writeFileSync(asFile, 'not a directory\n');
    TEMP_DIRS.push(asFile);
    process.env[VAULT_DIR_ENV] = asFile;

    const res = await post({ title: 'Cannot Save Here' });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('save-failed');
    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeGreaterThan(0);
  });

  it('405 JSON for GET', async () => {
    const res = await get();
    expect(res.status).toBe(405);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe('string');
  });

  it('submit → response latency < 1000 ms per attempt (AC2)', async () => {
    const start = performance.now();
    const res = await post({ title: 'Latency Probe', body: 'fast' });
    const elapsed = performance.now() - start;

    expect(res.status).toBe(201);
    expect(elapsed).toBeLessThan(1000);
  });

  it('p95 < 1000 ms over 20 consecutive captures (SC-002, orchestrator G1)', async () => {
    const samples: number[] = [];

    for (let i = 1; i <= 20; i++) {
      const start = performance.now();
      const res = await post({ title: `P95 Capture ${i}`, body: `body ${i}` });
      samples.push(performance.now() - start);
      expect(res.status).toBe(201);
    }

    expect(samples).toHaveLength(20);
    const sorted = [...samples].sort((a, b) => a - b);
    // Nearest-rank p95 over 20 samples = the 19th value (index 18).
    const p95 = sorted[Math.ceil(0.95 * samples.length) - 1];
    expect(p95).toBeLessThan(1000);
    for (const ms of samples) expect(ms).toBeLessThan(1000);
    expect(noteFiles(vault)).toHaveLength(20);
  }, 120000);
});

// ---------------------------------------------------------------------------
// T020 — collision contract (US4, FR-008/009, SC-005)
// ---------------------------------------------------------------------------

describe('POST /api/capture collision contract', () => {
  it('second identical title → 409 slug-conflict with NOTHING overwritten', async () => {
    const first = await post({ title: 'Twice Captured', body: 'original body' });
    expect(first.status).toBe(201);
    const file = join(vault, 'twice-captured.md');
    const before = readFileSync(file);

    const second = await post({ title: 'Twice Captured', body: 'replacement body' });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: 'slug-conflict', slug: 'twice-captured' });

    // Bytes identical: nothing overwritten, merged, or dropped.
    expect(readFileSync(file)).toEqual(before);
    expect(noteFiles(vault)).toEqual(['twice-captured.md']);
    expect(git(vault, 'log', '-1', '--format=%s').trim()).toBe(
      'docs(note): capture twice-captured',
    );
  });

  it("mode:'unique' → 201 with the first free slug …-2", async () => {
    expect((await post({ title: 'Duplicate Title', mode: 'new' })).status).toBe(201);

    const res = await post({ title: 'Duplicate Title', body: 'second', mode: 'unique' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { slug: string; status: string };
    expect(body.slug).toBe('duplicate-title-2');
    expect(body.status).toBe('seed');
    expect(noteFiles(vault).sort()).toEqual(['duplicate-title-2.md', 'duplicate-title.md']);
  });

  it('slugged-equivalent titles collide (Café Society / Cafe Society)', async () => {
    const first = await post({ title: 'Café Society', body: 'accented' });
    expect(first.status).toBe(201);
    const before = readFileSync(join(vault, 'cafe-society.md'));

    const second = await post({ title: 'Cafe Society', body: 'plain' });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: 'slug-conflict', slug: 'cafe-society' });
    expect(readFileSync(join(vault, 'cafe-society.md'))).toEqual(before);
    expect(noteFiles(vault)).toEqual(['cafe-society.md']);
  });

  it('a slug freed by trash → 201 with no conflict (FR-008)', async () => {
    createNote(vault, { title: 'Fleeting Thought', body: 'draft' });
    deleteNote(vault, 'fleeting-thought');
    expect(existsSync(join(vault, 'fleeting-thought.md'))).toBe(false);

    const res = await post({ title: 'Fleeting Thought', body: 'again' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { slug: string };
    expect(body.slug).toBe('fleeting-thought');
    expect(noteFiles(vault)).toEqual(['fleeting-thought.md']);
  });

  it('reuses a trash-freed slug under mode:unique too', async () => {
    createNote(vault, { title: 'Reused Slug' });
    deleteNote(vault, 'reused-slug');

    const res = await post({ title: 'Reused Slug', mode: 'unique' });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { slug: string }).slug).toBe('reused-slug');
  });
});
