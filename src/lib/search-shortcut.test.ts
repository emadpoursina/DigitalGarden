/**
 * F5 T005 tests — `src/lib/search-shortcut.ts` (plan Interface Contracts §2).
 *
 * The predicate's truth table is the whole safety property of D3/FR-002:
 * a bare `k` must never navigate, a modified one always does. The wiring
 * helper is exercised against an injected target, so no browser is needed.
 */
import { describe, expect, it } from 'vitest';

import {
  SEARCH_PATH,
  shouldOpenSearch,
  wireSearchShortcut,
  type ShortcutKeyEvent,
  type ShortcutTarget,
} from './search-shortcut';

/** Recording `document` stand-in. */
function fakeTarget(): ShortcutTarget & {
  dispatch(event: ShortcutKeyEvent): void;
  listenerCount(): number;
} {
  const listeners: Array<(event: ShortcutKeyEvent) => void> = [];
  return {
    addEventListener: (type, listener) => {
      if (type === 'keydown') listeners.push(listener);
    },
    removeEventListener: (type, listener) => {
      if (type !== 'keydown') return;
      const at = listeners.indexOf(listener);
      if (at >= 0) listeners.splice(at, 1);
    },
    dispatch: (event) => {
      for (const listener of [...listeners]) listener(event);
    },
    listenerCount: () => listeners.length,
  };
}

describe('shouldOpenSearch (D3 / FR-002, modifier-only)', () => {
  it('fires for Ctrl+K and ⌘+K in either case', () => {
    expect(shouldOpenSearch({ key: 'k', ctrl: true })).toBe(true);
    expect(shouldOpenSearch({ key: 'K', ctrl: true })).toBe(true);
    expect(shouldOpenSearch({ key: 'k', meta: true })).toBe(true);
    expect(shouldOpenSearch({ key: 'K', meta: true })).toBe(true);
  });

  it('never fires for a bare key — printable `k`/`K` always type', () => {
    expect(shouldOpenSearch({ key: 'k' })).toBe(false);
    expect(shouldOpenSearch({ key: 'K' })).toBe(false);
    expect(shouldOpenSearch({ key: 'k', ctrl: false, meta: false })).toBe(false);
  });

  it('never fires with Alt or Shift added', () => {
    expect(shouldOpenSearch({ key: 'k', ctrl: true, shift: true })).toBe(false);
    expect(shouldOpenSearch({ key: 'k', ctrl: true, alt: true })).toBe(false);
    expect(shouldOpenSearch({ key: 'k', meta: true, shift: true })).toBe(false);
    expect(shouldOpenSearch({ key: 'k', meta: true, alt: true })).toBe(false);
  });

  it('ignores other keys even with Ctrl held', () => {
    expect(shouldOpenSearch({ key: 'Enter', ctrl: true })).toBe(false);
    expect(shouldOpenSearch({ key: 'c', ctrl: true })).toBe(false);
    expect(shouldOpenSearch({ key: 'k', ctrl: false, meta: false, alt: false, shift: false })).toBe(
      false,
    );
  });

  it('treats omitted modifiers as false (safe defaults)', () => {
    expect(shouldOpenSearch({ key: 'k' })).toBe(false);
    expect(shouldOpenSearch({ key: 'k', ctrl: true })).toBe(true);
  });
});

describe('wireSearchShortcut', () => {
  it('navigates to /search on a matching dispatch and leaves others alone', () => {
    const target = fakeTarget();
    const navigated: string[] = [];
    wireSearchShortcut((url) => void navigated.push(url), target);

    target.dispatch({ key: 'x' });
    target.dispatch({ key: 'k' }); // bare — must not navigate
    target.dispatch({ key: 'k', ctrlKey: true, shiftKey: true });
    expect(navigated).toEqual([]);

    target.dispatch({ key: 'k', ctrlKey: true });
    expect(navigated).toEqual([SEARCH_PATH]);

    target.dispatch({ key: 'K', metaKey: true });
    expect(navigated).toEqual([SEARCH_PATH, SEARCH_PATH]);
  });

  it('suppresses the browser default only on a match', () => {
    const target = fakeTarget();
    let prevented = 0;
    wireSearchShortcut(() => {}, target);

    target.dispatch({ key: 'k' });
    expect(prevented).toBe(0);

    target.dispatch({
      key: 'k',
      ctrlKey: true,
      preventDefault: () => {
        prevented += 1;
      },
    });
    expect(prevented).toBe(1);
  });

  it('registers exactly one listener and the unwire function stops delivery', () => {
    const target = fakeTarget();
    const navigated: string[] = [];
    const unwire = wireSearchShortcut((url) => void navigated.push(url), target);

    expect(target.listenerCount()).toBe(1);

    unwire();
    expect(target.listenerCount()).toBe(0);

    target.dispatch({ key: 'k', ctrlKey: true });
    expect(navigated).toEqual([]);
  });

  it('is a no-op (not a throw) when there is no document — SSR/plan-node safe', () => {
    const navigated: string[] = [];
    const unwire = wireSearchShortcut((url) => void navigated.push(url));
    expect(typeof unwire).toBe('function');
    expect(() => unwire()).not.toThrow();
    expect(navigated).toEqual([]);
  });

  it('prefers an explicitly injected target over the global document', () => {
    const target = fakeTarget();
    const navigated: string[] = [];
    wireSearchShortcut((url) => void navigated.push(url), target);
    expect(target.listenerCount()).toBe(1);
  });
});
