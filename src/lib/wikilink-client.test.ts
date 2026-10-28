/**
 * F3 T009/T011/T013 — `wikilink-client` tests (spec AC1/AC2/AC3, US2/US3/US4).
 *
 * Every port is mocked (no DOM, no network, no browser): save/escape/conflict
 * branches, the autocomplete state machine including a full printable-key
 * sweep, and pending-create's four branches with its double-click guard.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  acceptSelection,
  applySaveSuccess,
  AUTOSAVE_IDLE_MS,
  autocompleteKeyCommand,
  autosavePayload,
  conflictDecision,
  dismissAutocomplete,
  enterEdit,
  escapeDecision,
  extractQuery,
  filterCandidates,
  handleBufferSaveResponse,
  handlePendingResponse,
  handleSaveResponse,
  isDirty,
  leaveEdit,
  markDirty,
  moveSelection,
  pendingCreateDecision,
  pendingErrorMessage,
  RELOAD_CONFIRM_MESSAGE,
  DISCARD_EDIT_MESSAGE,
  saveDecision,
  saveErrorMessage,
  savePayload,
  shouldAutosave,
  statusControlEnabled,
  statusDecision,
  statusSavePayload,
  submitPendingCreate,
  submitSave,
  type BufferSaveOutcome,
  type BufferSaveResponsePorts,
  type EditBuffer,
  type NoteCandidate,
  type ResponseLike,
  type SaveResponsePorts,
} from './wikilink-client';

const CANDIDATES: NoteCandidate[] = [
  { slug: 'alpha', title: 'Alpha', status: 'growing' },
  { slug: 'alpha-two', title: 'Alpha Two', status: 'seed' },
  { slug: 'beta', title: 'Beta', status: 'evergreen' },
  { slug: 'cafe-society', title: 'Café Society', status: 'seed' },
];

function savePorts(overrides: Partial<SaveResponsePorts> = {}): SaveResponsePorts {
  return {
    reload: vi.fn(),
    showConflict: vi.fn(),
    focusConflictControl: vi.fn(),
    setStatus: vi.fn(),
    setControlsEnabled: vi.fn(),
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): ResponseLike {
  return { status, json: async () => body };
}

/* ================================================================== *
 * T009 — edit buffer + save decisions
 * ================================================================== */

describe('T009: edit buffer state', () => {
  it('enters edit prefilled with the raw source, tracks dirty, and resets on leave', () => {
    const start = enterEdit('body with [[links]]');
    expect(start).toEqual({ editing: true, dirty: false, value: 'body with [[links]]' });
    expect(isDirty(start)).toBe(false);

    const dirty = markDirty(start, 'body with [[links]] and more');
    expect(dirty.dirty).toBe(true);
    expect(dirty.value).toBe('body with [[links]] and more');
    expect(isDirty(dirty)).toBe(true);
    // The original state object is untouched (immutable decisions).
    expect(start.dirty).toBe(false);

    expect(leaveEdit()).toEqual({ editing: false, dirty: false, value: '' });
    expect(isDirty(leaveEdit())).toBe(false);
  });

  it('treats an undefined body as "nothing to save" but an empty string as a real save', () => {
    expect(saveDecision({ inFlight: false, body: 'text' })).toBe('save');
    expect(saveDecision({ inFlight: false, body: '' })).toBe('save'); // stub note is valid
    expect(saveDecision({ inFlight: false, body: undefined })).toBe('ignore');
    expect(saveDecision({ inFlight: false, body: null })).toBe('ignore');
    expect(saveDecision({ inFlight: false, body: 42 })).toBe('ignore');
  });

  it('in-flight guard blocks a second save (double-save → exactly one write)', () => {
    expect(saveDecision({ inFlight: true, body: 'text' })).toBe('ignore');
    expect(saveDecision({ inFlight: true, body: '' })).toBe('ignore');
  });

  it('builds the contract payload with the page-load hash and an explicit force flag', () => {
    expect(savePayload('alpha', 'body', 'hash-1')).toEqual({
      slug: 'alpha',
      body: 'body',
      baseHash: 'hash-1',
      force: false,
    });
    expect(savePayload('alpha', 'body', 'hash-1', true).force).toBe(true);
    expect(savePayload('', '', '').force).toBe(false);
  });
});

