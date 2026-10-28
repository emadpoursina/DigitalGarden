/**
 * theme.test.ts — unit tests for FR-010 theme logic (src/lib/theme.ts).
 *
 * All functions are DOM-free pure functions; no mocking required.
 * Style: describe/it with plain vitest imports, matching sibling test files.
 */
import { describe, expect, it } from 'vitest';

import { THEME_STORAGE_KEY, resolveTheme, toggleTheme } from './theme';

describe('resolveTheme', () => {
  it('stored "light" wins even when OS prefers dark', () => {
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('stored "dark" wins even when OS prefers light', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('null stored falls back to OS dark preference', () => {
    expect(resolveTheme(null, true)).toBe('dark');
  });

  it('null stored falls back to OS light preference', () => {
    expect(resolveTheme(null, false)).toBe('light');
  });

  it('undefined stored falls back to OS preference (dark)', () => {
    expect(resolveTheme(undefined, true)).toBe('dark');
  });

  it('garbage stored string falls back to OS preference (light)', () => {
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('empty string stored falls back to OS preference (dark)', () => {
    expect(resolveTheme('', true)).toBe('dark');
  });

  it('case-variant stored string is not recognised — falls back to OS', () => {
    expect(resolveTheme('Dark', false)).toBe('light');
    expect(resolveTheme('LIGHT', true)).toBe('dark');
  });
});

describe('toggleTheme', () => {
  it('flips light to dark', () => {
    expect(toggleTheme('light')).toBe('dark');
  });

  it('flips dark to light', () => {
    expect(toggleTheme('dark')).toBe('light');
  });

  it('is its own inverse — two toggles return to start (light)', () => {
    expect(toggleTheme(toggleTheme('light'))).toBe('light');
  });

  it('is its own inverse — two toggles return to start (dark)', () => {
    expect(toggleTheme(toggleTheme('dark'))).toBe('dark');
  });
});

describe('THEME_STORAGE_KEY', () => {
  it('is the documented constant string', () => {
    expect(THEME_STORAGE_KEY).toBe('dg-theme');
  });
});
