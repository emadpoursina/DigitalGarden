/**
 * F1 — Note storage & CRUD (PRD §7 F1).
 *
 * Every note is a plain UTF-8 Markdown file with YAML frontmatter living in
 * the configured vault directory. This module is the single persistence
 * layer for notes; the Astro UI (F8), quick capture (F2), and git history
 * (F9) all build on top of it.
 *
 * PRD acceptance-criteria map:
 *   AC1 (create/save writes UTF-8 Markdown + full frontmatter): createNote,
 *       saveNote, serializeNote.
 *   AC2 (URL-safe unique slug; reject overwriting another note's slug):
 *       slugify, resolveUniqueSlug, SlugConflictError in createNote/saveNote.
 *   AC3 (archive keeps file + links): archiveNote (status → archived only).
 *   AC4 (delete → recoverable trash, dropped from indexes on refresh):
 *       deleteNote (+ restoreNote / listTrash), refreshVaultIndex.
 *   AC5 (external on-disk edits reload, warn on conflicting unsaved edits):
 *       NoteSnapshot, checkForExternalEdit, ExternalEditConflictError in
 *       saveNote. The future editor (F8) owns the in-app buffer; this module
 *       reports disk-vs-snapshot state so the editor can reload cleanly or
 *       warn on conflict. Newer on-disk content is never silently discarded:
 *       saveNote throws (carrying the disk note) unless `force: true`.
 *
 * Index-refresh hooks for future consumers (no F3/F5/F6 cards exist yet):
 *   - extractWikiLinks / resolveWikiLink / buildBacklinkIndex (F3)
 *   - buildSearchDocs — MiniSearch-ready docs (F5)
 *   - buildTagIndex (F6)
 *   - refreshVaultIndex — one read pass producing all of the above.
 *
 * Decisions (see PRD §13 open questions):
 *   - Archived notes STAY in the search/tag/backlink indexes with their
 *     `status` flag; F5/F6 consumers filter them behind a filter by default.
 *     Rationale: AC3 says archiving retains the file and its links, so the
 *     graph must keep resolving through archived notes.
 *   - Tags are stored as-authored (trimmed, de-duplicated case-insensitively)
 *     and indexed case-folded (lowercase) in buildTagIndex.
 *   - `created`/`updated` are ISO 8601 UTC strings on new writes; the parser
 *     also accepts legacy date-only values (e.g. the scaffold's welcome.md).
 *   - Trash lives at `<vault>/.trash/`; listNoteSlugs/read paths ignore all
 *     dot-directories so trash never leaks back into the vault.
 *   - No git here: commit-on-save is F9's job and wraps these functions.
 *
 * Zero dependencies beyond node builtins — no new packages for F1.
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const NOTE_STATUSES = ['seed', 'growing', 'evergreen', 'archived'] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];

export const NOTE_VISIBILITIES = ['private', 'public'] as const;
export type NoteVisibility = (typeof NOTE_VISIBILITIES)[number];

/** Canonical frontmatter key order for serialization. */
const FRONTMATTER_ORDER = [
  'title',
  'slug',
  'tags',
  'status',
  'visibility',
  'created',
  'updated',
] as const;

/** Directory inside the vault holding deleted (recoverable) notes. */
export const TRASH_DIR_NAME = '.trash';

const MAX_SLUG_LENGTH = 96;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface NoteFields {
  title: string;
  slug: string;
  tags: string[];
  status: NoteStatus;
  visibility: NoteVisibility;
  created: string;
  updated: string;
  /**
   * Unknown frontmatter keys, preserved verbatim across read→save so the
   * vault stays fully usable in external editors (e.g. Obsidian plugins).
   */
  extra?: Record<string, string>;
}

export interface Note extends NoteFields {
  body: string;
}

/**
 * Point-in-time identity of a note file on disk. Captured on read/create/
 * save; compared later to detect external on-disk edits (PRD F1.5).
 */
export interface NoteSnapshot {
  slug: string;
  mtimeMs: number;
  /** sha256 hex of the exact raw file bytes. */
  hash: string;
}

