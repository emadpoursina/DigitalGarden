/**
 * F7 Privacy-model regression tests (PRD §7 F7, v1 scope only).
 *
 * Acceptance criteria in scope:
 *   AC1 — notes default to `visibility: private` at creation.
 *   AC2 — in v1 the server ONLY binds localhost; nothing exposes it to
 *          external network addresses.
 *
 * AC3/AC4 (public-only build, private-link redaction) belong to v1.1 F10
 * publishing, which does not exist yet — out of scope and NOT tested here.
 *
 * Coverage notes / deduplication policy
 * ──────────────────────────────────────
 * • private-by-default for `createNote`: already locked in notes.test.ts
 *   ("writes a UTF-8 Markdown file with full frontmatter and defaults",
 *   `note.visibility === 'private'` + re-parse of on-disk bytes). Not
 *   duplicated here; see the cross-reference comment in each block.
 *
 * • private-by-default for `saveCapture` (mode:'new'): already locked in
 *   capture.test.ts ("writes the note verbatim with pinned status/visibility,
 *   then commits", `note.visibility === 'private'`). Not duplicated here.
 *
 * What IS added here:
 *   a. Loopback config — astro.config.mjs has no host exposure; no npm
 *      script passes --host.
 *   b. Private-by-default via parseNoteFile — frontmatter OMITTING the
 *      visibility line yields `'private'` (distinct from the createNote path).
 *   c. Visibility validation — invalid values are rejected by parseNoteFile
 *      and by createNote.
 */

import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createNote, NoteValidationError, parseNoteFile } from './notes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(new URL('../../', import.meta.url).pathname);

function freshVault(): string {
  return mkdtempSync(join(tmpdir(), 'garden-privacy-'));
}

// ---------------------------------------------------------------------------
// (a) Loopback-only config guard (PRD F7 AC2, F8 AC1, NFR "Bind loopback only")
// ---------------------------------------------------------------------------

describe('Loopback-only config (F7 AC2)', () => {
  it('astro.config.mjs does NOT set server.host (no network exposure)', async () => {
    // Dynamic import picks up the actual config object, not a stale require cache.
    const configPath = resolve(REPO_ROOT, 'astro.config.mjs');
    const mod = (await import(configPath)) as { default: Record<string, unknown> };
    const config = mod.default as { server?: { host?: unknown } };

    // `server.host` must be falsy: undefined, false, '', or absent.
    // true or any non-empty string would expose the app beyond loopback.
    const host = config.server?.host;
    expect(
      !host,
      `astro.config.mjs sets server.host = ${JSON.stringify(host)}, ` +
        'which exposes the dev server beyond the loopback interface. ' +
        'PRD F7 AC2: never set server.host or pass --host.',
    ).toBe(true);
  });

  it('no npm script in package.json passes --host', () => {
    const pkgPath = resolve(REPO_ROOT, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const scripts = pkg.scripts ?? {};

    const violating = Object.entries(scripts).filter(([, cmd]) => /--host/.test(cmd));

    expect(
      violating,
      `The following npm scripts pass --host, which exposes the server ` +
        `beyond the loopback interface (PRD F7 AC2): ` +
        violating.map(([k, v]) => `"${k}": "${v}"`).join(', '),
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (b) Private-by-default via parseNoteFile (PRD F7 AC1)
// ---------------------------------------------------------------------------

describe('Private-by-default: parseNoteFile (F7 AC1)', () => {
  //
  // Cross-reference: the createNote path is already locked by notes.test.ts
  // ("writes a UTF-8 Markdown file with full frontmatter and defaults" and
  // the surrounding re-parse). The test below covers the PARSER path
  // independently — a hand-authored file on disk that simply omits the
  // visibility line must also land on 'private'.
  //
  it("omitting the visibility line in frontmatter yields visibility 'private'", () => {
    const raw = [
      '---',
      'title: Untagged Visibility',
      'slug: untagged-visibility',
      // No `visibility:` key at all — the parser must default to 'private'
      'status: seed',
      'created: 2026-10-14',
      'updated: 2026-10-14',
      '---',
      '',
      'A note without an explicit visibility line.',
      '',
    ].join('\n');

    expect(raw).not.toMatch(/visibility:/); // fixture truly omits the key
    const note = parseNoteFile(raw);
    expect(note.visibility).toBe('private');
  });

  it("omitting BOTH status AND visibility defaults both to 'seed' and 'private'", () => {
    const raw = [
      '---',
      'title: Bare Minimum',
      'slug: bare-minimum',
      'created: 2026-10-14',
      'updated: 2026-10-14',
      '---',
      '',
      'Just a title and a slug.',
      '',
    ].join('\n');

    expect(raw).not.toMatch(/visibility:/);
    expect(raw).not.toMatch(/^status:/m);
    const note = parseNoteFile(raw);
    expect(note.visibility).toBe('private');
    expect(note.status).toBe('seed');
  });
});

// ---------------------------------------------------------------------------
// (c) Visibility validation (PRD F7 AC1 — invalid value must be rejected)
// ---------------------------------------------------------------------------

describe('Visibility validation (F7 AC1)', () => {
  it('parseNoteFile rejects an invalid visibility value with NoteValidationError', () => {
    const raw = [
      '---',
      'title: Bad Visibility',
      'slug: bad-visibility',
      'status: seed',
      'visibility: secret', // not in the allowed enum
      'created: 2026-10-14',
      'updated: 2026-10-14',
      '---',
      '',
      'Body.',
      '',
    ].join('\n');

    expect(() => parseNoteFile(raw)).toThrow(NoteValidationError);
    expect(() => parseNoteFile(raw)).toThrow(/Invalid visibility "secret"/);
  });

  it('parseNoteFile rejects visibility: draft (not in enum)', () => {
    const raw = [
      '---',
      'title: Draft Vis',
      'slug: draft-vis',
      'status: seed',
      'visibility: draft',
      'created: 2026-10-14',
      'updated: 2026-10-14',
      '---',
      '',
      'Body.',
      '',
    ].join('\n');

    expect(() => parseNoteFile(raw)).toThrow(NoteValidationError);
    expect(() => parseNoteFile(raw)).toThrow(/Invalid visibility "draft"/);
  });

  it('createNote throws NoteValidationError when given an invalid visibility', () => {
    const vault = freshVault();
    expect(() =>
      createNote(vault, {
        title: 'Invalid Vis Note',
        visibility: 'secret' as never, // deliberately passing a bad value
      }),
    ).toThrow(NoteValidationError);
    expect(() =>
      createNote(vault, {
        title: 'Invalid Vis Note',
        visibility: 'secret' as never,
      }),
    ).toThrow(/Invalid visibility "secret"/);
  });

  it('createNote accepts only the two valid values (private and public)', () => {
    const vault = freshVault();
    const { note: priv } = createNote(vault, { title: 'Private One', visibility: 'private' });
    expect(priv.visibility).toBe('private');

    const { note: pub } = createNote(vault, { title: 'Public One', visibility: 'public' });
    expect(pub.visibility).toBe('public');
  });
});

// ---------------------------------------------------------------------------
// (d) Capture path — cross-reference only (PRD F7 AC1 + F2 AC2)
// ---------------------------------------------------------------------------
//
// saveCapture with mode:'new' ALWAYS pins visibility:'private'.
// This is already regression-locked in capture.test.ts:
//   describe('saveCapture (mode new → seed/private + commit)')
//   → it('writes the note verbatim with pinned status/visibility, then commits')
//   → `expect(note.visibility).toBe('private')`
//
// Not duplicated here to avoid two test files owning the same assertion.
