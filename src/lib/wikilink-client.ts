/**
 * F3 T009/T011/T013 — DOM-free decision functions for `/note/[slug]`
 * (spec FR-005/007/008/009; plan Research R6 + §4/§6; D5).
 *
 * Same pattern as F2's `capture-client.ts`: every side effect (fetch,
 * confirm, reload, navigate, status text, focus) arrives as an injected
 * port, so the whole module is testable under plain vitest with no browser
 * and no network — and the `.astro` page only wires DOM to these calls.
 *
 * Three concerns share the file because D5 puts them there:
 *
 *   T009 — edit buffer, save payload/decision, Esc discard, 409 conflict
 *   T011 — `[[` autocomplete state machine (popup-scoped keys only)
 *   T013 — pending-marker create-on-click (exactly one in flight per marker)
 *
 * Keys: `autocompleteKeyCommand` is the ONLY key router here and it returns
 * `null` for every key while the popup is closed (FR-008 / PRD F8.4 — zero
 * bare global bindings, no printable key ever maps to a command).
 */

/* ------------------------------------------------------------------ *
 * Shared minimal port types (this module stays self-contained: no
 * imports from F1/F2 runtime code, no DOM, no network of its own).
 * ------------------------------------------------------------------ */

/** Minimal `Response` surface: enough for the status + JSON body. */
export interface ResponseLike {
  status: number;
  json(): Promise<unknown>;
}

