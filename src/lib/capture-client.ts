/**
 * F2 capture client — pure, DOM-free decision functions for the quick-capture
 * loop (US1 shortcut, US2 submit/response/warn-once, US3 key discipline,
 * US4 title-conflict choices).
 *
 * Scope: `src/lib/capture-client.ts` + `src/lib/capture-client.test.ts` are
 * owned exclusively by the implement-C card (T006 → T014 → T015 → T018 → T021,
 * FLOW_ID `flow_20261015_2154_f2qc9x`). Every side effect (navigation,
 * `sessionStorage`, `fetch`, focus, DOM messages) arrives through an injected
 * port, which is what makes the whole surface testable under plain vitest
 * with no browser (plan R8 / D12).
 *
 * Design references: plan.md §4 (dashboard `c` shortcut), R5 (warn-once),
 * §5 (focus discipline), §3 (409 conflict UX); spec FR-002/006/007/010/011/013.
 */

/* ------------------------------------------------------------------ *
 * T006 — dashboard `c` shortcut predicate (US1, FR-001/002, plan §4)
 * ------------------------------------------------------------------ */

/** Element tags that must swallow the dashboard shortcut (they type instead). */
const EDITOR_TAGS = new Set(['input', 'textarea', 'select']);

export interface CaptureShortcutInput {
  /** `KeyboardEvent.key` of the pressed key. */
  key: string;
  /** `KeyboardEvent.ctrlKey`. */
  ctrl?: boolean;
  /** `KeyboardEvent.metaKey` (⌘). */
  meta?: boolean;
  /** `KeyboardEvent.altKey`. */
  alt?: boolean;
  /** `KeyboardEvent.shiftKey` — a modifier, so Shift+c never opens capture. */
  shift?: boolean;
  /**
   * Lower-cased tag name of `document.activeElement`, or `null`/`undefined`
   * when nothing (i.e. the body) is focused.
   */
  activeTag?: string | null;
  /**
   * `document.activeElement.isContentEditable` — `[contenteditable]` regions
   * are not distinguishable from their tag name (`div`), so the caller must
   * pass this flag for FR-002's editable-region rule to apply.
   */
  activeContentEditable?: boolean;
}

/**
 * Should the dashboard open `/new` for this key event? (FR-002, plan §4)
 *
 * True only for a bare `c` — no modifier held — while focus is NOT inside an
 * `input`, `textarea`, `select` or `[contenteditable]` region, so `c` typed
 * into a field simply types the letter.
 *
 * Wiring example (dashboard keydown listener, T007):
 * ```ts
 * const el = document.activeElement as HTMLElement | null;
 * if (shouldOpenCapture({
 *   key: e.key,
 *   ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey,
 *   activeTag: el ? el.tagName.toLowerCase() : null,
 *   activeContentEditable: el ? el.isContentEditable : false,
 * })) location.assign('/new');
 * ```
 */
export function shouldOpenCapture(input: CaptureShortcutInput): boolean {
  const {
    key,
    ctrl = false,
    meta = false,
    alt = false,
    shift = false,
    activeTag = null,
    activeContentEditable = false,
  } = input;

  if (key !== 'c') return false;
  if (ctrl || meta || alt || shift) return false;
  if (activeContentEditable) return false;
  if (activeTag !== null && EDITOR_TAGS.has(activeTag.trim().toLowerCase())) return false;
  return true;
}

/* ------------------------------------------------------------------ *
 * T014 — submit guard + non-conflict response handling (US2, plan R5)
 * ------------------------------------------------------------------ */

/** `sessionStorage` key that records "the degraded-history warning was issued". */
export const GIT_WARNED_KEY = 'dg.gitWarned';

/** Value stored under {@link GIT_WARNED_KEY} once the warning has been issued. */
export const GIT_WARNED_VALUE = '1';

/** Dashboard URL after a clean save. */
export const DASHBOARD_URL = '/';

/** Dashboard URL that carries the degraded-history signal (plan R5). */
export const DEGRADED_URL = '/?degraded=1';

export interface CapturePayload {
  title: string;
  body?: string;
  /** Raw comma-separated tags — F1 normalization happens server-side. */
  tagsText?: string;
  /** `'new'` (default) derives the slug; `'unique'` lets F1 auto-uniquify. */
  mode?: 'new' | 'unique';
}

