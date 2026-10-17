/**
 * F2 T003 tests — vault path resolution contract (plan R6, §2).
 *
 * Three required behaviours: non-empty `GARDEN_VAULT_DIR` wins, default is
 * `<cwd>/vault`, and an empty/whitespace override falls back to the default.
 * Plus the orchestrator's follow-up (analyze U3): `resolveVaultDir()` must
 * read `process.env` on EVERY call — no module-level memoisation — because
 * T011 sets `GARDEN_VAULT_DIR` per test.
 *
 * Nothing here touches the repository's own `vault/`: the override values
 * are plain paths that are never created or written.
 */
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveVaultDir, VAULT_DIR_ENV } from './vault';

const ORIGINAL_OVERRIDE = process.env[VAULT_DIR_ENV];

beforeEach(() => {
  delete process.env[VAULT_DIR_ENV];
});

afterEach(() => {
  if (ORIGINAL_OVERRIDE === undefined) delete process.env[VAULT_DIR_ENV];
  else process.env[VAULT_DIR_ENV] = ORIGINAL_OVERRIDE;
});

describe('resolveVaultDir', () => {
  it('uses a non-empty GARDEN_VAULT_DIR override', () => {
    const override = join('/tmp', 'garden-override-vault');
    process.env[VAULT_DIR_ENV] = override;

    expect(resolveVaultDir()).toBe(override);
  });

  it('defaults to <cwd>/vault when the override is unset', () => {
    expect(resolveVaultDir()).toBe(join(process.cwd(), 'vault'));
  });

  it('falls back to the default for an empty override', () => {
    process.env[VAULT_DIR_ENV] = '';

    expect(resolveVaultDir()).toBe(join(process.cwd(), 'vault'));
  });

  it('falls back to the default for a whitespace-only override', () => {
    process.env[VAULT_DIR_ENV] = ' \t  ';

    expect(resolveVaultDir()).toBe(join(process.cwd(), 'vault'));
  });

  it('reads process.env on every call (no module-level memoisation)', () => {
    const first = join('/tmp', 'garden-vault-a');
    const second = join('/tmp', 'garden-vault-b');

    process.env[VAULT_DIR_ENV] = first;
    expect(resolveVaultDir()).toBe(first);

    process.env[VAULT_DIR_ENV] = second;
    expect(resolveVaultDir()).toBe(second);

    delete process.env[VAULT_DIR_ENV];
    expect(resolveVaultDir()).toBe(join(process.cwd(), 'vault'));
  });
});
