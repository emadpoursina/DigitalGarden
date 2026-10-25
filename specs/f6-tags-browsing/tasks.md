# Tasks: F6 Tags & Browsing

**Input**: Design documents from `specs/f6-tags-browsing/` — `spec.md` (clarified 2026-10-25, 5/5 headless questions resolved), `plan.md` (Phase 5/6, contracts §1–§4, R1–R8), `checklists/requirements.md` (16/16).

**Branch**: `digitalgarden/t_8e4e7e60-f6-tags-browsing` (spec card t_4b8f1860, parent t_8e4e7e60) | **Base**: 4cb3077 (F5 merge, F4 present).

**Tests**: `npm install` + `npm run test` (`vitest run`, `*.test.ts` only) + `npm run build` stay green in order (FR-012). Browser-only facts are covered by one-off scripted checks against `astro dev` on a hermetic temp vault — no `*.spec.ts`, no `playwright.config.ts`, no repo files from scripts (run from the scratch dir; plan R8).

**File boundaries (binding)**: OWN: `src/lib/tags.ts`, `src/lib/tags.test.ts`, `src/pages/tags/index.astro`, `src/pages/tags/[tag].astro`, minimal `Base.astro` nav insertion, README section. READ-ONLY (verify-only, zero hunks): `notes.ts`(+test), `dashboard.ts`, `status-list.ts`, `status/[state].astro`, `search.ts`(+test), `search-shortcut.ts`(+test), `search.astro`, `index.astro`, `note/[slug].astro`, `api/*`, `global.css`, `package.json`/lockfile, `.ainative/project.yaml`. Never create/edit `src/pages/status/*` nor `status-list.ts` (D5).

**Format**: each task is one `- [ ]` checkbox line (the ONLY handoff the build consumes). `[P]` = parallelizable (independent files, no dependency). `[US1]/[US2]/[US3]` = user-story scope; tasks in Phase 2 are foundational (blocking). `T`-suffixed probes are verification, not code.

---

## Phase 1: Setup (shared verification, no code)

- [X] T001 Verify baseline + record gate state: run `npm install`, `npm run test`, `npm run build` in order on THIS worktree @ 4cb3077; record results (expect: install exit 0, test 246/247 with the 1 pre-existing `note.test.ts` unwritable-vault 500-vs-200 root artifact, build exit 0); confirm `git status` clean and `src/pages/` has no `tags/` dir (plan Summary facts 3/6, spec Finding 8, Risks pre-existing-failure).

## Phase 2: Foundational (BLOCKING — `tags.ts` contract before any page)

- [X] T002 [P] Create `src/lib/tags.ts` per plan contract §1 (R1/R3): export `TaggableNote {slug,title,tags?,status,updated}`, `TagEntry {tag,count}`, `getAllTags(tagIndex)` (project `Object.keys` order, NO re-sort, `count = slugs.length`, no mutation), `getNotesForTag(notes,tag)` (fold input once, match `(note.tags ?? [])` case-folded, sort `updated` DESC + `slug` ASC, input never mutated), `tagHref` (`'/tags/' + encodeURIComponent`), `decodeTagParam` (`try decodeURIComponent catch URIError → raw`, then `.toLowerCase()`) — FR-003/FR-004/FR-007, SC-001/SC-002/SC-006.
- [X] T003 Create `src/lib/tags.test.ts` per plan R6 (through the REAL `buildTagIndex`, never a mock index): `getAllTags` alphabetical + counts + no-duplicate-casing + no-re-sort (shuffled key insertion order preserved); `getNotesForTag` exact-membership + case-fold + `updated` DESC + `slug` ASC tie-break + input-mutation-free; `tagHref`/`decodeTagParam` round-trips (`C++`, `a/b`, `50%`, `café`, emoji; malformed `%E0%A4%A` → no-throw miss); AC3 regression (tag on two notes → rebuilt index has key; removed everywhere → rebuilt index lacks key, `getAllTags` has no entry) — FR-003/FR-007/FR-010, SC-001/SC-002/SC-004/SC-006.
- [X] T004 Run `npm run test -- src/lib/tags.test.ts` then full `npm run test`: tags suite green; full gate unchanged-or-better vs T001 baseline (the 1 pre-existing `note.test.ts` failure stays a root artifact, never worsened) — FR-012, SC-006.

## Phase 3: User Story 1 — Browse the tag index (P1, AC1)

- [X] T010 [US1] Create `src/pages/tags/index.astro` per plan contract §2 (R2/R4): tolerant per-note read (`listNoteSlugs` → per-slug `readNote` try/catch, skip broken — NEVER `refreshVaultIndex`) + `buildTagIndex(notes)` + `getAllTags`; heading `Tags`; rows `<a href={tagHref(tag)}>` + count text (`N notes`/`1 note`); empty `<p class="empty">No tags yet — add a tag to a note to grow this index.</p>` (200 always, never 404); page-scoped `<style>` only; header with Dashboard link; NO `.sort()`/`.filter()` inline (only `.map()` to row shape) — FR-001/FR-003/FR-009, SC-001.
- [X] T011 [US1] Verify `/tags` live (scripted `astro dev` + hermetic fixture vault per plan Validation step 1, R8): mixed-case/padded tags merge to one canonical row; counts correct; alphabetical code-unit order; every row links and round-trips (incl. `C++`/`a/b`/`50%`/unicode); archived-tagged notes counted identically with no filter; zero-tag vault → 200 empty-state; malformed file skipped, never 500 — US1 scenarios 1–6, SC-001/SC-004.

