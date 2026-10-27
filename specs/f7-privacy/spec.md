# Feature Specification: F7 Privacy Model

**Feature Branch**: `digitalgarden/t_5a89c68c-f7-privacy-model` (spec card t_4383472c, parent t_5a89c68c)

**Created**: 2026-10-26

**Status**: Draft

**Input**: Parent card t_5a89c68c — F7 Privacy Model, grounded in PRD §7 F7 AC1–AC4 (PRD.md:203–212), §4 Journey 1 (capture defaults seed + private, step 3), §8 NFRs (loopback only, zero data loss), and the on-disk v1 surface (`src/lib/notes.ts` parse/create/validate, `src/lib/capture.ts` saveCapture pin, `src/lib/privacy.test.ts` 8-its guard suite @bc6af28, `astro.config.mjs` 13 lines, `package.json` scripts, `.ainative/project.yaml` gate).

**Provenance note**: All code facts below were re-verified by fresh probes against THIS checkout (branch `digitalgarden/t_5a89c68c-f7-privacy-model` @ bc6af28) on 2026-10-26, never carried over. F4/F5/F6 specs (`specs/f4-note-lifecycle`, `specs/f5-full-text-search`, `specs/f6-tags-browsing`) are shape references only.

Locked orchestrator decisions D1–D8 (on the spec card) are recorded in "Locked Constraints" at the end of this document and are NOT open questions.

## Clarifications

### Session 2026-10-26

Headless clarify run (spec card t_4383472c, single-session chain): 5 questions raised, each resolved by selecting the recommended option grounded in locked decisions D1–D8 and fresh probes of this checkout; choice + rationale recorded here and applied to the relevant sections. D1–D8 were not re-opened.

