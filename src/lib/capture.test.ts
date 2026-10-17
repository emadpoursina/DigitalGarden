/**
 * F2 T008/T009 tests — capture save path: tags, commit message, file-scoped
 * commit, `saveCapture` validation/order/budget.
 *
 * Hermetic by construction: every vault is a `mkdtemp` directory under
 * `TMPDIR` (its own `git init` where needed). Nothing here reads or writes
 * the repository's own `vault/`, and nothing here commits to the feature
 * branch — the runtime commits of this feature are exercised ONLY against
 * these temp repos.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CAPTURE_COMMIT_TIMEOUT_MS,
  CAPTURE_IDENTITY_ENV,
  captureCommitMessage,
  commitCapture,
  parseCaptureTags,
  saveCapture,
} from './capture';
import { createNote, deleteNote, readNote, slugify } from './notes';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEMP_DIRS: string[] = [];

/** Identity keys saved/restored around the suite (see plan R3). */
const ORIGINAL_IDENTITY: Record<string, string | undefined> = {};

function makeVault(withGit: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'dg-capture-'));
  TEMP_DIRS.push(dir);
  if (withGit) execFileSync('git', ['-C', dir, 'init', '-q']);
  return dir;
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
}

/** True when the repo has at least one commit. */
function hasCommit(dir: string): boolean {
  try {
    git(dir, 'rev-parse', '--verify', '--quiet', 'HEAD');
    return true;
  } catch {
    return false;
  }
}

beforeAll(() => {
  for (const key of CAPTURE_IDENTITY_ENV) {
    ORIGINAL_IDENTITY[key] = process.env[key];
    if (!process.env[key]) {
      process.env[key] = key.endsWith('EMAIL') ? 'capture-test@example.com' : 'Capture Test';
    }
  }
});