## Phase 4: User Story 2 — List notes by tag (P1, AC2-tag-half)

- [X] T020 [US2] Create `src/pages/tags/[tag].astro` per plan contract §3 (R2/R3/R4): `raw = Astro.params.tag ?? ''`, `key = decodeTagParam(raw)`, same tolerant read + `buildTagIndex(notes)`, `rows = getNotesForTag(notes, key)`; heading `Notes tagged “<raw>”` (raw, escaped); rows title `<a href=/note/<slug>>` + `<span class="badge" data-status>` (page-scoped copy of status-page CSS, four-value colors) + `<time datetime>`; `updated` DESC + `slug` ASC; empty `No notes tagged “<raw>” yet.` (200 always — NO 404 branch in this file); page-scoped `<style>` only; header with Dashboard link; NO inline `.sort()`/`.filter()` — FR-002/FR-004/FR-005/FR-007/FR-009, SC-002.
- [X] T021 [US2] Verify per-tag matrix live (scripted, R8; plan Validation step 2): three casings of one tag → identical newest-first rows (title link + badge + `<time>`); unknown tag → 200 empty-state naming it; malformed `%` URLs (`/tags/%E0%A4%A`, `/tags/50%`, `/tags/%zz`) are rejected UPSTREAM by Astro 7 before any F6 code runs (`astro dev` 500 via `devTrailingSlash` `decodeURI`; built server 400 "Bad request." via the node-standalone guard) — documented boundary, explicitly out of scope for the F6 no-500 promise (spec FR-007 as amended 2026-10-25); any *decodable* segment that misses the index → 200 empty-state naming it; `/tags/index` serves the INDEX page (recorded D3-wins limitation); `/tags/<old>` after AC3 removal → empty-state — US2 scenarios 1–6, SC-002/SC-004. (Amended + verified 2026-10-25: malformed class re-scoped per spec amendment; all other bullets probed green in the build run — 30/30 base + 7/7 drop — and re-probed live dev + built this session.)

## Phase 5: User Story 3 — Reach tags from anywhere; status keeps working (P2, AC2-status-half + AC3)

- [X] T030 [US3] Insert ONE landmark nav in `src/layouts/Base.astro` per plan contract §4 (R5): directly above `<slot/>`, `<nav id="site-nav" aria-label="Sections"><a href="/tags" id="tags-entry">Tags</a></nav>`; preserve existing anchors (none today); zero `<script>`, zero `<style>` in Base; per-page headers untouched; zero key handlers anywhere in F6 — FR-008/FR-011, SC-005.
- [X] T031 [US3] Probe `/status/[state]` unchanged (T-task, NO code — D5): each valid state serves F4 rows newest-first with param-driven copy; `/status/nonsense` → 404; `git diff --stat src/pages/status/ src/lib/status-list.ts` empty at the end (EXPECTED, not a gap) — FR (D5 via spec), US3 scenario 2, SC-003.
- [X] T032 [US3] Verify AC3 live + malformed-skip on both tag routes (scripted, plan Validation step 3): remove a tag from every note → reload `/tags` → key gone, `/tags/<old>` → empty-state; malformed file still skipped on both routes, never 500; repo `vault/` never written — FR-010, US3 scenario 3, SC-004.
- [X] T033 [US3] Keyboard + loopback sweep (scripted, plan Validation steps 4/6): from `/`, `/note/<slug>`, `/search`, `/status/seed` — Tab reaches `#tags-entry`, activates → `/tags`; every F6 link/row Tab-reachable with visible focus; zero key handlers (F2/F3/F5 printable-key sweeps stay green); no non-loopback listener, no `--host` anywhere — FR-011, US3 scenarios 1/4, SC-005.
- [X] T034 [US3] Update `README.md` (docs only): tag index + per-tag lists + nav entry + AC3 note + `index`-named-tag limitation; docs match shipped behavior — plan File-by-file row, Risks `index`-shadow.

## Phase 6: Polish (gate + zero-hunk proofs + timing)

- [X] T040 Full gate in order (`npm install` → `npm run test` → `npm run build`, FR-012/SC-006) + zero-hunk proofs: `git diff --stat` shows ONLY `src/lib/tags.ts`, `src/lib/tags.test.ts`, `src/pages/tags/index.astro`, `src/pages/tags/[tag].astro`, `src/layouts/Base.astro`, `README.md` (+ this spec dir); `git diff src/lib/notes.ts` EMPTY; `npm run build` exit 0; record both tag-view timings < 500 ms on the seeded vault (SC-007) — SC-006/SC-007.

## AC coverage (parent card's 3 criteria → tasks)

- AC1 (`/tags` alphabetical + counts): T002 (selection) + T003 (unit proof) + T010 (page) + T011 (live proof) + T040 (gate).
- AC2 (per-tag + status rows): T002/T003 (selection/codec) + T020/T021 (per-tag page + matrix); status half = T031 probe (F4 suite is the net, no new tests).
- AC3 (tag removed everywhere → gone next refresh): T003 (regression through real `buildTagIndex`) + T032 (live drop) + T010/T020 (per-request rebuild posture, no cache/hook).

## Dependencies

- T002, T003, T004 sequential (contract → tests → suite proof). T010/T020 depend on T002 (import `tags.ts`); T003's AC3 case needs only `buildTagIndex` + planned `tags.ts` surface (writable alongside T002). T011 depends on T010; T021 on T020; T030 independent of pages (parallelizable with T010/T020 once T002 lands); T031–T034 depend on their pages/nav existing; T040 depends on everything (final gate).