/** Minimal `sessionStorage`/`Storage` surface used by this module. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Minimal `Response` surface: enough for the status + JSON body. */
export interface ResponseLike {
  status: number;
  json(): Promise<unknown>;
}

/** The `201` body shape from plan Interface Contracts §1. */
export interface CaptureResponseBody {
  slug?: string;
  status?: string;
  git?: { committed: boolean; reason?: string };
  error?: string;
  message?: string;
}

/** Side-effect ports every function in this module writes through. */
export interface CaptureResponsePorts extends NavigatePorts {
  /** `sessionStorage` (the warn-once flag, plan R5). */
  storage: StorageLike;
  /** Writes the inline `#capture-status` message (empty string clears it). */
  setStatus(message: string): void;
  /** Reveals the hidden `#capture-conflict` region for a slug (T021). */
  showConflict?(slug: string): void;
  /** Moves focus to `#save-as-new` (T021). */
  focusSaveAsNew?(): void;
}

export interface CaptureRequestInit {
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** {@link CaptureResponsePorts} plus the injected `fetch` used to POST. */
export interface CaptureSubmitPorts extends CaptureResponsePorts {
  fetch(url: string, init: CaptureRequestInit): Promise<ResponseLike>;
}

/**
 * What the client did with a response.
 *
 * - `saved`      — 201, navigation issued (`url` is where it went)
 * - `invalid`    — 400, inline message, no navigation (FR-013)
 * - `conflict`   — 409, draft kept, conflict state revealed (T021)
 * - `failed`     — 500/other, loud inline error, no navigation
 */
export type CaptureOutcome =
  | { kind: 'saved'; degraded: boolean; url: string }
  | { kind: 'invalid'; error: string }
  | { kind: 'conflict'; slug: string }
  | { kind: 'failed'; error: string };

/**
 * Reject a duplicate submit while a save is already in flight (SC-008/FR-011):
 * exactly one note per capture submission.
 */
export function shouldAcceptSubmit(inFlight: boolean): boolean {
  return !inFlight;
}

/** Inline message for a `400` body — written to `#capture-status`, never navigates. */
export function captureErrorMessage(body: CaptureResponseBody | null): string {
  if (body?.error === 'title-required') return 'A title is required.';
  if (body?.error === 'invalid-payload') return 'The capture could not be read.';
  return body?.message ?? 'The capture could not be saved.';
}

async function readBody(res: ResponseLike): Promise<CaptureResponseBody | null> {
  try {
    const parsed: unknown = await res.json();
    if (parsed !== null && typeof parsed === 'object') return parsed as CaptureResponseBody;
    return null;
  } catch {
    return null;
  }
}

/**
 * Map a `POST /api/capture` response onto the client's side effects
 * (plan Interface Contracts §1 + R5).
 *
 * - `201` committed → `assign('/')`
 * - `201` `git.committed:false` (degraded) → first time in this page session:
 *   set `sessionStorage['dg.gitWarned']='1'` and `assign('/?degraded=1')`;
 *   repeat degraded in the same session → plain `assign('/')` (warn once, FR-010)
 * - `400` → inline title message, NO navigation (FR-013)
 * - `409` → conflict state revealed, focus moved, status left clear, draft kept (T021)
 * - anything else → loud inline error, no navigation
 */
export async function handleCaptureResponse(
  res: ResponseLike,
  ports: CaptureResponsePorts,
): Promise<CaptureOutcome> {
  const body = await readBody(res);

  if (res.status === 201) {
    const degraded = body?.git?.committed === false;
    if (!degraded) {
      ports.assign(DASHBOARD_URL);
      return { kind: 'saved', degraded: false, url: DASHBOARD_URL };
    }
    const alreadyWarned = ports.storage.getItem(GIT_WARNED_KEY) === GIT_WARNED_VALUE;
    if (alreadyWarned) {
      ports.assign(DASHBOARD_URL);
      return { kind: 'saved', degraded: true, url: DASHBOARD_URL };
    }
    ports.storage.setItem(GIT_WARNED_KEY, GIT_WARNED_VALUE);
    ports.assign(DEGRADED_URL);
    return { kind: 'saved', degraded: true, url: DEGRADED_URL };
  }

  if (res.status === 400) {
    ports.setStatus(captureErrorMessage(body));
    return { kind: 'invalid', error: body?.error ?? 'invalid-payload' };
  }

  if (res.status === 409) {
    // Conflict: the typed title/body/tags stay exactly where they are — this
    // branch writes to no field — the conflict region is revealed, focus moves
    // to the content-preserving choice, and `#capture-status` is left clear.
    const slug = body?.slug ?? '';
    ports.showConflict?.(slug);
    ports.focusSaveAsNew?.();
    return { kind: 'conflict', slug };
  }

  ports.setStatus(captureErrorMessage(body));
  return { kind: 'failed', error: body?.error ?? 'save-failed' };
}

/**
 * POST a capture and run the result through {@link handleCaptureResponse}.
 * `mode` defaults to `'new'` so a plain save matches the endpoint contract.
 */
export async function submitCapture(
  payload: CapturePayload,
  ports: CaptureSubmitPorts,
): Promise<CaptureOutcome> {
  const { title, body = '', tagsText = '', mode = 'new' } = payload;
  const res = await ports.fetch('/api/capture', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, body, tagsText, mode }),
  });
  return handleCaptureResponse(res, ports);
}