afterAll(() => {
  for (const key of CAPTURE_IDENTITY_ENV) {
    const original = ORIGINAL_IDENTITY[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
  for (const dir of TEMP_DIRS) rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// T008 — tags, commit message, commitCapture
// ---------------------------------------------------------------------------

describe('parseCaptureTags', () => {
  it('splits on commas, trims, and drops empties', () => {
    expect(parseCaptureTags('memory, spaced , ,retrieval')).toEqual([
      'memory',
      'spaced',
      'retrieval',
    ]);
  });

  it('returns [] for empty input', () => {
    expect(parseCaptureTags('')).toEqual([]);
    expect(parseCaptureTags('  , , ')).toEqual([]);
  });
});

describe('captureCommitMessage', () => {
  it('returns the exact D3 literal', () => {
    expect(captureCommitMessage('probe-note')).toBe('docs(note): capture probe-note');
    expect(captureCommitMessage('title-2')).toBe('docs(note): capture title-2');
  });

  it('uses the plan\'s literal ~900 ms commit timeout', () => {
    expect(CAPTURE_COMMIT_TIMEOUT_MS).toBe(900);
  });
});

describe('commitCapture', () => {
  it('commits ONLY the note file — a pre-staged unrelated file stays staged', async () => {
    const vault = makeVault(true);
    createNote(vault, { title: 'Probe Note', body: 'hello' });
    writeFileSync(join(vault, 'unrelated.md'), 'not mine to commit\n');
    git(vault, 'add', 'unrelated.md');

    const result = await commitCapture(vault, 'probe-note');
    expect(result).toEqual({ committed: true });

    expect(git(vault, 'log', '-1', '--format=%s').trim()).toBe(
      'docs(note): capture probe-note',
    );
    const committedFiles = git(vault, 'show', '--pretty=format:', '--name-only', 'HEAD')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(committedFiles).toEqual(['probe-note.md']);

    // R4: the pathspec commit must not sweep unrelated staged work.
    const staged = git(vault, 'diff', '--cached', '--name-only')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(staged).toEqual(['unrelated.md']);
  });

  it('degrades to { committed:false, reason } on a non-repo vault (never throws)', async () => {
    const vault = makeVault(false);
    createNote(vault, { title: 'Plain Vault Note' });

    const result = await commitCapture(vault, 'plain-vault-note');
    expect(result.committed).toBe(false);
    expect(typeof (result as { reason?: string }).reason).toBe('string');
    expect((result as { reason: string }).reason.length).toBeGreaterThan(0);
  });

  it('never throws for a missing vault directory', async () => {
    const missing = join(tmpdir(), `dg-capture-missing-${Date.now()}`);
    const result = await commitCapture(missing, 'nope');
    expect(result.committed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T009 — saveCapture
// ---------------------------------------------------------------------------

describe('saveCapture validation (FR-013, before any fs write or git call)', () => {
  it.each(['', '   ', '\t  \n'])(
    'empty/whitespace title → invalid title-required with NO write and NO commit',
    async (title) => {
      const vault = makeVault(true);

      const result = await saveCapture(vault, { title });
      expect(result).toEqual({ kind: 'invalid', error: 'title-required' });

      // No fs write: the vault holds no new file (only its own .git)...
      expect(readdirSync(vault).filter((name) => name !== '.git')).toEqual([]);
      // ...and no git call produced a commit.
      expect(hasCommit(vault)).toBe(false);
    },
  );

  it('rejects a title on a vault directory that does not exist yet (no mkdir)', async () => {
    const missing = join(tmpdir(), `dg-capture-uncreated-${Date.now()}-${Math.random()}`);
    const result = await saveCapture(missing, { title: '   ' });
    expect(result).toEqual({ kind: 'invalid', error: 'title-required' });
    expect(existsSync(missing)).toBe(false);
  });

  it('rejects malformed payloads as invalid-payload', async () => {
    const vault = makeVault(false);
    const base = { title: 'Fine Title' };
    expect(await saveCapture(vault, { ...base, title: 123 } as never)).toEqual({
      kind: 'invalid',
      error: 'invalid-payload',
    });
    expect(await saveCapture(vault, { ...base, body: 42 } as never)).toEqual({
      kind: 'invalid',
      error: 'invalid-payload',
    });
    expect(await saveCapture(vault, { ...base, tagsText: ['a'] } as never)).toEqual({
      kind: 'invalid',
      error: 'invalid-payload',
    });
    expect(await saveCapture(vault, { ...base, mode: 'overwrite' } as never)).toEqual({
      kind: 'invalid',
      error: 'invalid-payload',
    });
    expect(readdirSync(vault)).toEqual([]);
  });
});

describe('saveCapture (mode new → seed/private + commit)', () => {
  it('writes the note verbatim with pinned status/visibility, then commits', async () => {
    const vault = makeVault(true);
    const body = 'first line\n\n```ts\nconst x = 1;\n```\n\n- bullet';

    const result = await saveCapture(vault, {
      title: 'Retrieval Practice',
      body,
      tagsText: 'memory, Memory, ,spaced',
      mode: 'new',
    });

    expect(result.kind).toBe('saved');
    if (result.kind !== 'saved') return;
    expect(result.slug).toBe('retrieval-practice');
    expect(result.status).toBe('seed');
    expect(result.git.committed).toBe(true);
    expect(result.git.reason).toBeUndefined();

    const note = readNote(vault, 'retrieval-practice');
    expect(note.status).toBe('seed');
    expect(note.visibility).toBe('private');
    expect(note.slug).toBe('retrieval-practice');
    expect(note.body).toBe(body); // verbatim: multi-line + fences intact
    expect(note.tags).toEqual(['memory', 'spaced']); // F1 normalization owner

    const raw = readFileSync(join(vault, 'retrieval-practice.md'), 'utf8');
    expect(raw).toContain('```ts\nconst x = 1;\n```');

    expect(git(vault, 'log', '-1', '--format=%s').trim()).toBe(
      'docs(note): capture retrieval-practice',
    );
    const committedFiles = git(vault, 'show', '--pretty=format:', '--name-only', 'HEAD')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(committedFiles).toEqual(['retrieval-practice.md']);
  });

  it('writes-then-commits: a non-repo vault still saves with git.committed:false', async () => {
    const vault = makeVault(false);

    const result = await saveCapture(vault, { title: 'No Git Here', body: 'kept' });
    expect(result.kind).toBe('saved');
    if (result.kind !== 'saved') return;
    expect(result.git.committed).toBe(false);
    expect(result.git.reason).toBeTruthy();
    expect(readNote(vault, 'no-git-here').body).toBe('kept');
  });

  it('maps SlugConflictError to conflict WITHOUT overwriting the existing note', async () => {
    const vault = makeVault(true);
    const first = await saveCapture(vault, { title: 'Twice Saved', body: 'original body' });
    expect(first.kind).toBe('saved');
    const before = readFileSync(join(vault, 'twice-saved.md'));

    const second = await saveCapture(vault, { title: 'Twice Saved', body: 'should not land' });
    expect(second).toEqual({ kind: 'conflict', slug: 'twice-saved' });
    expect(readFileSync(join(vault, 'twice-saved.md'))).toEqual(before);
    expect(readNote(vault, 'twice-saved').body).toBe('original body');
  });

  it('treats a trash-freed slug as free (no conflict, D2/D3, FR-004/013)', async () => {
    const vault = makeVault(true);
    createNote(vault, { title: 'Temporary Thought' });
    deleteNote(vault, 'temporary-thought');
    expect(existsSync(join(vault, 'temporary-thought.md'))).toBe(false);

    const result = await saveCapture(vault, { title: 'Temporary Thought', body: 'again' });
    expect(result.kind).toBe('saved');
    if (result.kind !== 'saved') return;
    expect(result.slug).toBe('temporary-thought');
    expect(result.git.committed).toBe(true);
  });
});

describe('saveCapture (mode unique → F1 auto-uniquifies)', () => {
  it('creates title-2 for a second identical title', async () => {
    const vault = makeVault(true);
    const first = await saveCapture(vault, { title: 'Same Title', mode: 'unique' });
    expect(first.kind === 'saved' && first.slug).toBe('same-title');

    const second = await saveCapture(vault, { title: 'Same Title', body: 'b', mode: 'unique' });
    expect(second.kind).toBe('saved');
    if (second.kind !== 'saved') return;
    expect(second.slug).toBe('same-title-2');
    expect(second.git.committed).toBe(true);
    expect(readNote(vault, 'same-title').body).toBe('');
    expect(readNote(vault, 'same-title-2').body).toBe('b');
  });

  it('slugifies slugged-equivalent titles to the same base slug', () => {
    expect(slugify('Café Society')).toBe(slugify('Cafe Society'));
    expect(slugify('Café Society')).toBe('cafe-society');
  });
});

describe('saveCapture fs failures', () => {
  it('returns { kind: error } instead of throwing', async () => {
    // A file where the vault directory should be → mkdir/write fails.
    const asFile = join(tmpdir(), `dg-capture-not-a-dir-${Date.now()}.md`);
    writeFileSync(asFile, 'i am a file, not a directory\n');
    TEMP_DIRS.push(asFile);

    const result = await saveCapture(asFile, { title: 'Cannot Write Here' });
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe('saveCapture latency (SC-002 < 1000 ms)', () => {
  it('save+commit completes under 1000 ms over 5 consecutive runs', async () => {
    const vault = makeVault(true);
    const elapsed: number[] = [];

    for (let i = 1; i <= 5; i++) {
      const start = performance.now();
      const result = await saveCapture(vault, {
        title: `Perf Capture ${i}`,
        body: `body ${i}`,
        tagsText: 'perf, timing',
      });
      elapsed.push(performance.now() - start);
      expect(result.kind).toBe('saved');
    }

    expect(elapsed).toHaveLength(5);
    for (const ms of elapsed) expect(ms).toBeLessThan(1000);
    expect(git(vault, 'log', '--oneline', '--format=%s')).toContain(
      'docs(note): capture perf-capture-5',
    );
  });
});
