/**
 * theme.ts — DOM-free theme logic (FR-010).
 *
 * Pure functions only; no localStorage / document access here so this module
 * is safe to import in Node (vitest) environments.
 */

/** The only two explicit theme choices a user can make. */
export type ThemeChoice = 'light' | 'dark';

/** localStorage key used by Base.astro wiring and readable by any page script. */
export const THEME_STORAGE_KEY = 'dg-theme' as const;

/**
 * Resolve the active theme from a stored value and the OS preference.
 *
 * - If `stored` is exactly `'light'` or `'dark'` it wins unconditionally.
 * - Otherwise the OS `prefers-color-scheme: dark` signal decides.
 */
export function resolveTheme(
  stored: string | null | undefined,
  prefersDark: boolean,
): ThemeChoice {
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersDark ? 'dark' : 'light';
}

/**
 * Toggle between the two theme choices.
 *
 * `'light'` → `'dark'`; `'dark'` → `'light'`.
 */
export function toggleTheme(current: ThemeChoice): ThemeChoice {
  return current === 'dark' ? 'light' : 'dark';
}
