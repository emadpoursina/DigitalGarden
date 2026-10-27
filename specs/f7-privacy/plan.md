# Implementation Plan: F7 Privacy Model

**Branch**: `digitalgarden/t_5a89c68c-f7-privacy-model` (spec card t_4383472c, parent t_5a89c68c) | **Date**: 2026-10-26 | **Spec**: [specs/f7-privacy/spec.md](./spec.md)

**Input**: Feature specification `specs/f7-privacy/spec.md` (clarified 2026-10-26, 5/5 headless questions resolved) + locked orchestrator decisions D1–D8 (parent card t_5a89c68c).

**Step**: `/speckit.plan` (Phase 5/6). Deliverable is this plan — implementation and task breakdown land in `tasks.md`; no code in this step.

> **Artifact consolidation**: the card fixes the F7 artifact set at `specs/f7-privacy/{spec,plan,tasks}.md` (F4–F6 parity), so the template's separate `research.md`, `data-model.md`, `contracts/`, and `quickstart.md` outputs are consolidated into this single file: "Research (Phase 0)" below, "Data Model" and "Interface Contracts" (Phase 1), "Validation & Quickstart" (Phase 1).
> **Extension hooks**: `.specify/extensions.yml` does not exist → `before_plan` / `after_plan` hook stages skipped silently (both pre-check and mandatory post-check performed).

---

## Summary

F7 is a formalization + runtime-proof pass, not a feature build: the v1 privacy behavior already ships (three private-by-default creation paths + enum validation + loopback config) and is regression-locked in `src/lib/privacy.test.ts` (8 its @bc6af28). The spec traces every AC1 path to an exact file:line and every AC2 config guard to a locked test; its single gap finding (F6) is the missing *runtime* loopback proof, which this plan dispositions as measured one-off evidence (scripted live probe, recorded — never a committed socket test). AC3/AC4 are v1.1/F10 out of scope with zero work. The build is therefore verify-only unless its re-measurement contradicts this plan's: re-run the gate, re-run the loopback probe, record both, converge with no hunks.

Eight facts verified against THIS checkout today drive the design, none assumed:

1. **`NOTE_VISIBILITIES` is exactly `['private','public']`** (`notes.ts:66`). All three write/read paths match against this one enum — no second list, no alias.
2. **All three AC1 defaults are single-site and traced.** `parseNoteFile` `fields.get('visibility') ?? 'private'` + `.trim()` (`notes.ts:455`); `createNote` `input.visibility ?? 'private'` (`notes.ts:642`); `saveCapture` literal `visibility: 'private'` (`capture.ts:172`) shared by both modes (`:167–176`). Invalid values throw value-naming `NoteValidationError` at `:456–460`, `:643–644`, `:680–682`.
3. **The guard suite is adopted, not duplicated.** `privacy.test.ts` (222 lines, 8 its): block a loopback config ×2, block b parser-default ×2, block c validation ×4; header documents the (a)/(b)/(c)/(d) split with the two cross-refs (notes.test.ts:101 filename-default case, capture.test.ts:200-describe mode:'new' pin).
4. **Config surface is minimal and clean.** `astro.config.mjs` 13 lines, no `server` key at all; `package.json` scripts `dev/build/preview/test` with zero `--host` (re-probed this session; block a passes inside the 274).
5. **Runtime proof was missing and is now measured (runs 72–73).** `npm run preview -- --port 4323`: log `Server listening on http://localhost:4323`; `curl http://localhost:4323/` → 200; loopback-only LISTEN on port `10E3` hex (= 4323 — run-72 draft wrote `ACDF`, arithmetically wrong, superseded): run 73 measured `::1:10E3` (`...01000000:10E3`, state `0A`) in `/proc/net/tcp6`, no wildcard row in either table; listener gone after stop. No committed socket test added — deliberate (R4).
6. **No publishing surface exists.** No publish route/page, no sitemap/RSS visibility filter, no redaction helper — AC3/AC4 out-of-scope marking is documentation-only (R5).
7. **The gate baseline is fully green.** `npm install` exit 0 (audit noise only), `TMPDIR=/tmp npm run test` 14 files / 274 passed (F6 gate 266 + 8 privacy, zero pre-existing failures on this branch), `npm run build` exit 0 (server built 1.46 s). Measured 2026-10-26.
8. **FUSE host quirk is real.** Default TMPDIR breaks the suite on this mount; every suite run in this chain used `TMPDIR=/tmp` (D7 pins it).

## Technical Context

**Language/Version**: TypeScript on Node.js ≥ 20 (repo runs Node 26.x); `astro check` not wired — `npm run build` catches syntax/import errors, types are advisory (F2–F6 precedent; `npx tsc --noEmit` stays available as a voluntary gate).

