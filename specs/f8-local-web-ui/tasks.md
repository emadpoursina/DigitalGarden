# Tasks: F8 Local Web UI

**Input**: Design documents from `specs/f8-local-web-ui/` — `spec.md` (clarified 2026-10-27, 5/5 headless questions resolved: Q1 measured cold-start, Q2 2 s idle + commit-free + `/new` reuse, Q3 bare-`c` scoped retention, Q4 highlighting required, Q5 explicit toggle + measured ratios), `plan.md` (Phase 5/6, research R1–R6, contracts C1–C3, 7 validation flows), `checklists/requirements.md` (16/16 self-review pass).

**Branch**: `digitalgarden/t_1e1b2dca-f8-local-web-ui` (spec card t_16ae5d38, parent t_1e1b2dca) | **Base**: 76d6dbd (F7 merge, clean tree; `git status` shows ONLY `?? specs/f8-local-web-ui/`).

**Tests**: `npm install` + `TMPDIR=/tmp npm run test` (`vitest run`, `*.test.ts` only) + `npm run build` stay green in order (FR-012). UI/runtime facts are scripted Playwright/probe runs from `/tmp`, never committed `*.spec.ts` / `playwright.config.ts` (plan R8 lesson). Build records measurements; tester owns `evidence.md` (D7).

**File boundaries (binding, D5)**: OWN: `specs/f8-local-web-ui/*` + ONLY the gap files named below (+ two `.gitignore` evidence lines, T010). READ-ONLY: `PRD.md`, `specs/f2..f7`, `.ainative/project.yaml`, `astro.config.mjs`, `privacy.test.ts` (8 its), `notes.ts`/`capture.ts` visibility paths, `src/pages/new.astro` + `src/lib/capture-client.ts` (F2-owned), all search/tags/status pages + libs except as named. Any other hunk is a scope violation (SC-007).

**Format**: each task is one `- [ ]` checkbox line (the ONLY handoff the build consumes). `[P]` = parallelizable (independent files). `[USn]` = user-story scope. T-suffixed probes are build-time measurement, not tester evidence.

---

## Phase 1: Setup (shared verification, no code)

- [x] T001 Verify baseline + record gate state: run `npm install`, `TMPDIR=/tmp npm run test`, `npm run build` in order on THIS worktree @ 76d6dbd; record results (expect: install exit 0, test 14 files / 274 passed, build exit 0); confirm `git status` shows ONLY `?? specs/f8-local-web-ui/` and `git diff --stat` empty of source hunks; confirm no `specs/f8-*` before this chain and `.gitignore` has no evidence lines (plan Summary facts, spec Findings F9–F10).

## Phase 2: Foundational (BLOCKING — contracts before wiring)

- [x] T002 [P] FR-003 code highlighting (plan R1): wire the minimal highlight mechanism in `src/lib/render.ts` (markdown-it `highlight` callback, subset import only, SSR + client share the identical module) + extend `src/lib/render.test.ts` (fenced-code highlighting markup + read/preview parity C2 + raw-HTML-escaped); `package.json` + lockfile diff CONDITIONAL and exactly the highlight dep, else untouched; record the client-script bundle delta (FR-003/FR-004, SC-002).
- [x] T003 FR-006 contract C1 (plan R2): extend `src/pages/api/note.ts` 200 body to echo `hash` (`{ slug, status, updated, hash, backlinks }`, hash = new on-disk snapshot hash); NO other contract change (validation order, 400/404/409/500 shapes, omitted-field-keeps-disk-value rule untouched); extend the api/note tests for the `hash` echo + stale-baseHash 409 still firing (FR-006, SC-003).

## Phase 3: User Story 3 — Editing feels like writing (P1, AC3)

- [x] T004 FR-006 autosave decisions (plan R2): add pure DOM-free predicates to `src/lib/wikilink-client.ts` (`AUTOSAVE_IDLE_MS = 2000`, `shouldAutosave({dirty, inFlight})`, response handler refreshing `baseHash` from the C1 `hash` echo; rules: clean-buffer idle never POSTs, in-flight suppresses double-POST, autosave never carries `force:true`) + extend `src/lib/wikilink-client.test.ts`; page wires DOM only (FR-006, SC-003).
- [x] T005 [US3] FR-005/FR-006 note edit surface (plan R2/R6): in `src/pages/note/[slug].astro` ONLY (page script + scoped styles, no save-path redesign, no new routes) build side-by-side source + live preview (shared `renderNoteBody` import, same resolver as read mode, responsive collapse, focus lands in source), autosave timer + status line (`Saving…` / `Saved …` / error), explicit Save immediate POST, Esc-dirty confirm, existing 409 box with Reload (discard) vs Overwrite (`force:true`, focus on content-preserving choice); verify `git log` shows NO new commit from any edit-save write (D3/FR-007, SC-003).