export interface CreateInput {
  title: string;
  body?: string;
  tags?: string[];
  status?: NoteStatus;
  visibility?: NoteVisibility;
  /**
   * Explicit slug request. Slugified, validated, and — unlike a title-derived
   * slug — NEVER auto-uniquified: a collision throws SlugConflictError so a
   * caller can offer "open existing / save with a new slug" (PRD F2.4).
   */
  slug?: string;
  now?: string | Date;
}

export interface SaveOptions {
  /**
   * Slug the note was loaded as. Required for renames: when `note.slug`
   * differs, the old file is moved — and a pre-existing file at the new slug
   * throws SlugConflictError instead of being overwritten (PRD F1.2).
   */
  baseSlug?: string;
  /**
   * Snapshot taken when the note was loaded. If the file changed on disk
   * since, saveNote throws ExternalEditConflictError carrying the newer disk
   * note — unless `force: true` explicitly overwrites (git still recovers it).
   */
  baseSnapshot?: NoteSnapshot;
  force?: boolean;
  /** Keep the input's `updated` value instead of bumping it to now. */
  keepTimestamps?: boolean;
  now?: string | Date;
}

export interface DeleteResult {
  slug: string;
  /** Absolute path of the note's new home inside the trash directory. */
  trashPath: string;
}

export interface TrashEntry {
  slug: string;
  /** File name inside the trash directory (for restoreNote). */
  trashFile: string;
  trashPath: string;
  /** Frontmatter timestamp, when the trashed file still parses. */
  updated: string | null;
  valid: boolean;
}

export type ExternalEditStatus =
  | { kind: 'clean' }
  | { kind: 'externally-updated'; note: Note; snapshot: NoteSnapshot }
  | { kind: 'conflict'; diskNote: Note; diskSnapshot: NoteSnapshot }
  | { kind: 'deleted-externally' };

export interface WikiLink {
  /** Raw link target, e.g. `Some Note` in `[[Some Note|alias]]`. */
  target: string;
  /** Display text: the alias when present, else the target. */
  linkText: string;
}

/** MiniSearch-ready document shape (F5 consumer). */
export interface SearchDoc {
  slug: string;
  title: string;
  body: string;
  tags: string[];
  status: NoteStatus;
  visibility: NoteVisibility;
  updated: string;
}

export interface VaultIndex {
  notes: Note[];
  snapshots: Map<string, NoteSnapshot>;
  searchDocs: SearchDoc[];
  /** Lower-cased tag → slugs (sorted). */
  tags: Record<string, string[]>;
  /** Slug → inbound links. Notes with no inbound links have no key (F12). */
  backlinks: Record<string, Array<{ fromSlug: string; linkText: string }>>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class NoteNotFoundError extends Error {
  readonly code = 'NOTE_NOT_FOUND';
  constructor(readonly slug: string) {
    super(`Note not found: "${slug}"`);
    this.name = 'NoteNotFoundError';
  }
}

export class SlugConflictError extends Error {
  readonly code = 'SLUG_CONFLICT';
  constructor(
    readonly slug: string,
    message?: string,
  ) {
    super(message ?? `Slug "${slug}" is already used by a different note`);
    this.name = 'SlugConflictError';
  }
}

export class NoteValidationError extends Error {
  readonly code = 'NOTE_VALIDATION';
  constructor(message: string) {
    super(message);
    this.name = 'NoteValidationError';
  }
}

export class ExternalEditConflictError extends Error {
  readonly code = 'EXTERNAL_EDIT_CONFLICT';
  constructor(
    readonly slug: string,
    /** The newer on-disk note — newer content is preserved, never dropped. */
    readonly diskNote: Note,
    readonly diskSnapshot: NoteSnapshot,
  ) {
    super(
      `Note "${slug}" changed on disk outside the app; ` +
        `reload the newer content or retry with force to overwrite`,
    );
    this.name = 'ExternalEditConflictError';
  }
}

// ---------------------------------------------------------------------------
// Slugs (PRD F1.2)
// ---------------------------------------------------------------------------

/**
 * Derive a URL-safe slug from arbitrary text: lowercase, de-accent,
 * non-alphanumerics → hyphens, collapsed and trimmed, capped in length.
 */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug || 'note';
}

