/**
 * F2 vault path contract — plan R6 and Interface Contracts §2.
 *
 * This module is the ONLY place in the app that decides where the vault
 * lives: a non-empty `GARDEN_VAULT_DIR` environment variable wins,
 * otherwise `<cwd>/vault`. Every caller (dashboard, `/api/capture`,
 * tests) imports `resolveVaultDir()` from here instead of re-deriving
 * the path.
 *
 * `process.cwd()` is the project root for `astro dev` / `astro build` /
 * `astro preview` and for `node dist/server/entry.mjs` started from the
 * repo root (documented prerequisite), which is what makes the default
 * `<cwd>/vault` stable. The env override is what keeps tests and smoke
 * runs hermetic (temp vault, temp git repo) — never point it at the
 * repository's own `vault/` during verification.
 *
 * Note: the override is used verbatim when non-empty (leading/trailing
 * whitespace alone counts as empty and falls back to the default).
 */
import { join } from 'node:path';

/** Env var that overrides the vault directory when non-empty. */
export const VAULT_DIR_ENV = 'GARDEN_VAULT_DIR';

/** Default vault directory name, relative to the process working directory. */
export const DEFAULT_VAULT_DIR_NAME = 'vault';

/**
 * Resolve the vault directory for the current process.
 *
 * @returns `process.env.GARDEN_VAULT_DIR` when it holds a non-blank
 * value, otherwise `join(process.cwd(), 'vault')`.
 */
export function resolveVaultDir(): string {
  const override = process.env[VAULT_DIR_ENV];
  if (override !== undefined && override.trim() !== '') return override;
  return join(process.cwd(), DEFAULT_VAULT_DIR_NAME);
}
