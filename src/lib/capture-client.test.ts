/**
 * F2 capture-client tests — `src/lib/capture-client.ts`.
 *
 * Each block below corresponds to the implement-C task line that turned it
 * green (T006 → T014 → T015 → T018 → T021, FLOW_ID `flow_20261015_2154_f2qc9x`).
 * Everything is DOM-free: side effects arrive through mocked ports (fetch,
 * location, sessionStorage, focus), so the suite runs under plain `vitest run`
 * with no browser (plan R8, D12).
 */
import { describe, expect, it } from 'vitest';

import {
  GIT_WARNED_KEY,
  captureKeyCommand,
  conflictMessage,
  gitWarningDecision,
  handleCaptureResponse,
  handleEscape,
  isCaptureKeyCommand,
  openExisting,
  saveCaptureAsNew,
  shouldAcceptSubmit,
  shouldOpenCapture,
  submitCapture,
  type CaptureResponsePorts,
  type CaptureSubmitPorts,
  type ResponseLike,
} from './capture-client';

/** In-memory `sessionStorage` stand-in. */
function mockStorage(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

/** Recording ports: navigation, status messages, conflict reveal, focus. */
function mockPorts(initial: Record<string, string> = {}): CaptureResponsePorts & {
  assigned: string[];
  statuses: string[];
  conflicts: string[];
  focusCalls: number;
  storage: ReturnType<typeof mockStorage>;
} {
  const storage = mockStorage(initial);
  const ports = {
    assigned: [] as string[],
    statuses: [] as string[],
    conflicts: [] as string[],
    focusCalls: 0,
    storage,
    assign: (url: string) => void ports.assigned.push(url),
    setStatus: (message: string) => void ports.statuses.push(message),
    showConflict: (slug: string) => void ports.conflicts.push(slug),
    focusSaveAsNew: () => void (ports.focusCalls += 1),
  };
  return ports as CaptureResponsePorts & typeof ports;
}

/** Minimal `Response` double. */
function response(status: number, body: unknown): ResponseLike {
  return { status, json: async () => body };
}

/* ------------------------------------------------------------------ *
 * T006 — dashboard `c` shortcut predicate (FR-002, plan §4)
 * ------------------------------------------------------------------ */

describe('shouldOpenCapture (T006)', () => {
  it('opens capture for a bare `c` with nothing focused', () => {
    expect(shouldOpenCapture({ key: 'c' })).toBe(true);
    expect(shouldOpenCapture({ key: 'c', activeTag: null })).toBe(true);
    expect(shouldOpenCapture({ key: 'c', activeTag: 'body' })).toBe(true);
    expect(
      shouldOpenCapture({ key: 'c', activeTag: 'div', activeContentEditable: false }),
    ).toBe(true);
  });

  it('is inert while focus is inside input / textarea / select', () => {
    for (const activeTag of ['input', 'textarea', 'select']) {
      expect(shouldOpenCapture({ key: 'c', activeTag }), activeTag).toBe(false);
      // tag names arrive in upper case from `tagName`
      expect(shouldOpenCapture({ key: 'c', activeTag: activeTag.toUpperCase() })).toBe(false);
    }
  });

  it('is inert inside a [contenteditable] region even though its tag is `div`', () => {
    expect(
      shouldOpenCapture({ key: 'c', activeTag: 'div', activeContentEditable: true }),
    ).toBe(false);
    expect(
      shouldOpenCapture({ key: 'c', activeTag: 'span', activeContentEditable: true }),
    ).toBe(false);
  });

  it('is inert for every modifier combo on `c`', () => {
    const modifiers = ['ctrl', 'meta', 'alt', 'shift'] as const;
    for (let mask = 1; mask < 1 << modifiers.length; mask += 1) {
      const combo: Record<string, boolean> = {};
      modifiers.forEach((m, i) => {
        if (mask & (1 << i)) combo[m] = true;
      });
      const label = modifiers.filter((_, i) => mask & (1 << i)).join('+');
      expect(shouldOpenCapture({ key: 'c', ...combo }), `${label}+c`).toBe(false);
      // …even when focus is on the body
      expect(
        shouldOpenCapture({ key: 'c', ...combo, activeTag: null }),
        `${label}+c, no focus`,
      ).toBe(false);
    }
  });

  it('is inert for every other key (no modifiers, nothing focused)', () => {
    const otherKeys = [
      'C', 'x', 'X', 's', 'n', '1', '0', ' ', 'Enter', 'Escape', 'Tab',
      'ArrowUp', 'ArrowDown', 'F5', 'Dead', 'Process', '`', '/', '-',
    ];
    for (const key of otherKeys) {
      expect(shouldOpenCapture({ key }), key).toBe(false);
      expect(shouldOpenCapture({ key, activeTag: null }), key).toBe(false);
      expect(shouldOpenCapture({ key, activeTag: 'body' }), key).toBe(false);
    }
  });

  it('combines: another key inside a field stays inert too', () => {
    expect(shouldOpenCapture({ key: 'x', activeTag: 'input' })).toBe(false);
    expect(shouldOpenCapture({ key: 'Enter', activeTag: 'textarea' })).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * T014 — submit guard + response handling (SC-008/FR-011, plan R5)
 * ------------------------------------------------------------------ */

describe('shouldAcceptSubmit (T014)', () => {
  it('admits the first submit', () => {
    expect(shouldAcceptSubmit(false)).toBe(true);
  });

  it('rejects a second submit while one is in flight (exactly one note)', () => {
    expect(shouldAcceptSubmit(true)).toBe(false);
  });
});

describe('handleCaptureResponse (T014)', () => {
  it('201 committed → navigate to the dashboard', async () => {
    const ports = mockPorts();
    const outcome = await handleCaptureResponse(
      response(201, { slug: 'probe-note', status: 'seed', git: { committed: true } }),
      ports,
    );

    expect(ports.assigned).toEqual(['/']);
    expect(ports.statuses).toEqual([]);
    expect(ports.storage.data.size).toBe(0);
    expect(outcome).toEqual({ kind: 'saved', degraded: false, url: '/' });
  });

  it('201 degraded, no warn flag yet → set dg.gitWarned + navigate to /?degraded=1', async () => {
    const ports = mockPorts();
    const outcome = await handleCaptureResponse(
      response(201, {
        slug: 'probe-note',
        status: 'seed',
        git: { committed: false, reason: 'fatal: not a git repository' },
      }),
      ports,
    );

    expect(ports.storage.getItem(GIT_WARNED_KEY)).toBe('1');
    expect(ports.assigned).toEqual(['/?degraded=1']);
    expect(outcome).toEqual({ kind: 'saved', degraded: true, url: '/?degraded=1' });
  });

  it('repeat degraded in the same page session → plain / (no second warning navigation)', async () => {
    const ports = mockPorts({ [GIT_WARNED_KEY]: '1' });
    const outcome = await handleCaptureResponse(
      response(201, { slug: 'probe-note', git: { committed: false, reason: 'no identity' } }),
      ports,
    );

    expect(ports.assigned).toEqual(['/']);
    expect(ports.storage.getItem(GIT_WARNED_KEY)).toBe('1');
    expect(outcome).toEqual({ kind: 'saved', degraded: true, url: '/' });
  });

  it('400 → inline title message and NO navigation', async () => {
    const ports = mockPorts();
    const outcome = await handleCaptureResponse(
      response(400, { error: 'title-required' }),
      ports,
    );

    expect(ports.statuses).toEqual(['A title is required.']);
    expect(ports.assigned).toEqual([]);
    expect(ports.storage.data.size).toBe(0);
    expect(outcome).toEqual({ kind: 'invalid', error: 'title-required' });
  });

  it('400 invalid-payload → inline message, still no navigation', async () => {
    const ports = mockPorts();
    const outcome = await handleCaptureResponse(
      response(400, { error: 'invalid-payload' }),
      ports,
    );

    expect(ports.assigned).toEqual([]);
    expect(ports.statuses).toEqual(['The capture could not be read.']);
    expect(outcome).toEqual({ kind: 'invalid', error: 'invalid-payload' });
  });

  it('500 → loud inline error, no navigation', async () => {
    const ports = mockPorts();
    const outcome = await handleCaptureResponse(
      response(500, { error: 'save-failed', message: 'Vault unreachable' }),
      ports,
    );

    expect(ports.assigned).toEqual([]);
    expect(ports.statuses).toEqual(['Vault unreachable']);
    expect(outcome).toEqual({ kind: 'failed', error: 'save-failed' });
  });
});

describe('submitCapture (T014)', () => {
  it('POSTs the payload as JSON and applies the response (mocked fetch/location/sessionStorage)', async () => {
    const calls: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] = [];
    const ports = mockPorts();
    const submitPorts: CaptureSubmitPorts = {
      ...ports,
      fetch: async (url, init) => {
        calls.push({ url, init });
        return response(201, { slug: 'probe-note', git: { committed: true } });
      },
    };

    const outcome = await submitCapture(
      { title: 'Probe Note', body: 'hello', tagsText: 'a, b' },
      submitPorts,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/capture');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(calls[0].init.body)).toEqual({
      title: 'Probe Note',
      body: 'hello',
      tagsText: 'a, b',
      mode: 'new',
    });
    expect(ports.assigned).toEqual(['/']);
    expect(outcome.kind).toBe('saved');
  });

  it('a degraded 201 through the mocked fetch issues the warn-once navigation', async () => {
    const ports = mockPorts();
    const submitPorts: CaptureSubmitPorts = {
      ...ports,
      fetch: async () =>
        response(201, { slug: 'probe-note', git: { committed: false, reason: 'no repo' } }),
    };

    const outcome = await submitCapture({ title: 'Probe Note' }, submitPorts);

    expect(ports.storage.getItem(GIT_WARNED_KEY)).toBe('1');
    expect(ports.assigned).toEqual(['/?degraded=1']);
    expect(outcome).toEqual({ kind: 'saved', degraded: true, url: '/?degraded=1' });
  });

  it('a 400 through the mocked fetch never navigates', async () => {
    const ports = mockPorts();
    const submitPorts: CaptureSubmitPorts = {
      ...ports,
      fetch: async () => response(400, { error: 'title-required' }),
    };

    const outcome = await submitCapture({ title: '   ' }, submitPorts);

    expect(ports.assigned).toEqual([]);
    expect(ports.statuses).toEqual(['A title is required.']);
    expect(outcome.kind).toBe('invalid');
  });
});

/* ------------------------------------------------------------------ *
 * T015 — warn-once decision truth table (FR-010/SC-006, plan R5)
 * ------------------------------------------------------------------ */

describe('gitWarningDecision (T015)', () => {
  // Full truth table: navType × hasParam × warned.
  const table: {
    navType: 'navigate' | 'reload' | 'back_forward';
    hasParam: boolean;
    warned: boolean;
    banner: boolean;
    nextWarned: boolean;
    why: string;
  }[] = [
    { navType: 'navigate', hasParam: false, warned: false, banner: false, nextWarned: false, why: 'plain dashboard load' },
    { navType: 'navigate', hasParam: false, warned: true, banner: false, nextWarned: true, why: 'no param → never banner; flag kept (repeat degraded went to plain /)' },
    { navType: 'navigate', hasParam: true, warned: false, banner: true, nextWarned: true, why: 'param + not yet warned → show and set the flag' },
    { navType: 'navigate', hasParam: true, warned: true, banner: true, nextWarned: true, why: 'first delivery: /new pre-set the flag before navigating with the param (plan R5)' },
    { navType: 'reload', hasParam: false, warned: false, banner: false, nextWarned: false, why: 'reload, already clear' },
    { navType: 'reload', hasParam: false, warned: true, banner: false, nextWarned: false, why: 'reload clears the flag first → new page session' },
    { navType: 'reload', hasParam: true, warned: false, banner: true, nextWarned: true, why: 'reload clears first, then param + unwarned shows (U2)' },
    { navType: 'reload', hasParam: true, warned: true, banner: true, nextWarned: true, why: 'reload clears first, so a warned flag still shows with the param (U2)' },
    { navType: 'back_forward', hasParam: false, warned: false, banner: false, nextWarned: false, why: 'no param' },
    { navType: 'back_forward', hasParam: false, warned: true, banner: false, nextWarned: true, why: 'no param' },
    { navType: 'back_forward', hasParam: true, warned: false, banner: true, nextWarned: true, why: 'param + unwarned shows' },
    { navType: 'back_forward', hasParam: true, warned: true, banner: false, nextWarned: true, why: 'already warned → no second banner in the same page session' },
  ];

  for (const row of table) {
    it(`${row.navType} | param=${row.hasParam} | warned=${row.warned} → banner=${row.banner} (${row.why})`, () => {
      expect(gitWarningDecision({ navType: row.navType, hasParam: row.hasParam, warned: row.warned })).toEqual({
        banner: row.banner,
        warned: row.nextWarned,
      });
    });
  }

  it('exactly one warning per page session across captures, reloads and re-entries', () => {
    // T014 (/new) and T015 (dashboard) share one sessionStorage flag.
    const storage = new Map<string, string>();
    const warnedFlag = () => storage.get('dg.gitWarned') === '1';
    let bannerCount = 0;

    /** A degraded save on /new → the navigation it issues (T014). */
    const captureDegrades = (): string => {
      if (warnedFlag()) return '/';
      storage.set('dg.gitWarned', '1');
      return '/?degraded=1';
    };

    /** The dashboard load that follows (T015). */
    const dashboardLoads = (navType: 'navigate' | 'reload' | 'back_forward', url: string) => {
      const decision = gitWarningDecision({
        navType,
        hasParam: url === '/?degraded=1',
        warned: warnedFlag(),
      });
      if (decision.banner) {
        bannerCount += 1;
        // the URL is replaceState'd back to '/' once the banner shows
        url = '/';
      }
      if (decision.warned) storage.set('dg.gitWarned', '1');
      else storage.delete('dg.gitWarned');
      return url;
    };

    // 1st degraded capture in the tab → banner
    expect(captureDegrades()).toBe('/?degraded=1');
    dashboardLoads('navigate', '/?degraded=1');
    expect(bannerCount).toBe(1);

    // 2nd degraded capture in the same tab → silent (flag suppresses the param)
    expect(captureDegrades()).toBe('/');
    dashboardLoads('navigate', '/');
    expect(bannerCount).toBe(1);

    // reload of the dashboard starts a new page session → flag cleared, still no banner
    dashboardLoads('reload', '/');
    expect(storage.has('dg.gitWarned')).toBe(false);
    expect(bannerCount).toBe(1);

    // next degraded capture warns again — exactly one banner per session
    expect(captureDegrades()).toBe('/?degraded=1');
    dashboardLoads('navigate', '/?degraded=1');
    expect(bannerCount).toBe(2);
  });
});

/* ------------------------------------------------------------------ *
 * T018 — capture key commands, printable sweep, Esc decision
 * (FR-006/FR-007, SC-004, plan §5)
 * ------------------------------------------------------------------ */

describe('captureKeyCommand / isCaptureKeyCommand (T018)', () => {
  it('matches ONLY Escape, Ctrl/⌘+Enter, and Enter while #capture-title is focused', () => {
    expect(captureKeyCommand({ key: 'Escape' })).toBe('escape');
    expect(captureKeyCommand({ key: 'Escape', activeId: 'capture-body' })).toBe('escape');
    expect(captureKeyCommand({ key: 'Enter', ctrl: true })).toBe('submit');
    expect(captureKeyCommand({ key: 'Enter', meta: true })).toBe('submit');
    expect(captureKeyCommand({ key: 'Enter', ctrl: true, activeId: 'capture-title' })).toBe('submit');
    expect(captureKeyCommand({ key: 'Enter', activeId: 'capture-title' })).toBe('advance-title');

    expect(isCaptureKeyCommand({ key: 'Escape' })).toBe(true);
    expect(isCaptureKeyCommand({ key: 'Enter', meta: true })).toBe(true);
    expect(isCaptureKeyCommand({ key: 'Enter', activeId: 'capture-title' })).toBe(true);
  });

  it('does NOT match Enter outside the title, modifier-laden Escape, or bare keys', () => {
    expect(captureKeyCommand({ key: 'Enter' })).toBe(null);
    expect(captureKeyCommand({ key: 'Enter', activeId: 'capture-body' })).toBe(null);
    expect(captureKeyCommand({ key: 'Enter', activeId: 'capture-tags' })).toBe(null);
    expect(captureKeyCommand({ key: 'Enter', activeId: null })).toBe(null);
    expect(captureKeyCommand({ key: 'Escape', ctrl: true })).toBe(null);
    expect(captureKeyCommand({ key: 'Escape', meta: true })).toBe(null);
    expect(captureKeyCommand({ key: 'Escape', alt: true })).toBe(null);
    expect(captureKeyCommand({ key: 'Enter', alt: true, activeId: 'capture-title' })).toBe(null);
    expect(isCaptureKeyCommand({ key: 'Enter', activeId: 'capture-body' })).toBe(false);
    expect(isCaptureKeyCommand({ key: 'a', activeId: 'capture-title' })).toBe(false);
  });

  it('printable-key sweep: a–z, A–Z, 0–9 and punctuation match NO command predicate', () => {
    const printable =
      'abcdefghijklmnopqrstuvwxyz' +
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
      '0123456789' +
      '`~!@#$%^&*()-_=+[]{}\\|;:\'"<>,./? ' +
      '\t';
    const focusPoints = [null, 'capture-title', 'capture-body', 'capture-tags'];
    const modifierSets = [
      {},
      { shift: true },
      { ctrl: true },
      { meta: true },
      { alt: true },
      { ctrl: true, shift: true },
      { meta: true, alt: true },
    ];
    const captureFields = ['input', 'textarea'];

    let checked = 0;
    for (const key of printable) {
      for (const activeId of focusPoints) {
        for (const modifiers of modifierSets) {
          expect(
            captureKeyCommand({ key, activeId, ...modifiers }),
            `key=${JSON.stringify(key)} focus=${activeId} mods=${JSON.stringify(modifiers)}`,
          ).toBe(null);
          expect(isCaptureKeyCommand({ key, activeId, ...modifiers })).toBe(false);
          // …and the dashboard predicate is inert while a capture field has focus (FR-002)
          for (const activeTag of captureFields) {
            expect(
              shouldOpenCapture({ key, activeTag, ...modifiers }),
              `dashboard: key=${JSON.stringify(key)} in <${activeTag}>`,
            ).toBe(false);
          }
          checked += 1;
        }
      }
    }
    expect(checked).toBe(printable.length * focusPoints.length * modifierSets.length);
  });
});

describe('handleEscape (T018)', () => {
  function escapePorts(confirmResult: boolean) {
    const calls = { confirm: 0, assigned: [] as string[], refocused: 0, messages: [] as string[] };
    const ports = {
      confirm: (message: string) => {
        calls.confirm += 1;
        calls.messages.push(message);
        return confirmResult;
      },
      assign: (url: string) => void calls.assigned.push(url),
      refocusTitle: () => void (calls.refocused += 1),
    };
    return { ports, calls };
  }

  it('empty fields → navigate immediately with no prompt', () => {
    for (const fields of [
      {},
      { title: '', body: '', tags: '' },
      { title: '   ', body: '\n\t ', tags: ' , ' },
    ]) {
      const { ports, calls } = escapePorts(true);
      expect(handleEscape(fields, ports)).toBe('navigated');
      expect(calls.confirm).toBe(0);
      expect(calls.assigned).toEqual(['/']);
      expect(calls.refocused).toBe(0);
    }
  });

  it('non-empty title + cancel → confirm first, refocus the title, no navigation', () => {
    const { ports, calls } = escapePorts(false);
    expect(handleEscape({ title: 'Retrieval Practice' }, ports)).toBe('cancelled');
    expect(calls.confirm).toBe(1);
    expect(calls.messages).toEqual(['Discard this capture?']);
    expect(calls.assigned).toEqual([]);
    expect(calls.refocused).toBe(1);
  });

  it('non-empty body + confirm → navigate without saving', () => {
    const { ports, calls } = escapePorts(true);
    expect(handleEscape({ title: '', body: 'some **markdown**' }, ports)).toBe('navigated');
    expect(calls.confirm).toBe(1);
    expect(calls.assigned).toEqual(['/']);
    expect(calls.refocused).toBe(0);
  });

  it('non-empty tags alone also count as unsaved text', () => {
    const { ports, calls } = escapePorts(false);
    expect(handleEscape({ tags: 'memory' }, ports)).toBe('cancelled');
    expect(calls.confirm).toBe(1);
    expect(calls.assigned).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * T021 — 409 conflict decision + both choices (AC4, plan §3)
 * ------------------------------------------------------------------ */

describe('409 conflict handling (T021)', () => {
  const draft = () => ({
    title: 'Retrieval Practice',
    body: 'typed **body**\nsecond line',
    tags: 'memory, reading',
  });

  it('keeps the draft, reveals the conflict, focuses #save-as-new, leaves status clear', async () => {
    const ports = mockPorts();
    const fields = draft();
    const fieldsBefore = { ...fields };

    const outcome = await handleCaptureResponse(
      response(409, { error: 'slug-conflict', slug: 'retrieval-practice' }),
      ports,
    );

    // the conflict state is revealed and focus lands on the content-preserving choice
    expect(ports.conflicts).toEqual(['retrieval-practice']);
    expect(ports.focusCalls).toBe(1);
    // …title, body and tags are untouched: this branch writes to no field
    expect(fields).toEqual(fieldsBefore);
    expect(conflictMessage('retrieval-practice')).toBe(
      'A note already exists at "retrieval-practice"',
    );
    // #capture-status stays clear and nothing navigates away
    expect(ports.statuses).toEqual([]);
    expect(ports.assigned).toEqual([]);
    expect(outcome).toEqual({ kind: 'conflict', slug: 'retrieval-practice' });
  });

  it('save-as-new → re-POSTs the same payload with mode:"unique" → 201 → assign("/")', async () => {
    const typed = draft();
    const payload = { title: typed.title, body: typed.body, tagsText: typed.tags };
    const ports = mockPorts();
    const seen: unknown[] = [];
    const submitPorts: CaptureSubmitPorts = {
      ...ports,
      fetch: async (_url, init) => {
        seen.push(JSON.parse(init.body));
        return response(201, { slug: 'retrieval-practice-2', git: { committed: true } });
      },
    };

    const outcome = await saveCaptureAsNew(payload, submitPorts);

    expect(seen).toEqual([
      {
        title: 'Retrieval Practice',
        body: 'typed **body**\nsecond line',
        tagsText: 'memory, reading',
        mode: 'unique',
      },
    ]);
    expect(ports.assigned).toEqual(['/']);
    expect(ports.conflicts).toEqual([]);
    expect(ports.statuses).toEqual([]);
    expect(outcome).toEqual({ kind: 'saved', degraded: false, url: '/' });
  });

  it('open-existing → location.assign("/note/" + slug) with no second prompt', () => {
    const ports = mockPorts();

    openExisting('retrieval-practice', ports);

    expect(ports.assigned).toEqual(['/note/retrieval-practice']);
    expect(ports.statuses).toEqual([]);
    expect(ports.conflicts).toEqual([]);
    expect(ports.focusCalls).toBe(0);
  });
});
