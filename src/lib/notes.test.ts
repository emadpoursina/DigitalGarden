/**
 * F1 acceptance tests (PRD §7 F1): note storage & CRUD.
 * Each block maps to the card's Acceptance Criteria (AC1–AC5) plus the
 * F3/F5/F6 index hooks and the frontmatter round-trip guarantees.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  archiveNote,
  buildBacklinkIndex,
  buildSearchDocs,
  buildTagIndex,
  checkForExternalEdit,
  createNote,
  deleteNote,
  ExternalEditConflictError,
  extractWikiLinks,
  listNoteSlugs,
  listTrash,
  NoteNotFoundError,
  parseNoteFile,
  readNote,
  readNoteWithSnapshot,
  refreshVaultIndex,
  resolveUniqueSlug,
  resolveWikiLink,
  restoreNote,
  saveNote,
  serializeNote,
  SlugConflictError,
  slugify,
} from './notes';

const FIXED_NOW = '2026-10-15T10:00:00.000Z';

function freshVault(): string {
  return mkdtempSync(join(tmpdir(), 'garden-f1-'));
}

describe('slugify / slug uniqueness (AC2)', () => {
  it('derives URL-safe slugs', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
    expect(slugify('  Café & Crème  ')).toBe('cafe-creme');
    expect(slugify('a/b\\c:d')).toBe('a-b-c-d');
    expect(slugify('')).toBe('note');
    expect(slugify('---')).toBe('note');
  });

  it('auto-uniquifies duplicate titles', () => {
    const vault = freshVault();
    expect(createNote(vault, { title: 'My Idea', now: FIXED_NOW }).note.slug).toBe('my-idea');
    expect(createNote(vault, { title: 'My Idea', now: FIXED_NOW }).note.slug).toBe('my-idea-2');
    expect(createNote(vault, { title: 'My Idea', now: FIXED_NOW }).note.slug).toBe('my-idea-3');
  });

  it('rejects an explicitly requested taken slug', () => {
    const vault = freshVault();
    createNote(vault, { title: 'First', slug: 'taken', now: FIXED_NOW });
    expect(() => createNote(vault, { title: 'Second', slug: 'taken', now: FIXED_NOW })).toThrow(
      SlugConflictError,
    );
  });

  it('rejects a save that would overwrite a different note’s slug', () => {
    const vault = freshVault();
    createNote(vault, { title: 'Alpha', now: FIXED_NOW });
    const { note: beta } = createNote(vault, { title: 'Beta', now: FIXED_NOW });
    expect(() =>
      saveNote(vault, { ...beta, slug: 'alpha' }, { baseSlug: 'beta' }),
    ).toThrow(SlugConflictError);
    // Neither file was clobbered.
    expect(readNote(vault, 'alpha').title).toBe('Alpha');
    expect(readNote(vault, 'beta').title).toBe('Beta');
  });

  it('renames the file when the slug legitimately changes', () => {
    const vault = freshVault();
    const { note } = createNote(vault, { title: 'Old Name', now: FIXED_NOW });
    const { note: renamed } = saveNote(
      vault,
      { ...note, slug: 'new-name' },
      { baseSlug: note.slug },
    );
    expect(renamed.slug).toBe('new-name');
    expect(listNoteSlugs(vault)).toEqual(['new-name']);
  });

  it('resolveUniqueSlug exempts the note being renamed', () => {
    const vault = freshVault();
    createNote(vault, { title: 'Solo', now: FIXED_NOW });
    expect(resolveUniqueSlug(vault, 'solo', 'solo')).toBe('solo');
    expect(resolveUniqueSlug(vault, 'solo')).toBe('solo-2');
  });
});

describe('create / save frontmatter (AC1)', () => {
  it('writes a UTF-8 Markdown file with full frontmatter and defaults', () => {
    const vault = freshVault();
    const { note } = createNote(vault, {
      title: 'Seedling',
      body: 'A rough thought.',
      tags: ['ideas'],
      now: FIXED_NOW,
    });
    expect(note.status).toBe('seed');
    expect(note.visibility).toBe('private');
    expect(note.created).toBe(FIXED_NOW);
    expect(note.updated).toBe(FIXED_NOW);

    const raw = readFileSync(join(vault, 'seedling.md'));
    expect(raw.toString('utf8')).toContain('A rough thought.');
    const parsed = parseNoteFile(raw.toString('utf8'));
    expect(parsed).toMatchObject({
      title: 'Seedling',
      slug: 'seedling',
      tags: ['ideas'],
      status: 'seed',
      visibility: 'private',
      created: FIXED_NOW,
      updated: FIXED_NOW,
    });
  });

  it('bumps updated on save while preserving created', () => {
    const vault = freshVault();
    const { note } = createNote(vault, { title: 'Draft', now: FIXED_NOW });
    const { note: saved } = saveNote(
      vault,
      { ...note, body: 'More text.' },
      { now: '2026-10-16T10:00:00.000Z' },
    );
    expect(saved.created).toBe(FIXED_NOW);
    expect(saved.updated).toBe('2026-10-16T10:00:00.000Z');
  });

  it('round-trips the scaffold sample note byte-shape', () => {
    const sample = [
      '---',
      'title: Welcome to your garden',
      'slug: welcome',
      'tags: [meta]',
      'status: seed',
      'visibility: private',
      'created: 2026-10-14',
      'updated: 2026-10-14',
      '---',
      '',
      '# Welcome',
      '',
      'Hello [[Other Note]]!',
      '',
    ].join('\n');
    const note = parseNoteFile(sample);
    expect(note.slug).toBe('welcome');
    expect(note.tags).toEqual(['meta']);
    const reserialized = parseNoteFile(serializeNote(note));
    expect(reserialized).toEqual(note);
  });

  it('supports block-list tags and preserves unknown keys', () => {
    const raw = [
      '---',
      'title: T',
      'slug: t',
      'tags:',
      '  - alpha',
      '  - beta',
      'status: growing',
      'visibility: private',
      'created: 2026-10-14',
      'updated: 2026-10-15',
      'cssclasses: [wide]',
      '---',
      '',
      'Body.',
      '',
    ].join('\n');
    const note = parseNoteFile(raw);
    expect(note.tags).toEqual(['alpha', 'beta']);
    expect(note.extra).toEqual({ cssclasses: '[wide]' });
    const again = parseNoteFile(serializeNote(note));
    expect(again.extra).toEqual({ cssclasses: '[wide]' });
    expect(again.tags).toEqual(['alpha', 'beta']);
  });

  it('rejects notes without frontmatter or title', () => {
    expect(() => parseNoteFile('# no frontmatter\n')).toThrow();
    expect(() => createNote(freshVault(), { title: '   ' })).toThrow();
  });
});

describe('archive (AC3)', () => {
  it('sets status archived while retaining file and links', () => {
    const vault = freshVault();
    createNote(vault, { title: 'Target', now: FIXED_NOW });
    createNote(vault, { title: 'Linker', body: 'See [[Target]].', now: FIXED_NOW });
    const { note } = archiveNote(vault, 'target', { now: FIXED_NOW });
    expect(note.status).toBe('archived');
    expect(listNoteSlugs(vault)).toContain('target');
    const index = refreshVaultIndex(vault);
    // The archived note stays resolvable: its inbound link survives.
    expect(index.backlinks['target']).toEqual([{ fromSlug: 'linker', linkText: 'Target' }]);
    // …and it remains searchable/filterable by status.
    expect(index.searchDocs.find((d) => d.slug === 'target')?.status).toBe('archived');
  });
});

describe('delete / trash / restore (AC4)', () => {
  it('moves to trash and drops from every index on refresh', () => {
    const vault = freshVault();
    createNote(vault, { title: 'Gone', tags: ['temp'], now: FIXED_NOW });
    createNote(vault, { title: 'Keeper', body: 'Links [[Gone]] here.', now: FIXED_NOW });

    const { trashPath } = deleteNote(vault, 'gone', { now: FIXED_NOW });
    expect(listNoteSlugs(vault)).toEqual(['keeper']);
    expect(() => readNote(vault, 'gone')).toThrow(NoteNotFoundError);

    const trash = listTrash(vault);
    expect(trash).toHaveLength(1);
    expect(trash[0].trashPath).toBe(trashPath);
    expect(trash[0].slug).toBe('gone');

    const index = refreshVaultIndex(vault);
    expect(index.searchDocs.find((d) => d.slug === 'gone')).toBeUndefined();
    expect(index.tags['temp']).toBeUndefined();
    expect(index.backlinks['gone']).toBeUndefined();

    // The slug is freed for reuse.
    expect(createNote(vault, { title: 'Gone', now: FIXED_NOW }).note.slug).toBe('gone');
  });

  it('restores from trash, uniquifying on collision', () => {
    const vault = freshVault();
    createNote(vault, { title: 'Phoenix', now: FIXED_NOW });
    const { trashPath } = deleteNote(vault, 'phoenix', { now: FIXED_NOW });
    void trashPath;
    createNote(vault, { title: 'Phoenix', now: FIXED_NOW }); // reuses the slug
    const trashFile = listTrash(vault)[0].trashFile;
    const { note } = restoreNote(vault, trashFile, { now: FIXED_NOW });
    expect(note.slug).toBe('phoenix-2');
    expect(listTrash(vault)).toHaveLength(0);
  });

  it('throws for unknown slugs', () => {
    const vault = freshVault();
    expect(() => deleteNote(vault, 'missing')).toThrow(NoteNotFoundError);
    expect(() => readNote(vault, 'missing')).toThrow(NoteNotFoundError);
  });
});

describe('external on-disk edits (AC5)', () => {
  it('reports clean when nothing changed', () => {
    const vault = freshVault();
    createNote(vault, { title: 'Stable', body: 'v1', now: FIXED_NOW });
    const { snapshot } = readNoteWithSnapshot(vault, 'stable');
    expect(checkForExternalEdit(vault, 'stable', snapshot)).toEqual({ kind: 'clean' });
  });

  it('reloads newer disk content when the app has no unsaved edits', () => {
    const vault = freshVault();
    createNote(vault, { title: 'Doc', body: 'app version', now: FIXED_NOW });
    const { snapshot } = readNoteWithSnapshot(vault, 'doc');
    // External editor writes directly on disk.
    const disk = readNote(vault, 'doc');
    writeFileSync(
      join(vault, 'doc.md'),
      serializeNote({ ...disk, body: 'external version', updated: '2026-10-16T00:00:00.000Z' }),
      'utf8',
    );
    const status = checkForExternalEdit(vault, 'doc', snapshot, false);
    expect(status.kind).toBe('externally-updated');
    if (status.kind === 'externally-updated') {
      expect(status.note.body).toBe('external version');
    }
  });

  it('warns (conflict) when disk is newer and the app has unsaved edits', () => {
    const vault = freshVault();
    createNote(vault, { title: 'Doc', body: 'saved', now: FIXED_NOW });
    const { snapshot } = readNoteWithSnapshot(vault, 'doc');
    const disk = readNote(vault, 'doc');
    writeFileSync(join(vault, 'doc.md'), serializeNote({ ...disk, body: 'disk newer' }), 'utf8');
    const status = checkForExternalEdit(vault, 'doc', snapshot, true);
    expect(status.kind).toBe('conflict');
    if (status.kind === 'conflict') {
      expect(status.diskNote.body).toBe('disk newer'); // newer content preserved
    }
  });

  it('notices externally deleted files', () => {
    const vault = freshVault();
    createNote(vault, { title: 'Vanish', now: FIXED_NOW });
    const { snapshot } = readNoteWithSnapshot(vault, 'vanish');
    deleteNote(vault, 'vanish', { now: FIXED_NOW });
    expect(checkForExternalEdit(vault, 'vanish', snapshot).kind).toBe('deleted-externally');
  });

  it('saveNote refuses to clobber newer disk content, carrying it in the error', () => {
    const vault = freshVault();
    const { note, snapshot } = createNote(vault, { title: 'Race', body: 'v1', now: FIXED_NOW });
    const disk = readNote(vault, 'race');
    writeFileSync(join(vault, 'race.md'), serializeNote({ ...disk, body: 'disk v2' }), 'utf8');
    let caught: ExternalEditConflictError | null = null;
    try {
      saveNote(vault, { ...note, body: 'app v2' }, { baseSnapshot: snapshot });
    } catch (e) {
      caught = e as ExternalEditConflictError;
    }
    expect(caught).toBeInstanceOf(ExternalEditConflictError);
    expect(caught!.diskNote.body).toBe('disk v2');
    expect(readNote(vault, 'race').body).toBe('disk v2'); // disk untouched
    // Explicit force overwrites.
    const { note: forced } = saveNote(
      vault,
      { ...note, body: 'app v2' },
      { baseSnapshot: snapshot, force: true },
    );
    expect(forced.body).toBe('app v2');
  });
});

describe('index hooks for F3/F5/F6', () => {
  it('extracts wikilinks, skipping code', () => {
    const body = [
      'Real [[Target]] and [[Other|Alias name]] plus [[Target#Section]].',
      '',
      '```',
      '[[Not A Link]]',
      '```',
      '',
      'Inline `[[Also Not]]` here.',
    ].join('\n');
    expect(extractWikiLinks(body)).toEqual([
      { target: 'Target', linkText: 'Target' },
      { target: 'Other', linkText: 'Alias name' },
      { target: 'Target', linkText: 'Target' },
    ]);
  });

  it('resolves links case-insensitively by title or slug', () => {
    const vault = freshVault();
    const a = createNote(vault, { title: 'Artificial Intelligence', now: FIXED_NOW }).note;
    expect(resolveWikiLink('artificial intelligence', [a])).toBe(a.slug);
    expect(resolveWikiLink('ARTIFICIAL-INTELLIGENCE', [a])).toBe(a.slug);
    expect(resolveWikiLink('No Such Note', [a])).toBeNull();
  });

  it('builds backlink, tag, and search indexes in one refresh', () => {
    const vault = freshVault();
    createNote(vault, { title: 'Hub', tags: ['Atlas', 'atlas', ' maps '], now: FIXED_NOW });
    createNote(vault, { title: 'Spoke', body: 'See [[hub]] and [[Missing]].', now: FIXED_NOW });
    const index = refreshVaultIndex(vault);
    expect(index.notes).toHaveLength(2);
    expect(index.snapshots.get('hub')).toBeDefined();
    expect(index.backlinks).toEqual({ hub: [{ fromSlug: 'spoke', linkText: 'hub' }] });
    expect(index.tags).toEqual({ atlas: ['hub'], maps: ['hub'] });
    expect(buildSearchDocs(index.notes).map((d) => d.slug).sort()).toEqual(['hub', 'spoke']);
    expect(buildBacklinkIndex(index.notes)).toEqual(index.backlinks);
    expect(buildTagIndex(index.notes)).toEqual(index.tags);
  });
});