export function assertValidSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new NoteValidationError(
      `Invalid slug "${slug}": must match ${SLUG_PATTERN} ` +
        `(lowercase letters, digits, single hyphens)`,
    );
  }
}

function noteFilePath(vaultDir: string, slug: string): string {
  return join(vaultDir, `${slug}.md`);
}

function trashDir(vaultDir: string): string {
  return join(vaultDir, TRASH_DIR_NAME);
}

function slugTaken(vaultDir: string, slug: string, exceptSlug?: string): boolean {
  if (exceptSlug !== undefined && slug === exceptSlug) return false;
  return existsSync(noteFilePath(vaultDir, slug));
}

/**
 * Return `base` if free, else `base-2`, `base-3`, … — the first slug with no
 * corresponding file in the vault. `exceptSlug` exempts the note being
 * renamed (its own old file does not block its own slug).
 */
export function resolveUniqueSlug(
  vaultDir: string,
  base: string,
  exceptSlug?: string,
): string {
  const clean = slugify(base);
  if (!slugTaken(vaultDir, clean, exceptSlug)) return clean;
  let n = 2;
  while (slugTaken(vaultDir, `${clean}-${n}`, exceptSlug)) n++;
  return `${clean}-${n}`;
}

// ---------------------------------------------------------------------------
// Frontmatter parse / serialize (PRD F1.1)
// ---------------------------------------------------------------------------