describe('T009: escapeDecision (US2.3 truth table)', () => {
  it('clean buffer leaves immediately with no prompt', () => {
    const confirm = vi.fn(() => true);
    expect(escapeDecision({ dirty: false, confirm })).toBe('leave');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('dirty buffer confirms: OK discards, Cancel keeps the buffer in the editor', () => {
    const accept = vi.fn(() => true);
    const cancel = vi.fn(() => false);

    expect(escapeDecision({ dirty: true, confirm: accept })).toBe('leave');
    expect(accept).toHaveBeenCalledWith(DISCARD_EDIT_MESSAGE);

    expect(escapeDecision({ dirty: true, confirm: cancel })).toBe('stay');
    expect(cancel).toHaveBeenCalledWith(DISCARD_EDIT_MESSAGE);
  });

  it('without a confirm port a dirty buffer only reports "confirm" (never discards)', () => {
    expect(escapeDecision({ dirty: true })).toBe('confirm');
  });
});

describe('T009: conflictDecision (US2.4 / FR-007)', () => {
  it('reload confirms first and only then discards the buffer', () => {
    const confirm = vi.fn(() => true);
    expect(conflictDecision({ choice: 'reload', confirm })).toBe('reload');
    expect(confirm).toHaveBeenCalledWith(RELOAD_CONFIRM_MESSAGE);

    expect(conflictDecision({ choice: 'reload', confirm: () => false })).toBe('stay');
    expect(conflictDecision({ choice: 'reload' })).toBe('confirm');
  });

  it('overwrite is returned as-is — the only source of force:true', () => {
    const confirm = vi.fn(() => false);
    expect(conflictDecision({ choice: 'overwrite', confirm })).toBe('overwrite');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('an unknown/no choice changes nothing', () => {
    expect(conflictDecision({ choice: null })).toBe('stay');
    expect(conflictDecision({ choice: undefined })).toBe('stay');
    expect(conflictDecision({ choice: 'nope' as 'reload' })).toBe('stay');
  });
});

describe('T009: handleSaveResponse branches', () => {
  it('200 → reload (read mode re-rendered from disk)', async () => {
    const ports = savePorts();
    const out = await handleSaveResponse(jsonResponse(200, { slug: 'a', updated: 'x', backlinks: {} }), ports);
    expect(out).toEqual({ kind: 'reloaded' });
    expect(ports.reload).toHaveBeenCalledTimes(1);
    expect(ports.setStatus).not.toHaveBeenCalled();
  });

  it('409 → conflict region + focus on the content-preserving control, buffer untouched', async () => {
    const ports = savePorts();
    let buffer = 'my typed buffer';

    const out = await handleSaveResponse(
      jsonResponse(409, {
        error: 'external-edit-conflict',
        disk: { updated: '2026-10-18T00:00:00.000Z', hash: 'abc' },
      }),
      ports,
    );

    expect(out).toEqual({
      kind: 'conflict',
      disk: { updated: '2026-10-18T00:00:00.000Z', hash: 'abc' },
    });
    expect(ports.showConflict).toHaveBeenCalledWith({
      updated: '2026-10-18T00:00:00.000Z',
      hash: 'abc',
    });
    expect(ports.focusConflictControl).toHaveBeenCalledTimes(1);
    expect(ports.setControlsEnabled).toHaveBeenCalledWith(true);
    // Nothing writes to the buffer and no error banner replaces it.
    expect(ports.setStatus).not.toHaveBeenCalled();
    expect(ports.reload).not.toHaveBeenCalled();
    expect(buffer).toBe('my typed buffer');
  });

  it('400 → inline message, stay, re-enable (no reload)', async () => {
    const ports = savePorts();
    const out = await handleSaveResponse(jsonResponse(400, { error: 'invalid-payload' }), ports);
    expect(out).toEqual({ kind: 'failed', error: 'invalid-payload' });
    expect(ports.setStatus).toHaveBeenCalledWith('The save could not be read.');
    expect(ports.setControlsEnabled).toHaveBeenCalledWith(true);
    expect(ports.reload).not.toHaveBeenCalled();
    expect(ports.showConflict).not.toHaveBeenCalled();
  });

  it('500 → the server message inline, stay, re-enable', async () => {
    const ports = savePorts();
    const out = await handleSaveResponse(
      jsonResponse(500, { error: 'save-failed', message: 'EACCES: permission denied' }),
      ports,
    );
    expect(out).toEqual({ kind: 'failed', error: 'save-failed' });
    expect(ports.setStatus).toHaveBeenCalledWith('EACCES: permission denied');
    expect(ports.setControlsEnabled).toHaveBeenCalledWith(true);
    expect(ports.reload).not.toHaveBeenCalled();
  });

  it('404 → loud inline message (a vanished note never reloads silently)', async () => {
    const ports = savePorts();
    const out = await handleSaveResponse(jsonResponse(404, { error: 'note-not-found' }), ports);
    expect(out.kind).toBe('failed');
    expect(ports.setStatus).toHaveBeenCalledWith('This note no longer exists on disk.');
    expect(saveErrorMessage({ error: 'external-edit-conflict' })).toContain('changed on disk');
    expect(saveErrorMessage(null)).toBe('The note could not be saved.');
  });

  it('submitSave POSTs the payload verbatim to /api/note', async () => {
    const ports = savePorts();
    const fetchMock = vi.fn(async () => jsonResponse(200, {}));
    const payload = savePayload('alpha', 'See [[beta]].', 'hash-9', true);

    const out = await submitSave(payload, { ...ports, fetch: fetchMock });

    expect(out.kind).toBe('reloaded');
    expect(fetchMock).toHaveBeenCalledWith('/api/note', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(ports.reload).toHaveBeenCalledTimes(1);
  });
});

/* ================================================================== *
 * T011 — autocomplete state machine (AC1)
 * ================================================================== */

describe('T011: extractQuery', () => {
  it('returns the text after the last unclosed [[ on the caret line', () => {
    expect(extractQuery('[[', 2)).toBe('');
    expect(extractQuery('[[alp', 5)).toBe('alp');
    expect(extractQuery('see [[bet', 9)).toBe('bet');
    expect(extractQuery('x [[one]] y [[tw', 16)).toBe('tw');
    expect(extractQuery('x [[one [[two', 13)).toBe('two'); // innermost wins
  });

  it('returns null when the construct is closed, absent, or half-closed', () => {
    expect(extractQuery('plain text', 10)).toBeNull();
    expect(extractQuery('', 0)).toBeNull();
    expect(extractQuery('[[alpha]]', 9)).toBeNull(); // closed before the caret
    expect(extractQuery('[[alpha]] tail', 13)).toBeNull();
    expect(extractQuery('[[alpha]', 8)).toBeNull(); // stray ] typed before the caret
    expect(extractQuery('text [x', 7)).toBeNull();
    // …but the construct is judged from the caret LEFTWARD, so placing the
    // caret just inside `[[alpha]` still means "the text before me is open".
    expect(extractQuery('[[alpha]', 7)).toBe('alpha');
  });

  it('never crosses a line boundary', () => {
    const text = '[[alpha]]\nnext [[bet';
    expect(extractQuery(text, text.length)).toBe('bet'); // open construct on line 2
    expect(extractQuery(text, 5)).toBe('alp'); // still line-local on line 1
    expect(extractQuery(text, 9)).toBeNull(); // closed construct on line 1
    expect(extractQuery(text, 10)).toBeNull(); // caret at line 2's start: nothing open yet
    // Enter breaks the construct: after the newline there is no [[ on that line.
    expect(extractQuery('[[open\ntext', 6)).toBe('open');
    expect(extractQuery('[[open\ntext', 7)).toBeNull();
  });

  it('rejects out-of-range carets', () => {
    expect(extractQuery('[[a', -1)).toBeNull();
    expect(extractQuery('[[a', 4)).toBeNull();
    expect(extractQuery('[[a', Number.NaN)).toBeNull();
  });
});

describe('T011: filterCandidates', () => {
  it('filters case-insensitively over titles and preserves the page order', () => {
    expect(filterCandidates('alp', CANDIDATES).map((c) => c.slug)).toEqual(['alpha', 'alpha-two']);
    expect(filterCandidates('ALP', CANDIDATES).map((c) => c.slug)).toEqual(['alpha', 'alpha-two']);
    expect(filterCandidates('café', CANDIDATES).map((c) => c.slug)).toEqual(['cafe-society']);
    // Order is inherited, never re-sorted → row 1 stays the default selection.
    expect(filterCandidates('', CANDIDATES).map((c) => c.slug)).toEqual([
      'alpha',
      'alpha-two',
      'beta',
      'cafe-society',
    ]);
    expect(filterCandidates('   ', CANDIDATES)).toHaveLength(CANDIDATES.length);
  });

  it('handles no match, no candidates, and duplicate titles', () => {
    expect(filterCandidates('zzz', CANDIDATES)).toEqual([]);
    expect(filterCandidates('alpha', [])).toEqual([]);
    const dupes: NoteCandidate[] = [
      { slug: 'shared-alpha', title: 'Shared', status: 'seed' },
      { slug: 'shared-beta', title: 'Shared', status: 'growing' },
    ];
    const rows = filterCandidates('shared', dupes);
    expect(rows.map((c) => c.slug)).toEqual(['shared-alpha', 'shared-beta']); // both rows kept…
    expect(rows[0]!.title).toBe(rows[1]!.title);
    expect(rows[0]!.slug).not.toBe(rows[1]!.slug); // …distinguishable by slug (US3.6)
  });

  it('returns a copy so a page cannot mutate the embedded candidate list', () => {
    const rows = filterCandidates('', CANDIDATES);
    rows.pop();
    expect(rows).toHaveLength(CANDIDATES.length - 1);
    expect(CANDIDATES).toHaveLength(4);
  });
});

describe('T011: selection movement + insertion', () => {
  it('wraps in both directions and starts on the first row', () => {
    expect(moveSelection(1, 4, 0)).toBe(1);
    expect(moveSelection(1, 4, 3)).toBe(0); // Down past the end wraps to the top
    expect(moveSelection(-1, 4, 0)).toBe(3); // Up from the top wraps to the bottom
    expect(moveSelection(-1, 4, 3)).toBe(2);
    expect(moveSelection(2, 4, 3)).toBe(1); // multi-step still wraps
    // No selection yet: Down picks row 1 (the default), Up picks the last.
    expect(moveSelection(1, 4, -1)).toBe(0);
    expect(moveSelection(-1, 4, -1)).toBe(3);
    expect(moveSelection(1, 0, -1)).toBe(-1); // nothing to select
  });

  it('replaces the whole [[query construct with [[Title]] and lands after ]]', () => {
    const alpha: NoteCandidate = { slug: 'alpha', title: 'Alpha', status: 'seed' };
    const insert = acceptSelection('alp', alpha);
    expect(insert.replacement).toBe('[[Alpha]]');
    expect(insert.caret).toBe(insert.replacement.length); // right after `]]`
    expect(insert.delta).toBe(9 - 5); // `[[Alpha]]` (9) replaces `[[alp` (5)

    const empty = acceptSelection('', alpha);
    expect(empty.replacement).toBe('[[Alpha]]');
    expect(empty.delta).toBe(7); // `[[` (2) → 9

    // The page applies it: splice over `[[query`, then move the caret by delta.
    const text = 'see [[alp rest';
    const caret = 9;
    const start = caret - 'alp'.length - 2;
    const next = text.slice(0, start) + insert.replacement + text.slice(caret);
    expect(next).toBe('see [[Alpha]] rest');
    expect(caret + insert.delta).toBe(9 + 4);
  });

  it('keeps the whole construct when the query is empty and the title is accented', () => {
    const cafe: NoteCandidate = { slug: 'cafe-society', title: 'Café Society', status: 'seed' };
    expect(acceptSelection('', cafe)).toEqual({
      replacement: '[[Café Society]]',
      caret: '[[Café Society]]'.length,
      delta: '[[Café Society]]'.length - 2,
    });
  });

  it('dismissAutocomplete closes everything', () => {
    expect(dismissAutocomplete()).toEqual({ open: false, query: null, selection: -1 });
  });
});

describe('T011: autocompleteKeyCommand — keys are popup-scoped (FR-008 / PRD F8.4)', () => {
  const FIVE = ['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'] as const;

  it('maps the five keys only while the popup is open', () => {
    expect(autocompleteKeyCommand({ key: 'ArrowUp', popupOpen: true })).toBe('up');
    expect(autocompleteKeyCommand({ key: 'ArrowDown', popupOpen: true })).toBe('down');
    expect(autocompleteKeyCommand({ key: 'Enter', popupOpen: true })).toBe('enter');
    expect(autocompleteKeyCommand({ key: 'Tab', popupOpen: true })).toBe('tab');
    expect(autocompleteKeyCommand({ key: 'Escape', popupOpen: true })).toBe('escape');
  });

  it('returns null for ALL five keys while the popup is closed', () => {
    for (const key of FIVE) {
      expect(autocompleteKeyCommand({ key, popupOpen: false })).toBeNull();
    }
  });

  it('never matches a printable key (a–z, A–Z, 0–9, punctuation sweep)', () => {
    const printable = [
      ...'abcdefghijklmnopqrstuvwxyz',
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      ...'0123456789',
      ...'!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
      ' ',
    ];
    expect(printable.length).toBe(26 + 26 + 10 + 32 + 1);
    for (const key of printable) {
      expect(autocompleteKeyCommand({ key, popupOpen: true }), `open:${key}`).toBeNull();
      expect(autocompleteKeyCommand({ key, popupOpen: false }), `closed:${key}`).toBeNull();
    }
  });

  it('ignores every non-printable key that is not one of the five', () => {
    for (const key of [
      'Shift',
      'Control',
      'Alt',
      'Meta',
      'CapsLock',
      'F5',
      'PageUp',
      'PageDown',
      'Home',
      'End',
      'Backspace',
      'Delete',
      'ArrowLeft',
      'ArrowRight',
      'a'.toUpperCase(), // covered above, kept for readability
    ]) {
      expect(autocompleteKeyCommand({ key, popupOpen: true }), key).toBeNull();
    }
  });
});

/* ================================================================== *
 * T013 — pending-marker create (AC3)
 * ================================================================== */

describe('T013: pendingCreateDecision', () => {
  it('creates once, ignores a second click while in flight', () => {
    expect(pendingCreateDecision({ inFlight: false, target: 'Future Idea' })).toBe('create');
    expect(pendingCreateDecision({ inFlight: true, target: 'Future Idea' })).toBe('ignore');
  });

  it('ignores blank or non-string targets', () => {
    expect(pendingCreateDecision({ inFlight: false, target: '' })).toBe('ignore');
    expect(pendingCreateDecision({ inFlight: false, target: '   ' })).toBe('ignore');
    expect(pendingCreateDecision({ inFlight: false, target: null })).toBe('ignore');
    expect(pendingCreateDecision({ inFlight: false, target: 42 })).toBe('ignore');
    expect(pendingCreateDecision({ inFlight: false, target: undefined })).toBe('ignore');
  });
});

describe('T013: handlePendingResponse', () => {
  function ports() {
    return { assign: vi.fn(), setStatus: vi.fn(), enableMarker: vi.fn() };
  }

  it('201 → navigates to the new note', () => {
    const p = ports();
    const out = handlePendingResponse({ status: 201, body: { slug: 'future-idea' } }, p);
    expect(out).toEqual({ kind: 'created', slug: 'future-idea' });
    expect(p.assign).toHaveBeenCalledWith('/note/future-idea');
    expect(p.setStatus).not.toHaveBeenCalled();
  });

  it('409 → navigates to the EXISTING note (collision never overwrites)', () => {
    const p = ports();
    const out = handlePendingResponse(
      { status: 409, body: { error: 'slug-conflict', slug: 'future-idea' } },
      p,
    );
    expect(out).toEqual({ kind: 'existing', slug: 'future-idea' });
    expect(p.assign).toHaveBeenCalledWith('/note/future-idea');
    expect(p.setStatus).not.toHaveBeenCalled();
    expect(p.enableMarker).not.toHaveBeenCalled();
  });

  it('400/500 → inline error, stay, marker re-enabled', () => {
    const p400 = ports();
    expect(
      handlePendingResponse({ status: 400, body: { error: 'title-required' } }, p400),
    ).toEqual({ kind: 'failed', error: 'That link has no title.' });
    expect(p400.setStatus).toHaveBeenCalledWith('That link has no title.');
    expect(p400.enableMarker).toHaveBeenCalledTimes(1);
    expect(p400.assign).not.toHaveBeenCalled();

    const p500 = ports();
    expect(
      handlePendingResponse(
        { status: 500, body: { error: 'save-failed', message: 'EACCES: permission denied' } },
        p500,
      ),
    ).toEqual({ kind: 'failed', error: 'EACCES: permission denied' });
    expect(p500.assign).not.toHaveBeenCalled();
    expect(p500.enableMarker).toHaveBeenCalledTimes(1);
    expect(pendingErrorMessage(null)).toBe('That note could not be created.');
  });

  it('a 201/409 without a slug is a failure, never a broken navigation', () => {
    const p = ports();
    expect(handlePendingResponse({ status: 201, body: null }, p).kind).toBe('failed');
    expect(handlePendingResponse({ status: 409, body: { error: 'slug-conflict' } }, p).kind).toBe(
      'failed',
    );
    expect(p.assign).not.toHaveBeenCalled();
  });

  it('submitPendingCreate POSTs { title } to /api/capture and navigates on 201', async () => {
    const p = { ...ports(), fetch: vi.fn(async () => jsonResponse(201, { slug: 'future-idea' })) };
    const out = await submitPendingCreate('Future Idea', p as never);
    expect(out).toEqual({ kind: 'created', slug: 'future-idea' });
    expect(p.fetch).toHaveBeenCalledWith('/api/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Future Idea' }),
    });
    expect(p.assign).toHaveBeenCalledWith('/note/future-idea');
  });

  it('hammer-click simulation: the guard admits exactly one create', async () => {
    const calls: string[] = [];
    let inFlight = false;
    const p = {
      assign: vi.fn((url: string) => calls.push(url)),
      setStatus: vi.fn(),
      enableMarker: vi.fn(),
      fetch: vi.fn(
        async () =>
          new Promise<ResponseLike>((resolve) => {
            setTimeout(() => resolve(jsonResponse(201, { slug: 'future-idea' })), 5);
          }),
      ),
    };

    const click = async (): Promise<void> => {
      // The decision is made synchronously, exactly like a click handler.
      if (pendingCreateDecision({ inFlight, target: 'Future Idea' }) !== 'create') return;
      inFlight = true;
      try {
        await submitPendingCreate('Future Idea', p as never);
      } finally {
        inFlight = false;
      }
    };

    // Five clicks before the first response lands → one request, one navigation.
    await Promise.all([click(), click(), click(), click(), click()]);

    expect(p.fetch).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['/note/future-idea']);
  });
});

/* ================================================================== *
 * F4 — status-control decisions (plan R3/R6, Q2)
 * ================================================================== */

describe('F4 statusDecision (post-on-change truth table)', () => {
  it('admits a changed selection only while nothing is in flight', () => {
    expect(statusDecision({ inFlight: false, changed: true })).toBe('save');
    expect(statusDecision({ inFlight: true, changed: true })).toBe('ignore');
    expect(statusDecision({ inFlight: false, changed: false })).toBe('ignore');
    expect(statusDecision({ inFlight: true, changed: false })).toBe('ignore');
  });
});

describe('F4 statusSavePayload (contract §1 — no body key)', () => {
  it('carries slug + status + baseHash and NO body (disk truth by construction)', () => {
    const payload = statusSavePayload('alpha', 'growing', 'hash-1');
    expect(payload).toEqual({ slug: 'alpha', status: 'growing', baseHash: 'hash-1' });
    expect(payload).not.toHaveProperty('body');
    expect(payload).not.toHaveProperty('force'); // default false stays off the wire
  });

  it('adds force only when the user explicitly chose Overwrite', () => {
    expect(statusSavePayload('alpha', 'archived', 'hash-1', true).force).toBe(true);
    expect(statusSavePayload('alpha', 'archived', 'hash-1', false)).toEqual({
      slug: 'alpha',
      status: 'archived',
      baseHash: 'hash-1',
    });
  });

  it('F3 regression: savePayload still emits a valid body-only payload', () => {
    const payload = savePayload('alpha', 'body text', 'hash-2');
    expect(payload).toEqual({ slug: 'alpha', body: 'body text', baseHash: 'hash-2', force: false });
    expect(payload).not.toHaveProperty('status'); // a body save never flips status
    expect(savePayload('alpha', 'body text', 'hash-2', true).force).toBe(true);
  });
});

describe('F4 statusControlEnabled (disable matrix, Q2)', () => {
  it('is true only while edit mode is closed and no save is in flight', () => {
    expect(statusControlEnabled({ editOpen: false, saveInFlight: false })).toBe(true);
    expect(statusControlEnabled({ editOpen: true, saveInFlight: false })).toBe(false);
    expect(statusControlEnabled({ editOpen: false, saveInFlight: true })).toBe(false);
    expect(statusControlEnabled({ editOpen: true, saveInFlight: true })).toBe(false);
  });
});

/* ================================================================== *
 * F8 T004 — autosave decisions (FR-006, plan R2, contract C1/C3).
 * Previously import-only: these five symbols had ZERO exercising cases
 * (critic C1 / tester flow-autosave). Pure vitest: no DOM, no network.
 * ================================================================== */

describe('F8 T004: shouldAutosave (idle decision truth table)', () => {
  it('fires only when the buffer is dirty AND nothing is in flight', () => {
    expect(shouldAutosave({ dirty: true, inFlight: false })).toBe(true);
    expect(shouldAutosave({ dirty: true, inFlight: true })).toBe(false); // double-POST guard
    expect(shouldAutosave({ dirty: false, inFlight: false })).toBe(false); // clean idle never POSTs
    expect(shouldAutosave({ dirty: false, inFlight: true })).toBe(false);
  });
});

describe('F8 T004: AUTOSAVE_IDLE_MS (spec Q2 — 2 s idle budget)', () => {
  it('is exactly 2000 ms', () => {
    expect(AUTOSAVE_IDLE_MS).toBe(2000);
  });
});

describe('F8 T004: applySaveSuccess (contract C1 hash refresh)', () => {
  const saved: EditBuffer = { value: 'saved text', baseHash: 'hash-1', dirty: false };

  it('refreshes baseHash from the C1 hash echo, keeps the value, marks clean', () => {
    const out = applySaveSuccess(saved, 'saved text', { hash: 'hash-2' });
    expect(out).toEqual({ value: 'saved text', baseHash: 'hash-2', dirty: false });
    expect(saved.baseHash).toBe('hash-1'); // input object untouched (pure)
  });

  it('keeps the previous baseHash when the body carries no hash', () => {
    const out = applySaveSuccess(saved, 'saved text', {});
    expect(out.baseHash).toBe('hash-1');
    expect(out.dirty).toBe(false);
  });

  it('typing while the save was in flight leaves the buffer dirty', () => {
    const typed: EditBuffer = { value: 'saved text + newer typing', baseHash: 'hash-1', dirty: true };
    const out = applySaveSuccess(typed, 'saved text', { hash: 'hash-2' });
    expect(out.baseHash).toBe('hash-2'); // disk hash still refreshes (no future 409)
    expect(out.value).toBe('saved text + newer typing'); // buffer keeps the newer text
    expect(out.dirty).toBe(true); // …so the next idle fires again
  });

  it('a fully undone buffer (value equals the sent text) comes back clean', () => {
    const typed: EditBuffer = { value: 'saved text', baseHash: 'hash-1', dirty: true };
    expect(applySaveSuccess(typed, 'saved text', { hash: 'hash-2' }).dirty).toBe(false);
  });
});

describe('F8 T004: autosavePayload (FR-006 — structurally force:false)', () => {
  it('builds the save payload with force:false on the wire', () => {
    expect(autosavePayload('alpha', 'body text', 'hash-1')).toEqual({
      slug: 'alpha',
      body: 'body text',
      baseHash: 'hash-1',
      force: false,
    });
    expect(autosavePayload('alpha', 'body text', 'hash-1').force).toBe(false);
  });

  it('accepts exactly three arguments — force:true cannot be expressed', () => {
    expect(autosavePayload).toHaveLength(3);
  });
});

describe('F8 T004: handleBufferSaveResponse (buffer save — never reloads)', () => {
  function bufferPorts() {
    return {
      showConflict: vi.fn(),
      focusConflictControl: vi.fn(),
      setStatus: vi.fn(),
      setControlsEnabled: vi.fn(),
      reload: vi.fn(), // optional port: must never be called on any branch
    };
  }

  it('200 -> saved with the parsed body and no side effects at all', async () => {
    const ports = bufferPorts();
    const out = await handleBufferSaveResponse(
      jsonResponse(200, { slug: 'alpha', hash: 'hash-2', updated: 'x' }),
      ports,
    );
    expect(out).toEqual({ kind: 'saved', body: { slug: 'alpha', hash: 'hash-2', updated: 'x' } });
    expect(ports.showConflict).not.toHaveBeenCalled();
    expect(ports.setStatus).not.toHaveBeenCalled();
    expect(ports.setControlsEnabled).not.toHaveBeenCalled();
    expect(ports.reload).not.toHaveBeenCalled();
  });

  it('409 -> conflict region revealed, focus moved, controls re-enabled, no reload', async () => {
    const ports = bufferPorts();
    const out = await handleBufferSaveResponse(
      jsonResponse(409, {
        error: 'external-edit-conflict',
        disk: { updated: '2026-10-28T00:00:00.000Z', hash: 'disk-1' },
      }),
      ports,
    );
    expect(out).toEqual({
      kind: 'conflict',
      disk: { updated: '2026-10-28T00:00:00.000Z', hash: 'disk-1' },
    });
    expect(ports.showConflict).toHaveBeenCalledWith({
      updated: '2026-10-28T00:00:00.000Z',
      hash: 'disk-1',
    });
    expect(ports.focusConflictControl).toHaveBeenCalledTimes(1);
    expect(ports.setControlsEnabled).toHaveBeenCalledWith(true);
    expect(ports.setStatus).not.toHaveBeenCalled();
    expect(ports.reload).not.toHaveBeenCalled();
  });

  it('409 without disk details defaults the disk snapshot to empty strings', async () => {
    const ports = bufferPorts();
    const out = await handleBufferSaveResponse(
      jsonResponse(409, { error: 'external-edit-conflict' }),
      ports,
    );
    expect(out).toEqual({ kind: 'conflict', disk: { updated: '', hash: '' } });
    expect(ports.reload).not.toHaveBeenCalled();
  });

  it('400 -> inline mapped message, controls re-enabled, stay (no reload)', async () => {
    const ports = bufferPorts();
    const out = await handleBufferSaveResponse(jsonResponse(400, { error: 'invalid-payload' }), ports);
    expect(out).toEqual({ kind: 'failed', error: 'invalid-payload' });
    expect(ports.setStatus).toHaveBeenCalledWith('The save could not be read.');
    expect(ports.setControlsEnabled).toHaveBeenCalledWith(true);
    expect(ports.showConflict).not.toHaveBeenCalled();
    expect(ports.reload).not.toHaveBeenCalled();
  });

  it('500 -> the server message inline; controls re-enabled; no reload', async () => {
    const ports = bufferPorts();
    const out = await handleBufferSaveResponse(
      jsonResponse(500, { error: 'save-failed', message: 'EACCES: permission denied' }),
      ports,
    );
    expect(out).toEqual({ kind: 'failed', error: 'save-failed' });
    expect(ports.setStatus).toHaveBeenCalledWith('EACCES: permission denied');
    expect(ports.setControlsEnabled).toHaveBeenCalledWith(true);
    expect(ports.reload).not.toHaveBeenCalled();
  });

  it('404 -> loud vanished-note message, never a silent reload', async () => {
    const ports = bufferPorts();
    const out = await handleBufferSaveResponse(jsonResponse(404, { error: 'note-not-found' }), ports);
    expect(out).toEqual({ kind: 'failed', error: 'note-not-found' });
    expect(ports.setStatus).toHaveBeenCalledWith('This note no longer exists on disk.');
    expect(ports.setControlsEnabled).toHaveBeenCalledWith(true);
    expect(ports.showConflict).not.toHaveBeenCalled();
    expect(ports.reload).not.toHaveBeenCalled();
  });
});
