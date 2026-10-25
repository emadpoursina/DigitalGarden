/**
 * F5 T005 — the Ctrl/⌘-K entry shortcut (spec FR-001/FR-002; plan Research
 * R3 + Interface Contracts §2; locked decisions D3/D8).
 *
 * Deliberately the OPPOSITE discipline from F2's bare-`c` predicate: this
 * fires only with Ctrl or ⌘ held, and therefore carries NO field/editable
 * guard — a *modified* keystroke never types a character, so Ctrl-K inside a
 * textarea is safe to command with (PRD §10's modifier-only rule).
 *
 * `shouldOpenSearch` is the pure decision; `wireSearchShortcut` is the tiny
 * wiring helper each page's own `<script>` calls so `Base.astro` stays
 * untouched (D8/Q2). Both are DOM-free-testable: the listener target is
 * injected, the navigation is injected, and the returned function unwires.
 */

/** The subset of a `KeyboardEvent` the predicate needs. */
export interface SearchShortcutInput {
  /** `KeyboardEvent.key`. */
  key: string;
  /** `KeyboardEvent.ctrlKey`. */
  ctrl?: boolean;
  /** `KeyboardEvent.metaKey` (⌘). */
  meta?: boolean;
  /** `KeyboardEvent.altKey`. */
  alt?: boolean;
  /** `KeyboardEvent.shiftKey` — Ctrl+Shift+K is the browser's own chord. */
  shift?: boolean;
}

/**
 * Should this key event open `/search`? (D3/FR-002)
 *
 * True ONLY for `k`/`K` with Ctrl or ⌘ held and neither Alt nor Shift — so a
 * bare `k` typed anywhere (capture title, note editor, search input) types
 * the letter and never navigates.
 */
export function shouldOpenSearch(input: SearchShortcutInput): boolean {
  const { key, ctrl = false, meta = false, alt = false, shift = false } = input;

  if (key !== 'k' && key !== 'K') return false;
  if (!ctrl && !meta) return false;
  if (alt || shift) return false;
  return true;
}

/** Minimal `KeyboardEvent` shape the wiring helper reads. */
export interface ShortcutKeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  preventDefault?(): void;
}

/** Minimal `document`-shaped target so the helper is testable without a DOM. */
export interface ShortcutTarget {
  addEventListener(type: string, listener: (event: ShortcutKeyEvent) => void): void;
  removeEventListener(type: string, listener: (event: ShortcutKeyEvent) => void): void;
}

/** The page's URL for search. */
export const SEARCH_PATH = '/search';

/**
 * Register the document-level keydown listener and return an unwire function
 * (the test seam). `target` defaults to `globalThis.document`; pages call it
 * with just `navigate`, tests inject a fake target.
 *
 * Returns a no-op unwire when there is no document (SSR / plain-node test),
 * so wiring can never throw during page setup.
 *
 * Wiring example (each page's own `<script>` — never `Base.astro`):
 * ```ts
 * wireSearchShortcut((url) => location.assign(url));
 * ```
 */
export function wireSearchShortcut(
  navigate: (url: string) => void,
  target?: ShortcutTarget | null,
): () => void {
  const host =
    target ?? (globalThis as { document?: ShortcutTarget }).document ?? null;
  if (!host) return () => {};

  const listener = (event: ShortcutKeyEvent): void => {
    const matched = shouldOpenSearch({
      key: event.key,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      alt: event.altKey,
      shift: event.shiftKey,
    });
    if (!matched) return;

    // Our own pages only: stop the browser's Ctrl/⌘-K default from racing
    // the navigation (spec edge case — outside these pages we bind nothing).
    event.preventDefault?.();
    navigate(SEARCH_PATH);
  };

  host.addEventListener('keydown', listener);
  return () => host.removeEventListener('keydown', listener);
}