function unquote(value: string): string {
  const t = value.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

function splitFlowList(inner: string): string[] {
  const items: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ',') {
      items.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  items.push(current);
  return items;
}

function parseTagsValue(value: string, restLines: string[], start: number): { tags: string[]; next: number } {
  const t = value.trim();
  if (t.startsWith('[')) {
    const end = t.indexOf(']');
    if (end === -1) throw new NoteValidationError('Malformed tags list: missing closing "]"');
    const items = splitFlowList(t.slice(1, end))
      .map((s) => unquote(s).trim())
      .filter((s) => s.length > 0);
    return { tags: items, next: start };
  }
  if (t.length > 0) {
    // Single scalar, or comma-separated scalars.
    return {
      tags: t
        .split(',')
        .map((s) => unquote(s).trim())
        .filter((s) => s.length > 0),
      next: start,
    };
  }
  // Block list on following lines ("  - tag").
  const tags: string[] = [];
  let i = start;
  while (i < restLines.length && /^\s*-\s+/.test(restLines[i])) {
    tags.push(unquote(restLines[i].replace(/^\s*-\s+/, '')).trim());
    i++;
  }
  return { tags: tags.filter((s) => s.length > 0), next: i };
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out;
}

function quoteYaml(value: string): string {
  if (value === '' || /[:#[\]{}&*!|>'"%@`,]/.test(value) || /^\s|\s$/.test(value) || /^[-?:]/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

function serializeTags(tags: string[]): string {
  if (tags.length === 0) return '[]';
  return `[${tags.map((t) => quoteYaml(t)).join(', ')}]`;
}

/**
 * Parse a raw note file into structured data. Throws NoteValidationError on
 * missing frontmatter, missing title/slug, or invalid enum values — a note
 * without frontmatter is corrupt per F1, never silently accepted.
 */
export function parseNoteFile(raw: string): Note {
  const lines = raw.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  if (lines[0]?.trim() !== '---') {
    throw new NoteValidationError('Note is missing YAML frontmatter (expected leading "---")');
  }
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      close = i;
      break;
    }
  }
  if (close === -1) throw new NoteValidationError('Note frontmatter is missing its closing "---"');

  const fields = new Map<string, string>();
  const order: string[] = [];
  let tags: string[] = [];
  const fm = lines.slice(1, close);
  let i = 0;
  while (i < fm.length) {
    const line = fm[i];
    if (line.trim() === '' || line.trim().startsWith('#')) {
      i++;
      continue;
    }
    const m = /^([A-Za-z0-9_-]+)\s*:(.*)$/.exec(line);
    if (!m) throw new NoteValidationError(`Malformed frontmatter line: "${line}"`);
    const key = m[1];
    if (key === 'tags') {
      const parsed = parseTagsValue(m[2], fm, i + 1);
      tags = parsed.tags;
      i = parsed.next;
      continue;
    }
    fields.set(key, unquote(m[2]));
    order.push(key);
    i++;
  }

  const title = (fields.get('title') ?? '').trim();
  if (!title) throw new NoteValidationError('Note frontmatter requires a non-empty "title"');
  const slug = (fields.get('slug') ?? '').trim();
  if (!slug) throw new NoteValidationError('Note frontmatter requires a non-empty "slug"');
  assertValidSlug(slug);

  const status = (fields.get('status') ?? 'seed').trim();
  if (!(NOTE_STATUSES as readonly string[]).includes(status)) {
    throw new NoteValidationError(
      `Invalid status "${status}": expected one of ${NOTE_STATUSES.join(', ')}`,
    );
  }
  const visibility = (fields.get('visibility') ?? 'private').trim();
  if (!(NOTE_VISIBILITIES as readonly string[]).includes(visibility)) {
    throw new NoteValidationError(
      `Invalid visibility "${visibility}": expected one of ${NOTE_VISIBILITIES.join(', ')}`,
    );
  }

  const extra: Record<string, string> = {};
  for (const key of order) {
    if (
      key !== 'title' &&
      key !== 'slug' &&
      key !== 'status' &&
      key !== 'visibility' &&
      key !== 'created' &&
      key !== 'updated'
    ) {
      extra[key] = fields.get(key) ?? '';
    }
  }

  const body = lines
    .slice(close + 1)
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');

  return {
    title,
    slug,
    tags: normalizeTags(tags),
    status: status as NoteStatus,
    visibility: visibility as NoteVisibility,
    created: (fields.get('created') ?? '').trim(),
    updated: (fields.get('updated') ?? '').trim(),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
    body,
  };
}

/** Serialize a note to its exact on-disk form: UTF-8 Markdown + frontmatter. */
export function serializeNote(note: Note): string {
  assertValidSlug(note.slug);
  const title = note.title.trim();
  if (!title) throw new NoteValidationError('Cannot serialize a note with an empty title');
  const lines = [
    '---',
    `title: ${quoteYaml(title)}`,
    `slug: ${note.slug}`,
    `tags: ${serializeTags(note.tags ?? [])}`,
    `status: ${note.status}`,
    `visibility: ${note.visibility}`,
    `created: ${quoteYaml(note.created)}`,
    `updated: ${quoteYaml(note.updated)}`,
  ];
  if (note.extra) {
    for (const [key, value] of Object.entries(note.extra)) {
      lines.push(`${key}: ${quoteYaml(value)}`);
    }
  }
  lines.push('---', '');
  const body = note.body ?? '';
  return `${lines.join('\n')}${body === '' ? '' : body.endsWith('\n') ? body : `${body}\n`}`;
}

// ---------------------------------------------------------------------------
// Snapshots & hashing
// ---------------------------------------------------------------------------

function hashBytes(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function snapshotOf(absPath: string, slug: string): NoteSnapshot {
  const st = statSync(absPath);
  const hash = hashBytes(readFileSync(absPath));
  return { slug, mtimeMs: st.mtimeMs, hash };
}

function nowIso(now?: string | Date): string {
  if (now instanceof Date) return now.toISOString();
  if (typeof now === 'string' && now.length > 0) return new Date(now).toISOString();
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function readRawBySlug(vaultDir: string, slug: string): { raw: Buffer; absPath: string } {
  assertValidSlug(slug);
  const absPath = noteFilePath(vaultDir, slug);
  if (!existsSync(absPath)) throw new NoteNotFoundError(slug);
  return { raw: readFileSync(absPath), absPath };
}

/** Slugs of all live notes. Trash (dot-dirs), subdirs, non-Markdown ignored. */
export function listNoteSlugs(vaultDir: string): string[] {
  if (!existsSync(vaultDir)) return [];
  return readdirSync(vaultDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name.slice(0, -'.md'.length))
    .filter((slug) => SLUG_PATTERN.test(slug))
    .sort();
}

export function readNote(vaultDir: string, slug: string): Note {
  const { raw } = readRawBySlug(vaultDir, slug);
  const note = parseNoteFile(raw.toString('utf8'));
  if (note.slug !== slug) {
    throw new NoteValidationError(
      `Slug mismatch in "${slug}.md": frontmatter declares slug "${note.slug}"`,
    );
  }
  return note;
}

export function readNoteWithSnapshot(
  vaultDir: string,
  slug: string,
): { note: Note; snapshot: NoteSnapshot } {
  const { raw, absPath } = readRawBySlug(vaultDir, slug);
  const note = parseNoteFile(raw.toString('utf8'));
  if (note.slug !== slug) {
    throw new NoteValidationError(
      `Slug mismatch in "${slug}.md": frontmatter declares slug "${note.slug}"`,
    );
  }
  return {
    note,
    snapshot: { slug, mtimeMs: statSync(absPath).mtimeMs, hash: hashBytes(raw) },
  };
}

// ---------------------------------------------------------------------------
// Writes (PRD F1.1, F1.2, F1.5)
// ---------------------------------------------------------------------------

function writeNoteFile(
  vaultDir: string,
  note: Note,
  now?: string | Date,
  keepTimestamps = false,
): { note: Note; snapshot: NoteSnapshot } {
  const stamped: Note = {
    ...note,
    tags: normalizeTags(note.tags ?? []),
    created: note.created?.trim() ? note.created : nowIso(now),
    updated: keepTimestamps && note.updated?.trim() ? note.updated : nowIso(now),
  };
  mkdirSync(vaultDir, { recursive: true });
  const absPath = noteFilePath(vaultDir, stamped.slug);
  writeFileSync(absPath, serializeNote(stamped), 'utf8');
  return { note: stamped, snapshot: snapshotOf(absPath, stamped.slug) };
}

function currentHashIfExists(vaultDir: string, slug: string): string | null {
  const absPath = noteFilePath(vaultDir, slug);
  if (!existsSync(absPath)) return null;
  return hashBytes(readFileSync(absPath));
}

/**
 * Create a note (PRD F1.1). The slug derives from the title (or the explicit
 * request) and is made unique automatically (`title`, `title-2`, …), except
 * an explicitly requested taken slug throws SlugConflictError.
 */
export function createNote(
  vaultDir: string,
  input: CreateInput,
): { note: Note; snapshot: NoteSnapshot } {
  const title = input.title?.trim() ?? '';
  if (!title) throw new NoteValidationError('Cannot create a note with an empty title');

  let slug: string;
  if (input.slug !== undefined) {
    slug = slugify(input.slug);
    assertValidSlug(slug);
    if (slugTaken(vaultDir, slug)) throw new SlugConflictError(slug);
  } else {
    slug = resolveUniqueSlug(vaultDir, title);
  }

  const status = input.status ?? 'seed';
  if (!(NOTE_STATUSES as readonly string[]).includes(status)) {
    throw new NoteValidationError(`Invalid status "${status}"`);
  }
  const visibility = input.visibility ?? 'private';
  if (!(NOTE_VISIBILITIES as readonly string[]).includes(visibility)) {
    throw new NoteValidationError(`Invalid visibility "${visibility}"`);
  }

  return writeNoteFile(
    vaultDir,
    {
      title,
      slug,
      tags: normalizeTags(input.tags ?? []),
      status,
      visibility,
      created: '',
      updated: '',
      body: input.body ?? '',
    },
    input.now,
  );
}

/**
 * Save a note (PRD F1.1/F1.2/F1.5): full frontmatter rewrite + `updated`
 * bump. Handles slug renames via `baseSlug`; rejects writes that would
 * claim another note's slug; refuses to clobber newer external on-disk
 * content unless `force: true`.
 */
export function saveNote(
  vaultDir: string,
  note: Note,
  opts: SaveOptions = {},
): { note: Note; snapshot: NoteSnapshot } {
  const title = note.title?.trim() ?? '';
  if (!title) throw new NoteValidationError('Cannot save a note with an empty title');
  assertValidSlug(note.slug);
  if (!(NOTE_STATUSES as readonly string[]).includes(note.status)) {
    throw new NoteValidationError(`Invalid status "${note.status}"`);
  }
  if (!(NOTE_VISIBILITIES as readonly string[]).includes(note.visibility)) {
    throw new NoteValidationError(`Invalid visibility "${note.visibility}"`);
  }

  const baseSlug = opts.baseSlug ?? note.slug;
  if (note.slug !== baseSlug) {
    // Rename path: the target slug must not belong to a different note.
    if (slugTaken(vaultDir, note.slug, baseSlug)) {
      throw new SlugConflictError(
        note.slug,
        `Cannot rename "${baseSlug}" to "${note.slug}": slug is already used by a different note`,
      );
    }
    if (opts.baseSnapshot) {
      const baseHash = currentHashIfExists(vaultDir, baseSlug);
      if (baseHash === null) throw new NoteNotFoundError(baseSlug);
      if (baseHash !== opts.baseSnapshot.hash && !opts.force) {
        const { note: diskNote, snapshot } = readNoteWithSnapshot(vaultDir, baseSlug);
        throw new ExternalEditConflictError(baseSlug, diskNote, snapshot);
      }
    } else if (!existsSync(noteFilePath(vaultDir, baseSlug))) {
      throw new NoteNotFoundError(baseSlug);
    }
    mkdirSync(vaultDir, { recursive: true });
    renameSync(noteFilePath(vaultDir, baseSlug), noteFilePath(vaultDir, note.slug));
  } else if (opts.baseSnapshot) {
    const diskHash = currentHashIfExists(vaultDir, note.slug);
    if (diskHash === null) throw new NoteNotFoundError(note.slug);
    if (diskHash !== opts.baseSnapshot.hash && !opts.force) {
      const { note: diskNote, snapshot } = readNoteWithSnapshot(vaultDir, note.slug);
      throw new ExternalEditConflictError(note.slug, diskNote, snapshot);
    }
  }

  return writeNoteFile(vaultDir, { ...note, title }, opts.now, opts.keepTimestamps);
}

/** Archive a note (PRD F1.3): `status: archived`, file and links retained. */
export function archiveNote(
  vaultDir: string,
  slug: string,
  opts: { baseSnapshot?: NoteSnapshot; force?: boolean; now?: string | Date } = {},
): { note: Note; snapshot: NoteSnapshot } {
  const current = readNote(vaultDir, slug);
  return saveNote(vaultDir, { ...current, status: 'archived' }, { ...opts, baseSlug: slug });
}

// ---------------------------------------------------------------------------
// Delete / trash / restore (PRD F1.4)
// ---------------------------------------------------------------------------

function trashStamp(now?: string | Date): string {
  const d = now instanceof Date ? now : typeof now === 'string' && now ? new Date(now) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

/**
 * Delete a note (PRD F1.4): move it into `<vault>/.trash/` (recoverable via
 * restoreNote or git). The slug is immediately freed for reuse; the next
 * refreshVaultIndex drops the note from search/tag/backlink indexes.
 */
export function deleteNote(
  vaultDir: string,
  slug: string,
  opts: { now?: string | Date } = {},
): DeleteResult {
  assertValidSlug(slug);
  const absPath = noteFilePath(vaultDir, slug);
  if (!existsSync(absPath)) throw new NoteNotFoundError(slug);
  // Validate before moving: trash must hold parseable notes for restore.
  readNote(vaultDir, slug);
  mkdirSync(trashDir(vaultDir), { recursive: true });
  let trashFile = `${slug}-${trashStamp(opts.now)}.md`;
  let n = 2;
  while (existsSync(join(trashDir(vaultDir), trashFile))) {
    trashFile = `${slug}-${trashStamp(opts.now)}-${n}.md`;
    n++;
  }
  const trashPath = join(trashDir(vaultDir), trashFile);
  renameSync(absPath, trashPath);
  return { slug, trashPath };
}

export function listTrash(vaultDir: string): TrashEntry[] {
  const dir = trashDir(vaultDir);
  if (!existsSync(dir)) return [];
  const entries: TrashEntry[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    const trashPath = join(dir, name);
    try {
      const note = parseNoteFile(readFileSync(trashPath, 'utf8'));
      entries.push({
        slug: note.slug,
        trashFile: name,
        trashPath,
        updated: note.updated || null,
        valid: true,
      });
    } catch {
      entries.push({
        slug: name.slice(0, -'.md'.length),
        trashFile: name,
        trashPath,
        updated: null,
        valid: false,
      });
    }
  }
  return entries.sort((a, b) => a.trashFile.localeCompare(b.trashFile));
}

/**
 * Restore a trashed note to the vault. If its slug was reused meanwhile, the
 * restored note is auto-uniquified (`slug-2`, …) and the final slug is part
 * of the result — recovery never fails on a collision.
 */
export function restoreNote(
  vaultDir: string,
  trashFile: string,
  opts: { now?: string | Date } = {},
): { note: Note; snapshot: NoteSnapshot } {
  if (trashFile.includes('/') || trashFile.includes('\\')) {
    throw new NoteValidationError(`Invalid trash file name "${trashFile}"`);
  }
  const trashPath = join(trashDir(vaultDir), trashFile);
  if (!existsSync(trashPath)) {
    throw new NoteValidationError(`No such trashed note: "${trashFile}"`);
  }
  const trashed = parseNoteFile(readFileSync(trashPath, 'utf8'));
  const slug = resolveUniqueSlug(vaultDir, trashed.slug);
  const { note, snapshot } = writeNoteFile(
    vaultDir,
    { ...trashed, slug },
    opts.now,
  );
  rmSync(trashPath);
  return { note, snapshot };
}

// ---------------------------------------------------------------------------
// External on-disk edits (PRD F1.5)
// ---------------------------------------------------------------------------

/**
 * Compare the vault file against a previously captured snapshot.
 *
 * The future editor (F8) calls this on focus / file-watcher events:
 *   - `clean` → nothing changed on disk.
 *   - `externally-updated` → disk is newer and the app holds no unsaved
 *     edits: reload `note` (preserving the newer content).
 *   - `conflict` → disk is newer AND the app holds unsaved edits: keep both
 *     visible and warn; neither side is discarded automatically.
 *   - `deleted-externally` → the file vanished (deleted outside the app).
 */
export function checkForExternalEdit(
  vaultDir: string,
  slug: string,
  snapshot: NoteSnapshot,
  hasUnsavedEdits = false,
): ExternalEditStatus {
  assertValidSlug(slug);
  const absPath = noteFilePath(vaultDir, slug);
  if (!existsSync(absPath)) return { kind: 'deleted-externally' };
  const st = statSync(absPath);
  const raw = readFileSync(absPath);
  if (hashBytes(raw) === snapshot.hash) return { kind: 'clean' };
  const diskNote = parseNoteFile(raw.toString('utf8'));
  const diskSnapshot: NoteSnapshot = { slug, mtimeMs: st.mtimeMs, hash: hashBytes(raw) };
  void snapshot.mtimeMs;
  if (hasUnsavedEdits) return { kind: 'conflict', diskNote, diskSnapshot };
  return { kind: 'externally-updated', note: diskNote, snapshot: diskSnapshot };
}

// ---------------------------------------------------------------------------
// Index-refresh hooks (F3 wiki-links/backlinks, F5 search, F6 tags)
// ---------------------------------------------------------------------------

const FENCED_BLOCK = /```[\s\S]*?(?:```|$)/g;
const INLINE_CODE = /`[^`\n]*`/g;
const WIKI_LINK = /\[\[([^\]|#\]]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;

/** Extract `[[wikilink]]` targets from a body, ignoring code spans/blocks. */
export function extractWikiLinks(body: string): WikiLink[] {
  const prose = body.replace(FENCED_BLOCK, '').replace(INLINE_CODE, '');
  const links: WikiLink[] = [];
  let m: RegExpExecArray | null;
  WIKI_LINK.lastIndex = 0;
  while ((m = WIKI_LINK.exec(prose)) !== null) {
    const target = (m[1] ?? '').trim();
    if (!target) continue;
    links.push({ target, linkText: (m[2] ?? '').trim() || target });
  }
  return links;
}

/**
 * Resolve a wikilink target to a note slug, case-insensitively, via F3's
 * canonical three-tier rule (spec FR-003, clarification Q1):
 *
 *   1. exact slug match (case-folded)
 *   2. exact title match (case-folded)
 *   3. `slugify(target)` equals the note's slug — closes D3's slugify gap,
 *      so `[[Retrieval Practice]]` reaches slug `retrieval-practice`.
 *
 * The first tier with any match wins; ties inside a tier break to the
 * lexicographically smallest slug (titles are not unique, slugs are).
 * Returns null only when all three tiers miss — F3 renders those as
 * "pending" links that create the note on first click.
 *
 * This one function drives rendering, the backlink index, and link
 * insertion alike, so the three can never disagree (FR-003).
 */
export function resolveWikiLink(target: string, notes: NoteFields[]): string | null {
  const folded = target.trim().toLowerCase();
  if (!folded) return null;

  /** Smallest slug in a tier, or null when the tier matched nothing. */
  const smallest = (slugs: string[]): string | null => {
    if (slugs.length === 0) return null;
    let best = slugs[0]!;
    for (const slug of slugs) if (slug < best) best = slug;
    return best;
  };

  // Tier 1 — exact slug.
  const bySlug = smallest(
    notes.filter((n) => n.slug.toLowerCase() === folded).map((n) => n.slug),
  );
  if (bySlug !== null) return bySlug;

  // Tier 2 — exact title.
  const byTitle = smallest(
    notes.filter((n) => n.title.trim().toLowerCase() === folded).map((n) => n.slug),
  );
  if (byTitle !== null) return byTitle;

  // Tier 3 — slugify equivalence (accents/punctuation/case collapse).
  const derived = slugify(target).toLowerCase();
  return smallest(notes.filter((n) => n.slug.toLowerCase() === derived).map((n) => n.slug));
}

/** Slug → inbound `[[links]]` with link text, over live notes only. */
export function buildBacklinkIndex(
  notes: Note[],
): Record<string, Array<{ fromSlug: string; linkText: string }>> {
  const backlinks: Record<string, Array<{ fromSlug: string; linkText: string }>> = {};
  for (const note of notes) {
    for (const link of extractWikiLinks(note.body)) {
      const resolved = resolveWikiLink(link.target, notes);
      if (resolved === null || resolved === note.slug) continue;
      (backlinks[resolved] ??= []).push({ fromSlug: note.slug, linkText: link.linkText });
    }
  }
  return backlinks;
}

/** Lower-cased tag → slugs (sorted). Tags dropped from every note vanish. */
export function buildTagIndex(notes: NoteFields[]): Record<string, string[]> {
  const index = new Map<string, Set<string>>();
  for (const note of notes) {
    for (const tag of note.tags ?? []) {
      const key = tag.trim().toLowerCase();
      if (!key) continue;
      if (!index.has(key)) index.set(key, new Set());
      index.get(key)!.add(note.slug);
    }
  }
  const out: Record<string, string[]> = {};
  for (const key of [...index.keys()].sort()) {
    out[key] = [...index.get(key)!].sort();
  }
  return out;
}

/**
 * MiniSearch-ready docs. Archived notes are INCLUDED with their status flag
 * (see module header): F5 filters them by default but can still surface them
 * for explicit queries.
 */
export function buildSearchDocs(notes: Note[]): SearchDoc[] {
  return notes.map((n) => ({
    slug: n.slug,
    title: n.title,
    body: n.body,
    tags: [...(n.tags ?? [])],
    status: n.status,
    visibility: n.visibility,
    updated: n.updated,
  }));
}

/**
 * One read pass over the vault producing everything F3/F5/F6 need.
 * Deleted (trashed) notes are absent — they drop out of every index on the
 * next refresh (PRD F1.4). Throws on the first corrupt note file so vault
 * damage surfaces loudly instead of silently vanishing from indexes.
 */
export function refreshVaultIndex(vaultDir: string): VaultIndex {
  const notes: Note[] = [];
  const snapshots = new Map<string, NoteSnapshot>();
  for (const slug of listNoteSlugs(vaultDir)) {
    const { note, snapshot } = readNoteWithSnapshot(vaultDir, slug);
    notes.push(note);
    snapshots.set(slug, snapshot);
  }
  return {
    notes,
    snapshots,
    searchDocs: buildSearchDocs(notes),
    tags: buildTagIndex(notes),
    backlinks: buildBacklinkIndex(notes),
  };
}