**Primary Dependencies**: `astro ^7.3.8`, `@astrojs/node ^11.1.8`, `markdown-it ^15.0.2` (untouched), `simple-git ^4.0.2` (untouched — F7 never commits), `minisearch ^7.2.0` (untouched — F7 does not search), `vitest ^5`, `@playwright/test ^1.64.1` (verification only, no config/spec files added). **Added by this plan: nothing** — zero runtime and zero dev-dependency changes (locked into tasks' Done-when).

**Storage**: plain Markdown + YAML frontmatter via F1 `src/lib/notes.ts` — F7 writes no new persisted state, no schema migration, no new vault files. The `visibility` key already serializes (`serializeNote`, notes.ts:506).

**Testing**: `npm run test` → `vitest run` (node env, `*.test.ts` only); `npm run build` → `astro build`. Runtime-only facts are covered by one-off scripted checks against `astro preview` on a probe port from the scratch dir — no `*.spec.ts`, no `playwright.config.ts`, therefore no vitest include-collision (F2–F6 R8 lesson kept).

**Target Platform**: local-first web app, loopback only (`astro dev`/`astro preview` default to localhost; never `server.host: true`, never `--host`).

**Performance Goals**: no new surfaces, so no new timing budget; the gate suite should stay within its measured ~6.4 s vitest duration; the loopback probe adds < 30 s wall time (boot + curl + socket read + kill).

**Constraints**: offline / zero non-loopback access (FR-005/FR-006); zero data loss — F7 writes no vault files, mutates no notes (SC-004); no git commits from F7 work (card bans); `npm install` + `TMPDIR=/tmp npm run test` + `npm run build` must stay green (FR-008); `notes.ts`(+test), `capture.ts`(+test), `astro.config.mjs`, `package.json`/lockfile, `project.yaml`, all other tests, all routes/pages are READ-ONLY (D6).

**Scale/Scope**: single-user, ≤ 5,000 notes (PRD §8); no new read path, so no scaling analysis needed (nothing per-request added).

**No NEEDS CLARIFICATION items remain** — all 5 spec clarifications are resolved in `spec.md`; the implementation-level questions they deferred (probe form, override semantics, whitespace/case, capture-mode coverage, AC3/AC4 marking) are decided in this plan's Research section.

## Constitution Check

*GATE: `.specify/memory/constitution.md` is still the unfilled `[PROJECT_NAME]` template — it defines **no gates**, so no constitution gate can pass or fail (same finding as F2's/F3's/F4's/F5's/F6's plans; re-checked this session). Complexity Tracking is therefore empty of violations (see bottom).*

In place of constitution gates, the plan is checked against the binding PRD §8 non-functional requirements:

| PRD §8 requirement | How this plan satisfies it | Re-check after design |
|---|---|---|
| Loopback only | No config change; runtime property re-measured live by T021 (200 + 127.0.0.1-only socket) | ✓ |
| Data loss: zero tolerance | F7 writes nothing to the vault; no save path touched; build is verify-only (SC-004) | ✓ |
| Vault format: plain Markdown + YAML | Unchanged — F1 serialization only; F7 adds no frontmatter keys | ✓ |
| Offline / no network service | No outbound calls anywhere in the F7 path; probe uses localhost only | ✓ |
| Accessibility | No UI surface added or changed — nothing to label | ✓ |
| Scalability: 5,000 notes | No new read path; suite duration is the only load signal (~6.4 s) | ✓ |

## Project Structure

### Documentation (this feature)

```text
specs/f7-privacy/
├── spec.md                   # clarified spec (input, unchanged by this step)
├── plan.md                   # THIS FILE (/speckit.plan output; research/data-model/contracts/quickstart consolidated)
├── checklists/requirements.md # 12/12 (specify/clarify steps; untouched here)
└── tasks.md                  # Phase 2 output (/speckit.tasks — NOT created by this step)
```

### Source Code (repository root) — proposed end state

```text
src/
├── lib/
│   ├── notes.ts                # UNCHANGED — ZERO hunks (D2/D6: defaults + validation verify-only)
│   ├── notes.test.ts           # UNCHANGED — ZERO hunks (cross-ref only)
│   ├── capture.ts              # UNCHANGED — ZERO hunks (D2: pin verify-only)
│   ├── capture.test.ts         # UNCHANGED — ZERO hunks (cross-ref only)
│   └── privacy.test.ts         # UNCHANGED unless the spec names a gap (it names none —
│                               #   F6 dispositions to measured evidence, not a new test)
├── pages/                      # UNCHANGED — no route added, none touched
astro.config.mjs                # UNCHANGED — no server key today, none added
package.json / lockfile         # UNCHANGED — no new deps
.ainative/project.yaml          # UNCHANGED — validation_commands already install → test → build
```

Expected `git diff --stat` at converge: `specs/f7-privacy/*` ONLY (SC-004). Any other hunk is a scope violation.

---

## Research (Phase 0)

No NEEDS CLARIFICATION remained after specify/clarify; the five headless questions are closed in spec.md. The research below records the decisions and their evidence so the build can re-measure rather than re-decide.

### R1 — AC1 path trace (all three defaults + three rejection sites)

- `parseNoteFile`: `(fields.get('visibility') ?? 'private').trim()` (notes.ts:455); reject `:456–460` with `Invalid visibility "<v>"`.
- `createNote`: `input.visibility ?? 'private'` (notes.ts:642); reject `:643–644`.
- `saveNote` (write path): enum check `:680–682` (no default — note objects always carry visibility by then).
- `saveCapture`: literal `visibility: 'private'` (capture.ts:172) inside a single `createInput` (`:167–176`) shared by `mode:'new'` (adds slug `:175`) and `mode:'unique'`.
- Enum: `NOTE_VISIBILITIES = ['private','public']` (notes.ts:66). Trim-then-match, case-sensitive (no fold anywhere on this path — probed).
- Locked coverage: createNote default in notes.test.ts:101-area ("writes a UTF-8 Markdown file with full frontmatter and defaults" asserts `visibility === 'private'` + re-parse); saveCapture pin in capture.test.ts:200-describe; parser default + all four validation cases in privacy.test.ts blocks b/c.

### R2 — AC2 config-guard mechanics (what block a actually asserts)

- `astro.config.mjs` dynamic import → `config.server?.host` must be falsy (`undefined` today — no `server` key). `true` or any non-empty string fails with a message naming F7 AC2.
- `package.json` scripts scanned with `/--host/` over values; any hit fails naming `"script": "cmd"` pairs. Scripts today: `astro dev`, `astro build`, `astro preview`, `vitest run` — zero hits.
- Both cases green inside the measured 274 run.

### R3 — rejected alternative: committed runtime socket test

Considered adding a vitest that boots the server and asserts loopback binding. Rejected: (a) D1 zero-duplication + D6 file boundaries forbid new test files unless the spec names a gap needing one — the spec names F6 and dispositions it to measured evidence; (b) listener tests are flaky under CI/root sandboxes and would own server-lifecycle code the repo deliberately avoids; (c) F6 precedent (malformed-`%` upstream boundary, loopback sweep) already established scripted one-off checks with recorded output as sufficient evidence for runtime-only facts. The build re-measures instead (T021).

### R4 — the runtime loopback measurement (this session, reproducible)

```sh
# from the worktree, scratch log outside the repo:
npm run preview -- --port 4323 > /tmp/f7-preview.log 2>&1 &
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4323/   # → 200
grep -i "10E3" /proc/net/tcp /proc/net/tcp6
# → LISTEN row (state 0A) ONLY on loopback:
#     00000000000000000000000001000000:10E3 (::1:4323 — port 4323 = 0x10E3)
#     and/or 0B00007F:10E3 (127.0.0.1:4323) in /proc/net/tcp
# → NO wildcard row (00000000:10E3 in tcp, all-zero:10E3 in tcp6)
kill <server-pid>; grep -i ":10E3" /proc/net/tcp /proc/net/tcp6 || echo "listener gone"
```

Log line observed: `[@astrojs/node] Server listening on http://localhost:4323`. Build task T021 repeats this verbatim on the same port (or a free one it records) and pastes the three evidence lines.

### R5 — AC3/AC4 absence proof (nothing to guard)

Probed `src/pages/` (api, index, new, note, search, status, tags — no publish), no `sitemap`/`rss`/redact helper anywhere under `src/`. Out-of-scope marking is therefore pure documentation (spec "Out of Scope" + FR-007 + zero tasks). If a future tree gains a publishing surface, that future spec owns its guards.

### R6 — gate baseline (measured 2026-10-26, @bc6af28)

`npm install` exit 0 (audit noise only) → `TMPDIR=/tmp npm run test` 14 files / 274 passed / 6.40 s → `npm run build` exit 0 (server built 1.46 s). 274 = F6 gate 266 (incl. 1 pre-existing root-env artifact documented in the F6 chain) + 8 privacy. On THIS branch the artifact is gone: 274/274 fully green. Build expectation: 274+ (never fewer), same order, `TMPDIR=/tmp` mandatory (FUSE host).

### R7 — verification posture (F6 R8 kept)

Browser/runtime-only facts are proved by one-off scripted checks run from the scratch dir (`/tmp`, never repo files): the preview probe (R4) plus the gate. No `*.spec.ts`, no `playwright.config.ts`, no repo files from scripts. `host` Chromium path not needed (curl + /proc/net/tcp suffice).

## Data Model

No new persisted entities. The only domain values are the existing `NoteVisibility = 'private' | 'public'` (notes.ts:66–67) carried on `Note.visibility` (notes.ts:91) and optional on `CreateInput.visibility` (notes.ts:121). Frontmatter key `visibility` (notes.ts:75, 468, 506). No migration, no new vault file, no schema change.

## Interface Contracts

### C1 — creation defaults (verify-only, zero hunks)

| Caller | Call | Result |
|---|---|---|
| any | `createNote(v, {title})` (no visibility) | `note.visibility === 'private'`, disk `visibility: private` |
| any | `createNote(v, {title, visibility:'public'})` | `'public'` honored |
| any | `createNote(v, {title, visibility:'secret'})` | throws `NoteValidationError: Invalid visibility "secret"` |
| capture | `saveCapture(vault, {mode:'new'\|'unique', ...})` | note pinned `'private'` |
| reader | `parseNoteFile(raw without visibility:)` | `'private'` |
| reader | `parseNoteFile(raw with visibility: <bad>)` | throws `NoteValidationError` naming the value |

### C2 — AC2 guards (verify-only + measured)

Config: block a 2/2 green. Runtime: R4 measurement (200 + 127.0.0.1-only + clean stop). Build re-measures (T021).

### C3 — out-of-scope boundary (prohibition)

No publish route, no sitemap/RSS filter, no redaction helper may be added. `git diff --stat` at converge must show no `src/` hunks at all (SC-004) unless a task explicitly names a gap file — no task does (spec names none).

## File-by-File (proposed — build executes)

- `specs/f7-privacy/spec.md` — DONE (this chain).
- `specs/f7-privacy/plan.md` — THIS FILE.
- `specs/f7-privacy/tasks.md` — next step (`/speckit.tasks`).
- `specs/f7-privacy/checklists/requirements.md` — next step (checklist pass).
- Everything else — READ-ONLY. In particular: `src/lib/privacy.test.ts` stays exactly 8 its (D1); `notes.ts`, `capture.ts`, `astro.config.mjs`, `package.json`/lockfile, `project.yaml`, all routes/pages stay byte-identical.

## AC Matrix (auto + live evidence per AC)

| AC | Auto evidence (vitest, committed) | Live evidence (measured, recorded) |
|---|---|---|
| AC1 default-private | notes.test.ts filename-default case + capture.test.ts mode:'new' pin + privacy block b ×2 (all in the 274) | — (pure unit property) |
| AC1 reject-invalid | privacy block c ×4 (in the 274) | — |
| AC2 loopback config | privacy block a ×2 (in the 274) | — |
| AC2 runtime | — (deliberately uncommitted, R3) | R4 this session + T021 build re-measurement |
| AC3/AC4 | explicitly NOT tested (header states v1.1/F10) | absence probed (R5); zero tasks |

## Validation & Quickstart

```sh
# 1. Gate in order (D7; TMPDIR=/tmp is mandatory on this FUSE host):
npm install && TMPDIR=/tmp npm run test && npm run build
# expect: install exit 0; test 14 files / 274+ passed; build exit 0.
# 2. Runtime loopback re-measurement (T021, R4 recipe on port 4323 or a recorded free port):
npm run preview -- --port 4323 & sleep; curl localhost:4323 → 200;
grep 10E3 /proc/net/tcp6 → 00000000000000000000000001000000:10E3 state 0A LISTEN only, no wildcard row in either table; stop by PID (never pkill -f); confirm gone.
# 3. Zero-hunk proofs: git diff --stat shows specs/f7-privacy/* only;
git diff src/ empty; no publish surface appears (ls src/pages).
```

## Risks

- **Stale-expectation risk**: if the build's gate shows other than 274+ (new failures), the build owns diagnosis — this plan's baseline is today's measurement, not a promise.
- **Port-collision risk on T021**: if 4323 is taken, the build picks a free port, records it, and converts hex the same way (`python3 -c` free-or-not; hex is just the port in base 16 — record both).
- **Root-env artifact risk**: F6's chain saw 1 pre-existing failure running as root (unwritable-vault case); this branch measures 274/274 green, but a re-appearing env artifact must be recorded, never "fixed" by touching tests.
- **Scope-creep risk**: any hunk outside `specs/f7-privacy/` is a violation unless a spec-named gap file exists — none does. Critic parks scope-creeping builds.
- **`index`-shadow / codec / archived precedents**: F6's recorded limitations ride along untouched; F7 adds no routes so none apply.

## Complexity Tracking

Empty — no constitution gates exist (unfilled template) and the design adds no new abstractions, files, or dependencies. Verify-only plan; the only "new" artifact is measured evidence recorded in tasks/T021 output.