/* ------------------------------------------------------------------ *
 * T015 — pure warn-once decision (FR-010/SC-006, plan R5)
 * ------------------------------------------------------------------ */

/** `PerformanceNavigationTiming.type` values this decision understands. */
export type NavigationType = 'navigate' | 'reload' | 'back_forward' | (string & {});

export interface GitWarningInput {
  /** Navigation type of the current dashboard load (plan R5). */
  navType: NavigationType;
  /** Whether the dashboard URL carries `?degraded=1`. */
  hasParam: boolean;
  /** Current value of `sessionStorage['dg.gitWarned']` (`'1'` / anything else). */
  warned: boolean;
}

export interface GitWarningDecision {
  /** Show the degraded-history banner on this load. */
  banner: boolean;
  /** Flag value to persist back to `sessionStorage['dg.gitWarned']`. */
  warned: boolean;
}

/**
 * Decide, purely, whether this dashboard load shows the degraded-history
 * banner and what the once-per-session flag becomes (plan R5, FR-010/SC-006).
 *
 * Precedence, pinned by the orchestrator follow-up U2: **`reload` clears the
 * warned flag first** (a reload starts a new page session), *then* the
 * `?degraded=1` + not-yet-warned rule is evaluated against the cleared value.
 *
 * Interaction with T014 worth stating explicitly, because it decides the
 * `hasParam && warned` row: `/new` writes `dg.gitWarned = '1'` *before* it
 * navigates to `/?degraded=1` (plan R5: "sets the flag … and navigates to
 * `/?degraded=1` only if the flag was not already set"), and plan R5 then says
 * "the dashboard shows the banner when `?degraded=1` is present". So on the
 * FIRST delivery the pair the dashboard reads is `(hasParam=true, warned=true)`
 * and the param — not the flag — is the delivery signal: a fresh `navigate`
 * with the param therefore still warns (that is the exactly-once delivery), and
 * the flag's job is to stop `/new` from ever issuing a *second* param
 * navigation in the same session (plan R5, T014's "repeat degraded" branch).
 * A back/forward re-entry into the already-consumed URL is a repeat within the
 * same session, so it is suppressed — that is the "already warned → no second
 * banner" row. With no param the banner never shows, which is how the second
 * degraded capture in a tab stays silent.
 */
export function gitWarningDecision(input: GitWarningInput): GitWarningDecision {
  const { navType, hasParam, warned } = input;
  const cleared = navType === 'reload' ? false : warned;

  if (!hasParam) return { banner: false, warned: cleared };
  if (!cleared) return { banner: true, warned: true };
  // hasParam && already warned: first delivery from /new still warns,
  // a back/forward re-entry does not.
  return { banner: navType !== 'back_forward', warned: true };
}

/* ------------------------------------------------------------------ *
 * T018 — capture-page key commands + Esc decision (US3, FR-006/007)
 * ------------------------------------------------------------------ */

/** The title field's element id — the only field that turns `Enter` into a command. */
export const CAPTURE_TITLE_ID = 'capture-title';

/** The three (and only three) commands `/new` binds; everything else types. */
export type CaptureKeyCommand = 'escape' | 'submit' | 'advance-title';