- **Q: What form does the AC2 runtime loopback proof take — committed probe or measured one-off evidence?** → **A: Measured one-off evidence (scripted live probe, recorded in spec/plan/tasks), NOT a committed socket test.** Rationale: config guards are already committed (privacy.test.ts block a); a committed listener test would be flaky in CI/root environments and would own server-lifecycle code the repo deliberately avoids (D5/D6). F6 precedent covers browser/runtime-only facts with scripted checks and no repo files. (Applies to FR-006, US2 scenarios 2–3, SC-003.)
- **Q: Does AC1's "unless the user explicitly overrides it" allow `visibility: 'public'` at creation?** → **A: Yes — explicit `'public'` is accepted; only omission defaults and only non-enum values are rejected.** Rationale: `createNote` accepts exactly `NOTE_VISIBILITIES = ['private','public']` (notes.ts:66,642–645); privacy.test.ts block c locks `private` + `public` accepted, `'secret'`/`'draft'` rejected. (Applies to FR-001/FR-004, US1 scenarios 1–2.)
- **Q: How is surrounding whitespace / case on the visibility value handled?** → **A: Value is trimmed, then enum-matched case-sensitively; `' private '` → `'private'`, `'Private'` → rejected.** Rationale: `parseNoteFile` does `(fields.get('visibility') ?? 'private').trim()` (notes.ts:455) then enum match (notes.ts:456); no case-folding exists anywhere on this path — verified by probe. (Applies to FR-003/FR-004, Edge Cases.)
- **Q: Where do saveCapture callers stand — is mode:'new' the only capture path that pins private?** → **A: Yes — `saveCapture` mode:'new' pins `visibility: 'private'` (capture.ts:172); mode:'unique' flows through the same `createInput` with identical pin.** Rationale: single `createInput` literal serves both modes (capture.ts:167–176, probed); capture.test.ts locks the mode:'new' case, no second pin site exists. (Applies to FR-002, US1 scenario 3.)
- **Q: How are AC3/AC4 (v1.1/F10 publishing) marked so no build work can leak onto them?** → **A: Explicit OUT-OF-SCOPE section + FR-007 prohibition + zero tasks/code/tests.** Rationale: D4 binding; publishing does not exist in v1 (no publish route, no sitemap/RSS filter on disk) — the spec states the boundary in words and the task list contains no AC3/AC4 line. (Applies to FR-007, US3, SC-004.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - New notes are private unless I say otherwise (Priority: P1)

The Gardener captures or creates a note and it lands `private` without asking — quick-capture (mode:'new' and mode:'unique'), programmatic `createNote` without a visibility argument, and hand-authored files that omit the `visibility:` frontmatter line all resolve to `'private'`. Passing `visibility: 'public'` explicitly is honored. Passing anything outside the enum (`'secret'`, `'draft'`, `'Private'`) is rejected with `NoteValidationError`, never silently coerced.

**Why this priority**: AC1 is the whole privacy promise — a single silent default to public would be a data leak. Every creation path must be traced, not just one.

**Independent Test**: create notes via all three paths omitting visibility and assert `'private'`; re-run with explicit `'public'` and assert honored; feed each invalid value and assert `NoteValidationError` naming the value.

**Acceptance Scenarios**:

1. **Given** `createNote` called without `visibility`, **When** the note is written, **Then** `note.visibility === 'private'` and the on-disk frontmatter reads `visibility: private` (cross-ref notes.test.ts "writes a UTF-8 Markdown file with full frontmatter and defaults").
2. **Given** `createNote` called with `visibility: 'public'`, **When** the note is written, **Then** it stays `'public'` (explicit override honored — privacy.test.ts block c).
3. **Given** `saveCapture` with mode:'new' (and mode:'unique'), **When** the capture is saved, **Then** the note is pinned `visibility: 'private'` regardless of caller input (cross-ref capture.test.ts "writes the note verbatim with pinned status/visibility, then commits").
4. **Given** a hand-authored file omitting the `visibility:` line, **When** `parseNoteFile` reads it, **Then** the result is `'private'` (privacy.test.ts block b, two cases).
5. **Given** any invalid visibility (`'secret'`, `'draft'`, `'Private'`), **When** `parseNoteFile` or `createNote` receives it, **Then** a `NoteValidationError` naming the value is thrown (privacy.test.ts block c, four cases).

---

### User Story 2 - The garden never leaves localhost (Priority: P1)

The Gardener runs `astro dev` / `astro preview` / the built node server and the app answers only on the loopback interface. No config sets `server.host`, no npm script passes `--host`, and a live measurement while the server runs shows no non-loopback listener for the app port.

**Why this priority**: AC2 is the network half of the privacy promise — config guards prevent regression, the runtime measurement proves the property where it matters (the socket).

**Independent Test**: assert config guards (import astro.config.mjs, scan package.json scripts); boot the built server on a probe port, assert HTTP 200 on localhost, assert the only listener for that port is 127.0.0.1, stop the server.

**Acceptance Scenarios**:

1. **Given** the repo checkout, **When** the config-guard suite runs, **Then** `astro.config.mjs` has no truthy `server.host` and no npm script matches `--host` (privacy.test.ts block a, two cases).
2. **Given** the built app serving on probe port 4323, **When** measured live, **Then** `http://localhost:4323/` answers 200 AND the port (`10E3` hex) appears ONLY on loopback LISTEN rows (`::1` and/or `127.0.0.1`) with no wildcard row in `/proc/net/tcp` or `/proc/net/tcp6` (re-measured run 73, plan R4 — supersedes the run-72 `ACDF` transcription, which was arithmetically wrong).
3. **Given** the probe above, **When** the server stops, **Then** no listener remains for the port (plan Validation step 2).
4. **Given** any future `--host` or `server.host` addition, **When** the guard suite runs, **Then** it fails naming the offending site (block a assertion text).

---

### User Story 3 - Publishing stays a v1.1 story (Priority: P3)

The Gardener (and the build worker) can see in writing that public-only builds (AC3) and private-link redaction (AC4) belong to v1.1/F10 publishing, which does not exist in this repo — so this spec assigns them zero code, zero tests, and zero tasks.

**Why this priority**: Explicit out-of-scope marking is a privacy feature: it stops well-meaning build work from inventing a publish pipeline that could leak private notes.

**Independent Test**: grep the spec dir for AC3/AC4 task lines — none exist; grep the repo for a publish route/filter — none exists.

**Acceptance Scenarios**:

1. **Given** this spec, **When** read end to end, **Then** AC3/AC4 appear exactly once under "Out of Scope" with no FR/SC/tasks referencing them as work (FR-007).
2. **Given** the repo checkout, **When** probed for a publishing surface, **Then** none exists (no publish route, no sitemap/RSS visibility filter — plan R5).

---

### Edge Cases

- Omitted visibility AND omitted status → both default (`'seed'` + `'private'`, privacy.test.ts block b second case).
- Whitespace-padded `' private '` → trimmed to `'private'`; case-variant `'Private'` → rejected (no case-folding on this path, notes.ts:455–456).
- Empty-string visibility → trimmed to `''` → rejected as invalid (enum match fails).
- Explicit `'public'` at creation → honored, never coerced back to private (override path, block c).
- `saveCapture` mode:'unique' → same pin as mode:'new' (single createInput literal, capture.ts:167–176).
- Invalid visibility on the write path (`saveNote`) → rejected (notes.ts:680) — same enum, no silent write.
- `server.host: false` / `''` / absent → guard passes (falsy check, block a); `true` or any non-empty string → guard fails by design.
- `--host` appearing in ANY npm script value → guard fails naming the script (regex `/--host/`, block a).
- Malformed `%` URLs, offline operation, 5,000-note scale → unchanged from F6 posture; no F7 surface touches routing, fetch, or indexing (no new read path).
- AC3/AC4-shaped work (publish filter, redaction) → rejected as out of scope even if "easy" (D4/D5).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `createNote` MUST default omitted `visibility` to `'private'` (`src/lib/notes.ts:642`) and accept explicit `'public'`; invalid values MUST throw `NoteValidationError` (`:643–644`). Evidence: privacy.test.ts block c + notes.test.ts "writes a UTF-8 Markdown file with full frontmatter and defaults" (cross-ref only, D2).
- **FR-002**: `saveCapture` MUST pin `visibility: 'private'` for both `mode:'new'` and `mode:'unique'` (`src/lib/capture.ts:172`, single `createInput` literal `:167–176`). Evidence: capture.test.ts "writes the note verbatim with pinned status/visibility, then commits" (cross-ref only, D2).
- **FR-003**: `parseNoteFile` MUST default an omitted `visibility:` frontmatter line to `'private'` (`src/lib/notes.ts:455`). Evidence: privacy.test.ts block b (two cases).
- **FR-004**: `parseNoteFile`, `createNote`, and `saveNote` MUST reject any visibility outside `NOTE_VISIBILITIES = ['private','public']` (`notes.ts:66`) with `NoteValidationError` naming the value (`notes.ts:456–460`, `:643–644`, `:680–682`). Evidence: privacy.test.ts block c (four cases).
- **FR-005**: The repo MUST NOT set a truthy `server.host` in `astro.config.mjs` and MUST NOT pass `--host` in any `package.json` script (AC2 config half). Evidence: privacy.test.ts block a (two cases) — dynamic config import + scripts scan.
- **FR-006**: The AC2 runtime property MUST be proved by measured one-off evidence while the app runs: HTTP 200 on localhost AND no non-loopback listener for the app port (spec decision Q1; F6 scripted-probe precedent). Re-measured run 73 (`astro preview --port 4323`): 200 on `http://localhost:4323/`, LISTEN on `::1:10E3` (`00000000000000000000000001000000:10E3`, state `0A`) only, no wildcard row in tcp or tcp6; listener gone after stop (plan R4). (Run-72 draft recorded `0B00007F:ACDF` — arithmetically wrong, 0xACDF = 44255, not 4323 = 0x10E3 — superseded.)
- **FR-007**: AC3 (public-only build) and AC4 (private-link redaction) MUST be marked OUT OF SCOPE with zero tasks, zero code, zero tests (D4). No publish route or visibility filter may be added in this feature.
- **FR-008**: Validation MUST remain `npm install` + `TMPDIR=/tmp npm run test` + `npm run build`, green in order with no dependency changes (D7, `.ainative/project.yaml` unchanged). Baseline measured 2026-10-26: install exit 0, test 274/274, build exit 0.

### Success Criteria

- **SC-001**: Every AC1 path is traced to an exact file:line or a named locked test — createNote (notes.ts:642), saveCapture pin (capture.ts:172), parseNoteFile default (notes.ts:455), invalid rejection (notes.ts:456/643/680) — with zero duplicated assertions (D1).
- **SC-002**: Config guards green: privacy.test.ts block a 2/2 on this checkout (part of the 274 green).
- **SC-003**: Runtime loopback measured this chain (200 + 127.0.0.1-only socket + clean stop) and re-measured by the build's T-probe task before converge.
- **SC-004**: Zero behavior change: `git diff --stat` at build converge shows ONLY `specs/f7-privacy/*` plus any spec-named gap file; no AC3/AC4 surface added.
- **SC-005**: Gate holds: install exit 0 → test 274+ (never fewer) → build exit 0, in order, with `TMPDIR=/tmp` for the suite (FUSE host quirk).

## Findings (fresh probes @bc6af28, 2026-10-26)

- **F1** `notes.ts:66` enum is exactly `['private','public']`; `:455` defaults-then-trims; `:456–460` rejects with value-naming error. `createNote :642–644` mirrors; `saveNote :680–682` mirrors.
- **F2** `capture.ts:167–176` single `createInput` with `status:'seed'`, `visibility:'private'`; both modes share it (`mode:'new'` only adds the slug). No second pin site.
- **F3** `astro.config.mjs` is 13 lines, no `server` key at all; `package.json` scripts are `dev/build/preview/test` with no `--host` (both re-probed, match block a).
- **F4** `privacy.test.ts` is 222 lines / 8 its: block a ×2, block b ×2, block c ×4; header documents the (a)/(b)/(c)/(d) split and the two cross-refs. Adopted as the AC evidence base per D1.
- **F5** notes.test.ts:101 "writes a UTF-8 Markdown file with full frontmatter and defaults" asserts `visibility === 'private'` + on-disk re-parse; capture.test.ts:200-describe pins saveCapture mode:'new'. Both green in the 274 run — cross-refs hold, no duplication.
- **F6 (GAP, decided by Q1)** No committed runtime loopback probe exists in the repo — config guards are the only committed AC2 net. Gap disposition: measured one-off evidence (this spec R4 + build T021 re-measurement), NOT a new test file (D1 zero-duplication + D6 file boundaries + F6 R8 precedent).
- **F7** No publishing surface exists: no publish route/page, no sitemap/RSS visibility filter, no redaction helper. AC3/AC4 out-of-scope marking is therefore a pure documentation act with nothing to delete or guard.
- **F8** Gate measured this session: `npm install` exit 0 (audit noise only), `TMPDIR=/tmp npm run test` 14 files / 274 passed, `npm run build` exit 0 (1.46 s server build). Expectation for build: 274+ (never fewer).

## Out of Scope (binding)

AC3 (v1.1 publishing build includes only `visibility: public`) and AC4 (private links from public notes render as plain text) belong to v1.1/F10 publishing, which does not exist in v1. This spec assigns them no FR, no SC, no tasks, no code, and no tests. Any build hunk toward a publish pipeline is a scope violation, not a gap fix.

## Locked Constraints (D1–D8, orchestrator-binding)

D1 adopt `privacy.test.ts` as the AC evidence base, zero duplicates; D2 trace all three AC1 paths + invalid rejection; D3 config guards + runtime proof in the form this spec decides (measured one-off, Q1/F6); D4 AC3/AC4 out of scope, no tasks/code/tests; D5 no behavior change unless this spec names a real gap (only F6 named); D6 OWN = `specs/f7-privacy/*` (+ only spec-named gap files); READ-ONLY everything else; D7 gate install → `TMPDIR=/tmp` test (expect 274) → build, validation_commands unchanged; D8 chain spec(reasoning/HOST) → build(worker/SDK) → critic/tester(validation/HOST), non-independence note only if validation model ever equals reasoning's or worker's.