export interface NoteRequestInit {
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** Smallest port navigation needs. */
export interface NavigatePorts {
  /** `location.assign`. */
  assign(url: string): void;
}

/** An autocomplete row: the page embeds these in `#f3-page-data`. */
export interface NoteCandidate {
  slug: string;
  title: string;
  status: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

async function readBody(res: ResponseLike): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await res.json();
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/* ================================================================== *
 * T009 — edit buffer, save, Esc, and the 409 conflict choice
 * (spec FR-005/FR-006/FR-007, US2, plan §4)
 * ================================================================== */

export interface EditState {
  editing: boolean;
  dirty: boolean;
  /** The raw Markdown currently in the textarea. */
  value: string;
}

/** Confirm message shown before unsaved edits are thrown away (US2.3). */
export const DISCARD_EDIT_MESSAGE = 'Discard your unsaved changes?';

/** Confirm message for the conflict "Reload from disk" control (US2.4). */
export const RELOAD_CONFIRM_MESSAGE =
  'Reload from disk? Your unsaved changes will be lost.';

/** Enter edit mode: the textarea is prefilled with the note's raw source. */
export function enterEdit(body: string): EditState {
  return { editing: true, dirty: false, value: body ?? '' };
}

/** Record that the buffer changed (value is the textarea's current text). */
export function markDirty(state: EditState, value: string): EditState {
  return { ...state, dirty: true, value };
}

export function isDirty(state: EditState): boolean {
  return state.dirty;
}

/** Leave edit mode (Cancel/save/Esc-confirmed): buffer and flag reset. */
export function leaveEdit(): EditState {
  return { editing: false, dirty: false, value: '' };
}

/**
 * Double-save guard (SC-008): a save is accepted only while no request is
 * in flight and the payload really is a string. An empty body is a VALID
 * save (a note may be a stub — spec Edge Cases), so it is never ignored.
 */
export function saveDecision(input: { inFlight: boolean; body: unknown }): 'save' | 'ignore' {
  if (input.inFlight) return 'ignore';
  if (typeof input.body !== 'string') return 'ignore';
  return 'save';
}

/** `POST /api/note` payload — plan Interface Contracts §1 (force explicit). */
export interface SavePayload {
  slug: string;
  /** Optional since F4 (Q1): a STATUS-only save carries no body at all. */
  body?: string;
  /** Optional since F4 (Q1): a body-only save never flips status. */
  status?: string;
  baseHash: string;
  /** Optional (contract §1 default `false`); the F4 status payload omits it unless Overwriting. */
  force?: boolean;
}

export function savePayload(
  slug: string,
  body: string,
  baseHash: string,
  force = false,
): SavePayload {
  return { slug, body, baseHash, force: force ?? false };
}

/* ================================================================== *
 * F4 — status control decisions (plan R3/R6, D6, spec Q2)
 * The status <select> reuses this module so its decisions stay
 * DOM-free-testable; the page only wires events to them.
 * ================================================================== */

/**
 * Post-on-change guard (Q2): a selection only posts when the value REALLY
 * changed, and never while another save (body or status) is in flight.
 */
export function statusDecision(input: { inFlight: boolean; changed: boolean }): 'save' | 'ignore' {
  if (input.inFlight) return 'ignore';
  if (!input.changed) return 'ignore';
  return 'save';
}

/**
 * The status-save payload (contract §1): `slug` + `status` + the load-time
 * `baseHash`, `force` only when the user explicitly chose Overwrite.
 *
 * Deliberately NO `body` key — disk truth by construction: the server keeps
 * whatever body is on disk, so a status save can never clobber an edit made
 * elsewhere (Q1 / SC-002).
 */
export function statusSavePayload(
  slug: string,
  status: string,
  baseHash: string,
  force = false,
): SavePayload {
  return { slug, status, baseHash, ...(force ? { force: true } : {}) };
}

/**
 * The disable matrix (Q2): the status select is live ONLY while edit mode is
 * closed and no save is in flight — so a status post can never stale the
 * body editor's snapshot.
 */
export function statusControlEnabled(input: { editOpen: boolean; saveInFlight: boolean }): boolean {
  return !input.editOpen && !input.saveInFlight;
}

/**
 * `Esc`/Cancel decision (US2.3, spec FR-005):
 *
 * - clean buffer → `'leave'` (straight back to read mode, no prompt)
 * - dirty buffer → `confirm` resolves it: OK → `'leave'` (discard),
 *   Cancel → `'stay'` (buffer kept, editor stays open)
 * - dirty buffer with no `confirm` port wired → `'confirm'`, telling the
 *   caller it must ask before doing anything.
 */
export function escapeDecision(input: {
  dirty: boolean;
  confirm?: (message: string) => boolean;
}): 'leave' | 'confirm' | 'stay' {
  if (!input.dirty) return 'leave';
  if (!input.confirm) return 'confirm';
  return input.confirm(DISCARD_EDIT_MESSAGE) ? 'leave' : 'stay';
}

/**
 * 409 choice (US2.4, spec FR-007): neither side is touched until the user
 * picks — `'reload'` confirms first and discards the buffer, `'overwrite'`
 * re-POSTs with `force: true` (the ONLY source of `force`).
 */
export function conflictDecision(input: {
  choice: 'reload' | 'overwrite' | null | undefined;
  confirm?: (message: string) => boolean;
}): 'reload' | 'overwrite' | 'stay' | 'confirm' {
  if (input.choice === 'overwrite') return 'overwrite';
  if (input.choice !== 'reload') return 'stay';
  if (!input.confirm) return 'confirm';
  return input.confirm(RELOAD_CONFIRM_MESSAGE) ? 'reload' : 'stay';
}

/** `POST /api/note` response body (plan §1). */
export interface SaveResponseBody {
  slug?: string;
  /** Present since F4: the saved status echoed back by the endpoint. */
  status?: string;
  updated?: string;
  /** Present since F8 C1: snapshot hash echoed back by the endpoint. */
  hash?: string;
  backlinks?: Record<string, unknown>;
  error?: string;
  message?: string;
  disk?: { updated?: string; hash?: string };
}

export interface SaveResponsePorts {
  /** 200 → the server re-renders read mode from disk (AC2's observable). */
  reload(): void;
  /** 409 → reveal `#note-conflict` without touching the textarea. */
  showConflict(disk: { updated: string; hash: string }): void;
  /** Move focus to the content-preserving control (`#conflict-reload`). */
  focusConflictControl(): void;
  /** Write the inline `#note-status` message (empty string clears it). */
  setStatus(message: string): void;
  /** Re-enable Save/Cancel (they are disabled while a save is in flight). */
  setControlsEnabled(enabled: boolean): void;
}

export type SaveOutcome =
  | { kind: 'reloaded' }
  | { kind: 'conflict'; disk: { updated: string; hash: string } }
  | { kind: 'failed'; error: string };

/** Inline message for a failed save — loud, never silent (FR-007/SC-008). */
export function saveErrorMessage(body: SaveResponseBody | null): string {
  if (typeof body?.message === 'string' && body.message) return body.message;
  if (body?.error === 'invalid-payload') return 'The save could not be read.';
  if (body?.error === 'note-not-found') return 'This note no longer exists on disk.';
  if (body?.error === 'external-edit-conflict') {
    return 'This note changed on disk — reload it or overwrite it.';
  }
  return 'The note could not be saved.';
}

/**
 * Map a `POST /api/note` response onto the page's side effects:
 *
 * - `200` → `reload()` (read mode re-rendered from disk with the fresh panel)
 * - `409` → conflict region revealed + focus moved to the content-preserving
 *   control; the buffer is never written or cleared by this function
 * - `400`/`500`/anything else → inline message, stay in edit mode,
 *   controls re-enabled
 */
export async function handleSaveResponse(
  res: ResponseLike,
  ports: SaveResponsePorts,
): Promise<SaveOutcome> {
  const body = (await readBody(res)) as SaveResponseBody | null;

  if (res.status === 200) {
    ports.reload();
    return { kind: 'reloaded' };
  }

  if (res.status === 409) {
    const disk = {
      updated: body?.disk?.updated ?? '',
      hash: body?.disk?.hash ?? '',
    };
    ports.showConflict(disk);
    ports.focusConflictControl();
    ports.setControlsEnabled(true);
    return { kind: 'conflict', disk };
  }

  ports.setStatus(saveErrorMessage(body));
  ports.setControlsEnabled(true);
  return { kind: 'failed', error: body?.error ?? 'save-failed' };
}

/** {@link SaveResponsePorts} plus the injected `fetch` used to POST. */
export interface SaveSubmitPorts extends SaveResponsePorts {
  fetch(url: string, init: NoteRequestInit): Promise<ResponseLike>;
}

/** POST the payload and run the result through {@link handleSaveResponse}. */
export async function submitSave(
  payload: SavePayload,
  ports: SaveSubmitPorts,
): Promise<SaveOutcome> {
  const res = await ports.fetch('/api/note', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleSaveResponse(res, ports);
}

/* ================================================================== *
 * F8 T004 — autosave decision helpers and edit buffer management
 * (spec FR-006, plan Research R2, Data Model, Contracts C1/C3)
 * ================================================================== */

/** F8 T004 — Autosave debounce delay in milliseconds (plan R2, spec Q2, C3). */
export const AUTOSAVE_IDLE_MS = 2000;

/**
 * F8 T004 — Pure autosave decision predicate (plan R2, FR-006):
 * returns true only when the buffer is dirty AND no save is in flight.
 */
export function shouldAutosave(state: { dirty: boolean; inFlight: boolean }): boolean {
  return state.dirty && !state.inFlight;
}

/** F8 T004 — Pure edit buffer snapshot for autosave tracking (plan Data Model). */
export interface EditBuffer {
  value: string;
  baseHash: string;
  dirty: boolean;
}

/**
 * F8 T004 — Apply a successful save response to the edit buffer (plan R2, C1):
 * - `baseHash` refreshed from the C1 `hash` echo (`body.hash ?? state.baseHash`)
 * - `value` unchanged
 * - `dirty = state.value !== sent` (typing while save was in flight stays dirty)
 */
export function applySaveSuccess(
  state: EditBuffer,
  sent: string,
  body: { hash?: string },
): EditBuffer {
  return {
    value: state.value,
    baseHash: body.hash ?? state.baseHash,
    dirty: state.value !== sent,
  };
}

/** F8 T004 — Ports for handleBufferSaveResponse (narrow interface, no reload required). */
export interface BufferSaveResponsePorts {
  /** 409 → reveal `#note-conflict` without touching the textarea. */
  showConflict(disk: { updated: string; hash: string }): void;
  /** Move focus to the content-preserving control (`#conflict-reload`). */
  focusConflictControl(): void;
  /** Write the inline `#note-status` message (empty string clears it). */
  setStatus(message: string): void;
  /** Re-enable Save/Cancel controls on conflict or error. */
  setControlsEnabled(enabled: boolean): void;
  /** Optional reload port to assert that handleBufferSaveResponse never calls it. */
  reload?(): void;
}

export type BufferSaveOutcome =
  | { kind: 'saved'; body: SaveResponseBody }
  | { kind: 'conflict'; disk: { updated: string; hash: string } }
  | { kind: 'failed'; error: string };

/**
 * F8 T004 — Map a body-save `POST /api/note` response onto side effects WITHOUT
 * reloading read mode (unlike handleSaveResponse):
 *
 * - `200` → parse the JSON body and return `{ kind: 'saved', body }` (never reloads,
 *   never clears buffer, never touches textarea or status)
 * - `409` → conflict region revealed + focus moved to content-preserving control,
 *   re-enable controls, return `{ kind: 'conflict', disk }`
 * - anything else → inline error message via setStatus, controls re-enabled,
 *   return `{ kind: 'failed', error }`
 */
export async function handleBufferSaveResponse(
  res: ResponseLike,
  ports: BufferSaveResponsePorts,
): Promise<BufferSaveOutcome> {
  const body = (await readBody(res)) as SaveResponseBody | null;

  if (res.status === 200) {
    return { kind: 'saved', body: (body ?? {}) as SaveResponseBody };
  }

  if (res.status === 409) {
    const disk = {
      updated: body?.disk?.updated ?? '',
      hash: body?.disk?.hash ?? '',
    };
    ports.showConflict(disk);
    ports.focusConflictControl();
    ports.setControlsEnabled(true);
    return { kind: 'conflict', disk };
  }

  ports.setStatus(saveErrorMessage(body));
  ports.setControlsEnabled(true);
  return { kind: 'failed', error: body?.error ?? 'save-failed' };
}

/**
 * F8 T004 — Payload for autosave (plan R2, FR-006):
 * Structurally incapable of carrying `force: true` (built from `savePayload`
 * with `force: false`).
 */
export function autosavePayload(
  slug: string,
  body: string,
  baseHash: string,
): SavePayload {
  return savePayload(slug, body, baseHash, false);
}

/* ================================================================== *
 * T011 — `[[` autocomplete state machine
 * (spec FR-008 / US3, plan R6; keys strictly popup-scoped)
 * ================================================================== */

export type AutocompleteKeyCommand = 'up' | 'down' | 'enter' | 'tab' | 'escape';

export interface AutocompleteState {
  open: boolean;
  query: string | null;
  /** Selected row index, `-1` when nothing is selected. */
  selection: number;
}

/** The popup closes itself: no query, no selection, nothing to act on. */
export function dismissAutocomplete(): AutocompleteState {
  return { open: false, query: null, selection: -1 };
}

/**
 * Text between the LAST unclosed `[[` on the caret's line and the caret.
 *
 * Returns `null` — popup closed — when there is no open construct, when the
 * construct was already closed before the caret (`]]`, or a stray `]`), or
 * when reaching it would cross a newline (US3.1: one line, one construct).
 */
export function extractQuery(text: string, caret: number): string | null {
  if (!Number.isFinite(caret) || caret < 0 || caret > text.length) return null;

  const lineStart = caret === 0 ? 0 : text.lastIndexOf('\n', caret - 1) + 1;
  const newlineAt = text.indexOf('\n', caret);
  const lineEnd = newlineAt === -1 ? text.length : newlineAt;
  const line = text.slice(lineStart, lineEnd);
  const before = line.slice(0, caret - lineStart);

  const open = before.lastIndexOf('[[');
  if (open === -1) return null;
  const afterOpen = before.slice(open + 2);
  if (afterOpen.includes(']')) return null; // closed (or half-typed) construct
  return afterOpen;
}

/**
 * Filter candidates by the text typed after `[[`: case-insensitive
 * substring over TITLES, empty query → everything. Order is PRESERVED from
 * the page's title-sorted candidates, so the popup is deterministic and row
 * 1 is always the default selection (SC-004).
 */
export function filterCandidates(query: string, candidates: NoteCandidate[]): NoteCandidate[] {
  const needle = (query ?? '').trim().toLowerCase();
  if (!needle) return candidates.slice();
  return candidates.filter((c) => c.title.toLowerCase().includes(needle));
}

/** Wrapped Up/Down selection movement; `-1` when there is nothing to pick. */
export function moveSelection(delta: number, len: number, current: number): number {
  if (len <= 0) return -1;
  if (!Number.isFinite(current) || current < 0 || current >= len) {
    return delta >= 0 ? 0 : len - 1;
  }
  return (((current + delta) % len) + len) % len;
}

export interface AcceptResult {
  /** The whole `[[query` construct (opening `[[` included) becomes this. */
  replacement: string;
  /** Caret position measured from the start of that construct — right after `]]`. */
  caret: number;
  /** Signed movement from the caret's current position (convenience). */
  delta: number;
}

/**
 * Turn the in-progress construct into `[[Title]]` (US3.3). Everything typed
 * after the caret is left untouched by the caller, which splices
 * `replacement` over `text.slice(caret - query.length - 2, caret)`.
 */
export function acceptSelection(query: string, candidate: NoteCandidate): AcceptResult {
  const replacement = `[[${candidate.title}]]`;
  const removed = query.length + 2; // `[[` + query, i.e. the construct before the caret
  return { replacement, caret: replacement.length, delta: replacement.length - removed };
}

/**
 * THE key router (FR-008 / PRD F8.4): returns a command only while the
 * popup is open, and only for Up/Down/Enter/Tab/Esc. Every other key —
 * printable or not — maps to `null`, so no handler ever intercepts typing.
 */
export function autocompleteKeyCommand(input: {
  key: string;
  popupOpen: boolean;
}): AutocompleteKeyCommand | null {
  if (!input.popupOpen) return null;
  switch (input.key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'Enter':
      return 'enter';
    case 'Tab':
      return 'tab';
    case 'Escape':
      return 'escape';
    default:
      return null;
  }
}

/* ================================================================== *
 * T013 — pending-marker create-on-click
 * (spec FR-009 / US4, plan R5: reuse `POST /api/capture`, no 3rd endpoint)
 * ================================================================== */

/**
 * Exactly one create in flight per marker (SC-005): a second click while
 * the first request is out — or a blank target — is ignored, never queued.
 */
export function pendingCreateDecision(input: {
  inFlight: boolean;
  target: unknown;
}): 'create' | 'ignore' {
  if (input.inFlight) return 'ignore';
  if (typeof input.target !== 'string') return 'ignore';
  if (!input.target.trim()) return 'ignore';
  return 'create';
}

/** `POST /api/capture` response bodies F3 relies on (plan R5/§4). */
export interface PendingResponseBody {
  slug?: string;
  status?: string;
  error?: string;
  message?: string;
}

export interface PendingPorts extends NavigatePorts {
  /** Write the inline `#note-status` error (FR-009: show and change nothing). */
  setStatus(message: string): void;
  /** Re-enable the marker after a failed create. */
  enableMarker?(): void;
}

export type PendingOutcome =
  | { kind: 'created'; slug: string }
  | { kind: 'existing'; slug: string }
  | { kind: 'failed'; error: string };

/** Inline message for a failed pending-create (US4.4). */
export function pendingErrorMessage(body: PendingResponseBody | null): string {
  if (typeof body?.message === 'string' && body.message) return body.message;
  if (body?.error === 'title-required') return 'That link has no title.';
  if (body?.error === 'invalid-payload') return 'That note could not be created.';
  return 'That note could not be created.';
}

/**
 * Apply a create response (plan §4):
 *
 * - `201 { slug }` → navigate to the new note (created exactly once)
 * - `409 { slug }` → navigate to the EXISTING note — the defensive collision
 *   branch: nothing is ever overwritten (Q3)
 * - `400`/`500`/anything else → inline error, stay put, marker re-enabled
 */
export function handlePendingResponse(
  input: { status: number; body: PendingResponseBody | null },
  ports: PendingPorts,
): PendingOutcome {
  const { status, body } = input;

  if ((status === 201 || status === 409) && typeof body?.slug === 'string' && body.slug) {
    ports.assign(`/note/${body.slug}`);
    return status === 201 ? { kind: 'created', slug: body.slug } : { kind: 'existing', slug: body.slug };
  }

  const error = pendingErrorMessage(body);
  ports.setStatus(error);
  ports.enableMarker?.();
  return { kind: 'failed', error };
}

/** {@link PendingPorts} plus the injected `fetch` used to POST. */
export interface PendingSubmitPorts extends PendingPorts {
  fetch(url: string, init: NoteRequestInit): Promise<ResponseLike>;
}

/**
 * POST the pending target to `POST /api/capture` (title = the link's target,
 * defaults `seed`/`private`/empty body come from F2) and apply the response.
 */
export async function submitPendingCreate(
  target: string,
  ports: PendingSubmitPorts,
): Promise<PendingOutcome> {
  const res = await ports.fetch('/api/capture', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: target }),
  });
  const body = (await readBody(res)) as PendingResponseBody | null;
  return handlePendingResponse({ status: res.status, body }, ports);
}
