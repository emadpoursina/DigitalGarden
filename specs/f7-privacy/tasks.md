# Tasks: F7 Privacy Model

**Input**: Design documents from `specs/f7-privacy/` — `spec.md` (clarified 2026-10-26, 5/5 headless questions resolved), `plan.md` (Phase 5/6, research R1–R7, contracts C1–C3, AC matrix), `checklists/requirements.md` (12/12).

**Branch**: `digitalgarden/t_5a89c68c-f7-privacy-model` (spec card t_4383472c, parent t_5a89c68c) | **Base**: bc6af28 (test-only privacy-guard commit on top of cc1068b F6 merge).

**Tests**: `npm install` + `TMPDIR=/tmp npm run test` (`vitest run`, `*.test.ts` only) + `npm run build` stay green in order (FR-008). Runtime-only facts are covered by one-off scripted checks against `astro preview` on a probe port — no `*.spec.ts`, no `playwright.config.ts`, no repo files from scripts (plan R7; run from `/tmp`, log to `/tmp`).

**File boundaries (binding)**: OWN: `specs/f7-privacy/*` ONLY (this spec dir; no gap file named — spec names none). READ-ONLY (verify-only, zero hunks): `src/lib/privacy.test.ts` (exactly 8 its, D1), `src/lib/notes.ts`(+test), `src/lib/capture.ts`(+test), `astro.config.mjs`, `package.json`/lockfile, `.ainative/project.yaml`, all other tests, all routes/pages. Never create/edit `src/pages/*`, never touch AC3/AC4-shaped code (FR-007).

**Format**: each task is one `- [ ]` checkbox line (the ONLY handoff the build consumes). `[P]` = parallelizable (independent files, no dependency). `[US1]/[US2]/[US3]` = user-story scope; T-suffixed probes are verification, not code.

---

## Phase 1: Setup (shared verification, no code)

- [x] T001 Verify baseline + record gate state: run `npm install`, `TMPDIR=/tmp npm run test`, `npm run build` in order on THIS worktree @ bc6af28; record results (expect: install exit 0, test 14 files / 274 passed, build exit 0); confirm `git status` shows ONLY `?? specs/f7-privacy/` (this chain's own artifacts) and `git diff --stat` empty of source hunks; confirm `ls src/pages/` has no publish route (plan R5) (plan Summary facts 7–8, spec Findings F4/F7/F8).

## Phase 2: Foundational (BLOCKING — evidence trace before any probe)

- [x] T002 [P] Trace AC1 to exact lines (read-only audit, no edits): open `src/lib/notes.ts` and confirm `?? 'private'` defaults at :455 (parse) and :642 (create), enum `['private','public']` at :66, rejections at :456–460 / :643–644 / :680–682; open `src/lib/capture.ts` and confirm the single pin at :172 shared by both modes (:167–176); record the six line numbers verbatim in the task output — any drift from the spec/plan numbers is a FINDING, not a silent update (FR-001–FR-004, SC-001).
- [x] T003 [P] Confirm the guard suite is adopted intact (read-only audit, no edits): `src/lib/privacy.test.ts` is 222 lines / 8 its (block a ×2 config guards, block b ×2 parser defaults, block c ×4 validation); header documents the (a)/(b)/(c)/(d) split + the two cross-refs (notes.test.ts filename-default case ~:101, capture.test.ts :200-describe mode:'new' pin); `TMPDIR=/tmp npm run test -- src/lib/privacy.test.ts` green 8/8 (FR-001–FR-005, SC-001/SC-002).

## Phase 3: User Story 1 — Private by default (P1, AC1)

- [x] T010 [US1] Verify AC1 end to end through the locked suites (T-task, NO code): full `TMPDIR=/tmp npm run test` green 274+; the AC1 net is notes.test.ts filename-default case (createNote default + re-parse) + capture.test.ts :200-describe (saveCapture pin) + privacy block b (parser omit ×2) + block c (reject ×4); record the four covering sites + suite count (FR-001–FR-004, SC-001).
- [x] T011 [US1] Probe the whitespace/case boundary live (scripted, plan R1): via a scratch vitest-free node script (from /tmp, never a repo file) import `parseNoteFile` and confirm `' private '` → `'private'`, `'Private'` → throws `NoteValidationError`, `''` → throws; record the three outcomes (spec Q3 decision, FR-003/FR-004, Edge Cases).

## Phase 4: User Story 2 — Localhost only (P1, AC2)

- [x] T020 [US2] Verify AC2 config guards through the locked suite (T-task, NO code): `TMPDIR=/tmp npm run test -- src/lib/privacy.test.ts` block a 2/2 green (dynamic `astro.config.mjs` import shows no truthy `server.host`; `/--host/` scan over the four npm scripts shows zero hits); record both assertion outcomes (FR-005, SC-002).
- [x] T021 [US2] Re-measure the runtime loopback proof live (scripted, plan R4; verification, not code): boot `npm run preview -- --port 4323` (or a recorded free port on collision) in the background, log to /tmp; `curl http://localhost:<port>/` → record HTTP code (expect 200); `grep -i <PORT-HEX> /proc/net/tcp /proc/net/tcp6` → record rows (expect loopback LISTEN only — port 4323 = `10E3` hex; run 73 measured `::1:10E3` state `0A`, no wildcard row in either table); stop the server by PID (never `pkill -f`, whose pattern can match the caller's own shell) and confirm no listener remains; paste the three evidence lines into the task output (FR-006, SC-003).

## Phase 5: User Story 3 — Publishing stays v1.1 (P3, AC3/AC4 out of scope)

- [x] T030 [US3] Prove the AC3/AC4 absence (T-task, NO code): `ls src/pages/` shows no publish route; repo-wide search for a sitemap/RSS visibility filter or redact helper shows none; `grep -ri "publish" specs/f7-privacy/tasks.md` shows no task line touching AC3/AC4 as work; record all three negatives (FR-007, spec Out of Scope).

## Phase 6: Polish (gate + zero-hunk proofs + timing)

- [x] T040 Full gate in order (`npm install` → `TMPDIR=/tmp npm run test` → `npm run build`, FR-008/SC-005) + zero-hunk proofs: `git diff --stat` shows ONLY `specs/f7-privacy/*`; `git diff src/ astro.config.mjs package.json` EMPTY; `privacy.test.ts` still exactly 8 its; record suite count (expect 274+, never fewer), build exit (expect 0), and vitest duration (plan measured ~6.4 s) (SC-004/SC-005).

## AC coverage (parent card's 4 criteria → tasks)

- AC1 (private-by-default unless explicit override): T002 (line trace) + T003 (suite adoption) + T010 (end-to-end net) + T011 (whitespace/case boundary) + T040 (gate).
- AC2 (localhost only, never non-loopback): T020 (config guards) + T021 (live re-measurement) + T040 (gate).
- AC3 (public-only v1.1 build): T030 absence proof + explicit zero-task marking (FR-007) — OUT OF SCOPE, no code/tests.
- AC4 (private-link redaction v1.1): T030 absence proof + explicit zero-task marking (FR-007) — OUT OF SCOPE, no code/tests.

## Dependencies

- T002, T003 parallelizable (independent read-only audits); both BLOCK T010/T011/T020 (trace before verify).
- T010 depends on T002+T003 (AC1 trace + suite adoption land first). T011 depends on T002 (needs the R1 line facts).
- T020 depends on T003 (suite adoption); T021 independent of T020 (live probe vs suite) but both depend on T001 (baseline gate first).
- T030 independent of all (absence proof touches nothing) — parallelizable any time after T001.
- T040 depends on everything (final gate + zero-hunk proofs).