## Phase 4: User Story 2 — Notes read like notes (P1, AC2)

- [x] T006 [US2] FR-002/FR-004 render lock-in (T-task, T002-dependent verification, NO new code beyond T002): full `TMPDIR=/tmp npm run test -- src/lib/render.test.ts` green (headings h1–h6, nested lists, tables, resolved/alias/pending wiki-links, literal `[[#…]]`/`[[]]`/whitespace rules, code-span `[[..]]` never links, raw HTML escaped, highlighting markup present, preview≡read parity for the same source); record suite count (FR-002–FR-004, SC-002).

## Phase 5: User Story 4 — Hands stay on the keyboard (P1, AC4)

- [x] T007 [US4] FR-008/FR-009 keyboard audit (plan R3): walk EVERY binding (dashboard bare-`c` field-guarded, Ctrl/⌘-K, `[[` popup router popup-open-only, results keys panel-focused-only, capture keys form-scoped, editor Esc / Ctrl-Enter / 409-box buttons / theme toggle) with keyboard only; each row ends modifier-scoped or command-mode-scoped, or is remediated inside the T005 page script; bare-`c` retention carries the FR-009 finding and needs critic sign-off, otherwise remediate; record the audit table (FR-008/FR-009, SC-004).

## Phase 6: User Story 5 — Light and dark, both readable (P2, AC5)

- [x] T008 [US5] FR-010 explicit themes (plan R4): extend `src/styles/global.css` with `[data-theme]` token overrides (media query stays as default source only), add the persisted keyboard-reachable toggle (`aria-pressed`, `localStorage`, OS default) to `src/layouts/Base.astro` (button + tiny wiring, nav stays), NEW `src/lib/theme.ts` + `theme.test.ts` ONLY if DOM-free-testable; measure computed-style contrast ratios body + muted text per theme on all six surfaces (body ≥ 4.5:1, large/UI ≥ 3:1), record the ratio table; no-JS still renders the OS-media default (FR-010, SC-005).

## Phase 7: User Story 1 — Ready before I notice (P1, AC1) + polish

- [x] T009 [US1] FR-001 cold-start probe (scripted from /tmp, NO committed timing test, plan R5): build, boot `astro preview` on a recorded free probe port, time process-spawn → first 200 on `/` (expect < 2 s, record port + warm/first-build state + timing), confirm loopback-only listener (`/proc/net`-style check, F7 R4 precedent), `curl` the dashboard (recent notes + seeds + Capture entry, no list-content spinner), stop by PID and confirm the port is free (FR-001, SC-001).
- [x] T010 Full gate + diff audit + evidence hygiene (D6/D7): `npm install` → `TMPDIR=/tmp npm run test` → `npm run build` exit 0 in order; `git diff --stat` shows ONLY `specs/f8-local-web-ui/*` + spec-named gap files; `privacy.test.ts` still 8 its; `astro.config.mjs` untouched; suite count 274+ (never fewer); append ONLY the two D7 evidence lines to `.gitignore` (`specs/*/evidence/`, `specs/*/evidence.md`); record exits + count + diff (SC-006/SC-007).

## AC coverage (PRD §7 F8 AC1–AC5 → tasks)

- AC1 (localhost ready < 2 s, measured): T001 (baseline) + T009 (probe) + T010 (gate).
- AC2 (readable markdown + highlighting + wiki-links): T002 (highlight) + T006 (render lock-in) + T010 (gate).
- AC3 (side-by-side + preview + 2 s autosave + explicit save, commit-free): T003 (C1) + T004 (predicates) + T005 (surface) + T010 (gate; no-commit verified in T005).
- AC4 (keyboard, every binding scoped): T007 (audit + remediation) + T010 (gate).
- AC5 (explicit light/dark, measured AA both themes): T008 (themes + ratios) + T010 (gate).

## Dependencies

- T001 first (baseline gate before any edit).
- T002 + T003 parallelizable (independent files); both BLOCK T004/T005 (highlight module + hash echo land before preview/autosave wiring).
- T004 BLOCKS T005 (predicates before page wiring); T002 BLOCKS T006 (highlight before render lock-in).
- T005 BLOCKS T007 (surface exists before keyboard walk); T005 + T008 independent of each other (different files) — parallelizable.
- T009 independent of code tasks (probe runs against the built server) — any time after T001, re-run after T010.
- T010 depends on everything (final gate + diff audit + .gitignore lines).