export interface CaptureKeyInput {
  /** `KeyboardEvent.key`. */
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** `document.activeElement?.id ?? null` — only `#capture-title` matters. */
  activeId?: string | null;
}

/**
 * The `/new` command a key event maps to, or `null` when it is not a command
 * (FR-006/FR-007, plan §1/§5). Exactly three bindings exist:
 *
 * - `Escape`            → `'escape'`        (dashboard, confirm first if text)
 * - `Ctrl/⌘+Enter`      → `'submit'`        (anywhere in the form)
 * - `Enter` in `#capture-title` → `'advance-title'` (focus moves to the body)
 *
 * No printable key ever maps to a command — that is what makes SC-004
 * structural rather than a list to maintain.
 */
export function captureKeyCommand(input: CaptureKeyInput): CaptureKeyCommand | null {
  const { key, ctrl = false, meta = false, alt = false, activeId = null } = input;
  const hasModifier = ctrl || meta || alt;

  if (key === 'Escape') return hasModifier ? null : 'escape';
  if (key === 'Enter') {
    if (ctrl || meta) return 'submit';
    if (alt) return null;
    if (activeId === CAPTURE_TITLE_ID) return 'advance-title';
  }
  return null;
}

/** Predicate form of {@link captureKeyCommand} — `true` only for the three bindings. */
export function isCaptureKeyCommand(input: CaptureKeyInput): boolean {
  return captureKeyCommand(input) !== null;
}

export interface CaptureDraftFields {
  title?: string;
  body?: string;
  tags?: string;
}

export interface EscapePorts {
  /** `window.confirm` — mocked in tests. */
  confirm(message: string): boolean;
  /** `location.assign`. */
  assign(url: string): void;
  /** Refocus `#capture-title` after a cancelled discard. */
  refocusTitle(): void;
}

export type EscapeOutcome = 'navigated' | 'cancelled';

/** Confirm message for a non-empty discard (plan §1, spec Assumption "Esc + discard confirm"). */
export const DISCARD_CONFIRM_MESSAGE = 'Discard this capture?';

/**
 * `Esc` decision (FR-007, US3.3/US3.4): all fields empty → navigate to the
 * dashboard immediately with no prompt; any field holds text → confirm first,
 * `Cancel` refocuses the title so nothing typed is lost, `OK` navigates without
 * saving. Whitespace (and, for tags, stray commas) counts as empty — it would
 * never survive validation anyway (FR-013).
 */
export function handleEscape(fields: CaptureDraftFields, ports: EscapePorts): EscapeOutcome {
  const hasText =
    (fields.title ?? '').trim() !== '' ||
    (fields.body ?? '').trim() !== '' ||
    /[^,\s]/.test(fields.tags ?? '');

  if (!hasText || ports.confirm(DISCARD_CONFIRM_MESSAGE)) {
    ports.assign(DASHBOARD_URL);
    return 'navigated';
  }
  ports.refocusTitle();
  return 'cancelled';
}

/* ------------------------------------------------------------------ *
 * T021 — 409 conflict decision + the two choices (US4, AC4, plan §3)
 * ------------------------------------------------------------------ */

/** Smallest port a navigation-only choice needs. */
export interface NavigatePorts {
  /** `location.assign`. */
  assign(url: string): void;
}

/**
 * The conflict message rendered inside `#capture-conflict` (plan §3).
 */
export function conflictMessage(slug: string): string {
  return `A note already exists at "${slug}"`;
}

/**
 * "Save as new" choice (US4.3, FR-009): re-POST the SAME payload — title, body
 * and tags untouched — with `mode: 'unique'` so F1 auto-uniquifies the slug
 * (`<title>-2`, `<title>-3`, …), then apply the response like any other save
 * (201 → `/`, including the degraded warn-once path).
 */
export async function saveCaptureAsNew(
  payload: CapturePayload,
  ports: CaptureSubmitPorts,
): Promise<CaptureOutcome> {
  return submitCapture({ ...payload, mode: 'unique' }, ports);
}

/**
 * "Open existing" choice (US4.2, FR-008): navigate straight to
 * `/note/<slug>` with no second prompt — the draft is discarded by explicit
 * user choice. The route ships with F8 and may 404; the navigation itself is
 * the F2 acceptance point (clarify Q2).
 */
export function openExisting(slug: string, ports: NavigatePorts): void {
  ports.assign(`/note/${slug}`);
}
