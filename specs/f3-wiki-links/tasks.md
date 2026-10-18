---

description: "Task list for F3 Wiki-Links & Backlinks — /note/[slug] reading view, resolution fix, save endpoint with backlink recompute, [[ autocomplete, pending-create, tests"
---
# Tasks: F3 Wiki-Links & Backlinks

**Input**: Design documents from `/specs/f3-wiki-links/` — `spec.md` (clarified 2026-10-18, 4 user stories) + `plan.md` (Research R1–R8, Data Model, Interface Contracts, file-by-file changes, AC verification matrix, Validation & Quickstart). Per the card's F2-parity artifact set, the usual `research.md` / `data-model.md` / `contracts/` / `quickstart.md` are consolidated into `plan.md` — nothing is missing.

**Prerequisites**: `plan.md` (present), `spec.md` (present). `.specify/memory/constitution.md` is an unfilled `[PROJECT_NAME]` template → no gates. `.specify/extensions.yml` does not exist → `before_tasks` / `after_tasks` hook stages skipped silently (pre-check and mandatory post-check both performed).

**Tests**: Requested by this feature (D8 validation includes `npm run test`; spec SC-002/003/004/005/008 demand automated evidence). Unit tests are paired with the implementation line that turns them green; the endpoint contract suite has its own line (T009). Ordering convention under "Notes".

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently. Every line is standalone: what to change, the exact file paths, and a done-when check — one line = one implement card. **This file is the self-contained handoff for the build card (t_5927eb0f): do not re-spec; if a line contradicts spec.md/plan.md, treat spec.md as authority and comment/block rather than invent scope.**

## Format: `[ID] [P?] [Story] Description — Done when: …`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4 from `spec.md`; Setup / Foundational / Polish carry no story label
- **Done when**: the acceptance check the implementer must satisfy before the card may close

## Binding constraints (do not re-decide)

- **D1–D9** (parent card t_eea78f10, identical in every sibling card): minimal `/note/[slug]` reading view + edit surface (rendered note w/ wiki-link rendering, backlinks panel, raw-Markdown textarea editor with `[[` autocomplete, save path) — no F8 upgrades (D1); reuse `src/lib/notes.ts` hooks, extend only on proven gap (D2 — the proven gap is T003); resolution case-insensitive, slug → title order + the slugify tier (D3/clarify Q1); archived notes stay in the backlink index with status flag, trash excluded (D4); autocomplete = DOM-free pure functions in `src/lib/wikilink-client.ts` + vitest, popup-scoped keys only, no bare global bindings (D5); backlinks recompute on the save path via `refreshVaultIndex` (D6); pending links render with a marker, first click POSTs to the create-note API (title = target) then navigates (D7); validation `npm install` + `npm run test` + `npm run build` and `.ainative/project.yaml` must gain `npm run test` (D8); ship parks for operator approval before any merge/push/PR (D9).
- **Clarifications (spec, locked)**: Q1 three-tier resolution with smallest-slug tie-break; Q2 in-page Edit toggle, dirty Esc confirms; Q3 pending-create → `seed`/`private`/empty body, land on new note's read view, collision → navigate to existing; Q4 **F3 saves create NO git commit** (F9 owns commit-on-save); Q5 external-edit conflict → F1 snapshot + inline reload/overwrite choice.
- **Contracts in `plan.md` are binding**: `POST /api/note` request/response table (Interface Contracts §1 — `200 { slug, updated, backlinks }`, `409 external-edit-conflict`, `force` only from the Overwrite control), embedded `#f3-page-data` JSON shape (§2), `resolveWikiLink` three-tier rule (§3), pending-create = reuse `POST /api/capture { title }` → `201`/`409` (§4 — do NOT create a third endpoint).
- **File boundaries**: `src/lib/notes.ts` may change ONLY inside `resolveWikiLink` (T003); never modify `src/pages/index.astro`, `src/pages/new.astro`, `src/pages/api/capture.ts` + `capture.test.ts`, `src/lib/capture*.ts`, `src/lib/vault.ts`, `src/lib/dashboard.ts`, `src/layouts/Base.astro`, `src/styles/global.css`, `astro.config.mjs` (F2-shipped, read-only for F3). `src/lib/notes.test.ts` gains additive cases only.
- **No commits/push from these tasks** (D9 + Q4): verification runs against temp vaults (`GARDEN_VAULT_DIR=$(mktemp -d)` + `git init`); nothing is committed to `digitalgarden/t_5927eb0f-…`, and F3's save endpoint must not commit (T009 asserts it).
- **Workspace**: build in `/opt/data/mnt/workspace/digitalGarden/.worktrees/t_5927eb0f` (fresh worktree — no `node_modules` today; T001 unblocks everything).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: make the project installable/testable and fix the validation gate — nothing else runs without this.

- [x] T001 [P] Add `"@types/markdown-it": "^14.2.0"` to `devDependencies` in `package.json` (markdown-it ships no `index.d.ts`; 14.2.0 is the newest published types line — plan R1/Technical Context) and run `npm install` in `/opt/data/mnt/workspace/digitalGarden/.worktrees/t_5927eb0f` — Done when: install exits 0, `node_modules/` exists, the lockfile diff contains only the `@types/markdown-it` subtree (runtime deps unchanged: `astro@7.3.8`, `@astrojs/node`, `markdown-it@15.0.2`, `simple-git@4.0.2`), and `npm run test` (baseline) + `npm run build` both exit 0 in the fresh worktree; this task blocks every other task.
- [x] T002 [P] Update `.ainative/project.yaml` so `validation_commands` lists, in order, `npm install`, `npm run test`, `npm run build` — keeping the file's existing header comments accurate (D8, spec FR-011) — Done when: the YAML parses, all three commands appear, and running them in sequence exits 0.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the one F1-module change every story consumes — canonical link resolution (D3 gap, spec FR-003, plan R2).

- [x] T003 Extend `resolveWikiLink(target, notes)` in `src/lib/notes.ts` to the three-tier case-insensitive rule — tier 1 exact slug, tier 2 exact title, tier 3 `slugify(target) === n.slug`, first non-empty tier wins, ties inside a tier resolved to the lexicographically smallest slug, `null` only when all three miss — changing nothing else in the file, plus additive cases in `src/lib/notes.test.ts`: `[[Retrieval Practice]]`-style target → slug `retrieval-practice` (title "Retrieval practice sessions"), `cafe society` → `cafe-society` ("Café Society"), accent/punctuation variants, `ARTIFICIAL-INTELLIGENCE` regression, duplicate-title tie-break (smallest slug), all-miss → null — Done when: `npx vitest run src/lib/notes.test.ts` is green with the pre-existing F1 assertions untouched, and `git diff src/lib/notes.ts` shows changes confined to `resolveWikiLink`. (depends: T001)

**Checkpoint**: foundation ready — renderer, panel, and autocomplete insert all resolve identically (FR-003).

---

## Phase 3: User Story 1 — Read a note: rendered wiki-links + backlinks panel (Priority: P1) 🎯 MVP-open

**Goal**: `/note/<slug>` renders the note's Markdown with resolved wiki-links as anchors and unresolved targets as pending markers, plus a Backlinks panel listing each inbound link occurrence (referencing title, status incl. archived flag, link text); unknown slug → 404.

**Independent Test**: with a fixture vault where note A links `[[B]]`, `[[Target|alias]]`, `[[Missing]]`, open A's view: anchors point at B/alias render correctly, `[[Missing]]` is a focusable pending marker (no note created), the panel on B lists A with its link text; request an unknown slug → 404.

### Implementation for User Story 1

- [x] T004 [US1] Create `src/lib/render.ts` exporting `renderNoteBody(body, resolve)` — markdown-it instance (`html:false` default kept) plus an inline rule registered before `link` (plan R1): `[[target|alias]]` → resolved anchor `a.wikilink[href=/note/<slug>]` with alias-or-target text, unresolved → focusable `a.wikilink.pending[data-target]` marker, targets starting with `#` / empty / whitespace targets make the rule bail (stay literal), attributes escaped; injected `resolve` so tests can stub — plus `src/lib/render.test.ts`: anchor href/text, alias parity with `extractWikiLinks`, pending markup, `[[#…]]` literal, `[[..]]` in inline code and fenced code untouched, raw `<script>` body renders escaped, and the render/index parity assertion (rendered link targets == `extractWikiLinks(body)` targets for the fixture body) — Done when: `npx vitest run src/lib/render.test.ts` is green. (depends: T003)
- [x] T005 [US1] Create `src/pages/note/[slug].astro` (server-rendered, page-scoped `<style>` only, `Base.astro` untouched): resolve `resolveVaultDir()` → `readNoteWithSnapshot(slug)` (404 via `new Response(…, { status: 404 })` on `NoteNotFoundError` — friendly body, no stack trace) → `refreshVaultIndex()` → `<h1>` title + status badge + last-updated + a Edit `<button id="note-edit-open">` + `<article id="note-body">` with `renderNoteBody(...)` resolved against `index.notes` + the embedded `<script type="application/json" id="f3-page-data">` carrying `{ snapshot: { hash, mtimeMs }, candidates: [{ slug, title, status }] }` with **candidates sorted case-insensitively by title** (plan R6 — deterministic popup order for T011/T012); NO edit region, NO popup, NO panel, NO page script yet (T006/T010/T012 add them) — Done when: `npm run build` exits 0 and a served GET of an existing slug returns the rendered body with resolved anchors/pending markers, a GET of an unknown slug returns HTTP 404. (depends: T004)
- [x] T006 [US1] Add the Backlinks panel `<aside id="backlinks">` to `src/pages/note/[slug].astro` from `index.backlinks[slug]`: one row per link occurrence — referencing note title as a link to `/note/<fromSlug>`, its status badge (archived visibly flagged), the `linkText` — and an explicit "No backlinks yet" empty state; self-links, unresolved links and trashed notes are already excluded by F1's index (do not re-filter beyond what the index returns) — Done when: `npm run build` exits 0 and the live view shows panel rows matching the fixture vault (archived source flagged), while note B's view lists A with A's link text (AC2's read half). (depends: T005)

**Checkpoint**: US1 functional — the network is visible: rendered links + pending markers + backlinks panel, AC4's resolution observable end to end.

---

## Phase 4: User Story 2 - Edit and save: backlinks recompute (Priority: P1) 🎯 MVP-loop

**Goal**: Edit swaps in the raw-Markdown textarea (body-only); Save persists via `POST /api/note`, which recomputes the backlink index in the same request (D6) and answers with it; the view reloads into read mode showing the fresh panel. External on-disk edits produce the inline reload/overwrite choice — never a silent overwrite, never a silent buffer loss.

**Independent Test**: edit note A to add `[[B]]` → Save → read mode shows the saved body; open B → panel lists A with that link text, no manual refresh. Externally modify A's file mid-edit, Save → 409 inline conflict with both controls keyboard-reachable and both disk + buffer intact; Overwrite → saved; Reload → disk version, buffer discarded after confirm.

### Endpoint + tests

- [x] T007 [US2] Create `src/pages/api/note.ts` as a thin adapter (mirror `api/capture.ts`): `POST` parses `{ slug, body, baseHash, force? }` → `readNote` (title/status/tags always disk-truth — body-only edit) → `saveNote(vault, { …current, body }, { baseSlug: slug, baseSnapshot: { slug, mtimeMs, hash: baseHash }, force })` → on success `refreshVaultIndex(resolveVaultDir())` and answer `200 { slug, updated, backlinks }`; map `NoteNotFoundError`→`404 { error:'note-not-found', slug }`, `ExternalEditConflictError`→`409 { error:'external-edit-conflict', disk:{ updated, hash } }`, malformed payload/missing fields→`400 { error:'invalid-payload' }` (nothing written), fs failure→`500 { error:'save-failed', message }`, `GET`→`405`; no path logic, no resolution logic, no git anywhere in this file — Done when: `npm run build` exits 0 and the responses match plan "Interface Contracts" §1 verbatim. (depends: T001)
- [x] T008 [US2] Create `src/pages/api/note.test.ts` invoking the handler directly with `process.env.GARDEN_VAULT_DIR` set to a `mkdtemp` vault (`git init` inside it **plus one seed commit so `git log` has a baseline**): `200` body shape where `backlinks` reflects the just-saved body with no further step (AC2/D6 proof), empty body save → `200`, `404` unknown slug, `400` malformed payload with the vault unchanged, `409 external-edit-conflict` after an external write with stale `baseHash` (file bytes unchanged) then `200` with `force: true`, `500` on unwritable vault, `GET` → `405`, and **`git -C vault log --oneline -1` still showing the seed commit after a save** (Q4 — no commit) — Done when: the suite is green and the full `npm run test` stays green. (depends: T007)

### Client decisions + wiring

- [x] T009 [US2] Create `src/lib/wikilink-client.ts` (DOM-free, F2 `capture-client.ts` pattern — ports for fetch/confirm/navigate/storage) with the edit/save decisions: `editState` helpers (enter edit → prefilled textarea; `markDirty`, `isDirty`), `saveDecision({ inFlight, body })` → `'save' | 'ignore'` (double-save guard) + `savePayload(slug, body, baseHash, force)`, `escapeDecision({ dirty, confirm })` → `'leave' | 'confirm' | 'stay'` (clean → leave immediately, dirty → confirm, cancel stays), `conflictDecision({ choice, confirm })` → reload (confirm first, discards buffer) | overwrite (re-POST with `force: true`), plus `handleSaveResponse` branches (`200` → `location.reload()`; `409` → show conflict region + focus the content-preserving control; `400`/`500` → inline status message, stay, re-enable) — plus `src/lib/wikilink-client.test.ts` covering all branches with mocked ports (payload shape incl. `baseHash`, in-flight guard blocks a second save, 409 keeps buffer per spec US2.4) — Done when: `npx vitest run src/lib/wikilink-client.test.ts` is green. (depends: T001)
- [x] T010 [US2] Wire the edit surface in `src/pages/note/[slug].astro` (page script bundles `src/lib/wikilink-client.ts`): Edit button swaps to `<textarea id="note-editor">` prefilled with the note body + Save/Cancel buttons + `#note-status` (`role="alert"`) + hidden `#note-conflict` region with two real buttons `#conflict-reload` and `#conflict-overwrite`; `keydown Escape` on the page → `escapeDecision` (dirty → `window.confirm`, cancel refocuses the textarea); Save → `saveDecision`/`savePayload` with the `#f3-page-data` snapshot hash → `fetch('/api/note', POST JSON)` → `handleSaveResponse` (`200` → reload to read mode; `409` → conflict region visible, buffer untouched, focus `#conflict-reload`); Overwrite → re-POST with `force: true`; Reload → confirm → `location.reload()`; controls disabled while a save is in flight — Done when: `npm run build` exits 0 and the live flow matches the Independent Test above (save → read mode with fresh panel < 500 ms; stale-hash save → 409 with buffer intact; both conflict controls keyboard-reachable). (depends: T006, T008, T009)

**Checkpoint**: MVP complete (US1 + US2) — AC2 and AC4 demonstrable end to end; no commit is ever created by a save (Q4).

---

## Phase 5: User Story 3 - `[[` autocomplete while editing (Priority: P2)

**Goal**: typing `[[` in the editor opens a popup of existing titles (from the embedded candidates), filtered as you type; Up/Down/Enter/Tab/Esc act only while the popup is open; selecting inserts `[[Title]]`.

**Independent Test**: type `[[` → popup within ~200 ms listing titles; keep typing → filtered case-insensitively; Down/Up move selection; Enter/Tab inserts `[[Title]]` with caret after `]]`; Esc closes the popup only (buffer keeps `[[query`); with the popup closed the same five keys do nothing app-level.

### Tests for User Story 3

- [x] T011 [US3] Extend `src/lib/wikilink-client.ts` + `src/lib/wikilink-client.test.ts` with the autocomplete state machine: `extractQuery(text, caret)` → text between the last unclosed `[[` on the caret's line and the caret (`null` when the construct is closed/absent/newline-crossed), `filterCandidates(query, candidates)` (case-insensitive substring over titles, empty query → all, **order preserved from the page's title-sorted candidates so the popup is deterministic and the first row is the default selection**, slug shown as secondary disambiguation for duplicate titles), `moveSelection(delta, len, current)` (wrapped), `acceptSelection(query, candidate)` → `{ replacement, caret }` replacing the whole `[[query` construct with `[[Title]]`, `dismissAutocomplete()`, and `autocompleteKeyCommand({ key, popupOpen })` → `'up'|'down'|'enter'|'tab'|'escape'|null` — **null for every key when the popup is closed, and never matching any printable key** — Done when: the suite is green including a full printable sweep (a–z, A–Z, 0–9, punctuation) matching no command, the closed-popup truth table for all five keys, deterministic candidate order with first-row default selection, and query/insert edge cases (empty query, no candidates, duplicate titles). (depends: T009)
- [x] T012 [US3] Wire the popup in `src/pages/note/[slug].astro`: a `<div id="wikilink-popup" role="listbox">` rendered from `filterCandidates` over `#f3-page-data.candidates` with option rows (`role="option"`, active row via `aria-activedescendant`), shown only while `extractQuery(...)` is non-null; ONE `keydown` listener on `#note-editor` that consults `autocompleteKeyCommand` first and `preventDefault`s ONLY when it returns non-null (Up/Down move the visual selection, Enter/Tab `acceptSelection` → splice replacement into the textarea + set caret, Esc dismisses the popup only); `input`/`keyup` re-filters and re-positions the popup at the caret; no other handler claims these keys, and printable keys are never intercepted — Done when: `npm run build` exits 0 and the live flow matches the Independent Test (popup < 200 ms after `[[`, insertion lands `[[Title]]`, Esc keeps `[[query`, closed-popup keys inert). (depends: T010, T011)

**Checkpoint**: AC1 functional — connecting is frictionless, keys strictly popup-scoped (PRD F8.4).

---

## Phase 6: User Story 4 - Pending link creates the note on first click (Priority: P2)

**Goal**: clicking a pending marker creates exactly one note (title = target, `seed`/`private`, unique slug) through `POST /api/capture` and navigates to its view; collisions navigate to the existing note; failures show an inline error and change nothing.

**Independent Test**: save a note containing `[[Future Idea]]`, click its pending marker → one note titled "Future Idea" (slug `future-idea`, `status: seed`, `visibility: private`) created and shown at `/note/future-idea`; hammer-click → still one note; a 409 target navigates to the existing note instead.

### Tests for User Story 4

- [x] T013 [US4] Extend `src/lib/wikilink-client.ts` + `src/lib/wikilink-client.test.ts` with `pendingCreateDecision({ inFlight, target })` → `'create' | 'ignore'` (one in-flight per marker) and `handlePendingResponse({ status, body })` → `201 { slug }` → navigate `/note/<slug>`; `409 { slug }` → navigate to the existing note (Q3 defensive collision); `400`/`500` → `{ error: message }` (inline error, stay, marker re-enabled) — with mocked navigate/fetch — Done when: the suite is green for all four branches including the double-click guard (AC3, SC-005). (depends: T011)
- [x] T014 [US4] Wire pending-marker activation in `src/pages/note/[slug].astro`: the markers rendered in T005/T006 get one delegated click handler (plus their native keyboard activation as focusable controls) → `pendingCreateDecision` → `fetch('/api/capture', { method:'POST', body: JSON.stringify({ title: target }) })` → `handlePendingResponse` (navigate on 201/409; on error write `#note-status` and keep the user on the page); `inFlight` cleared on every response path; markers must NOT navigate to `href="#"` themselves (preventDefault) — Done when: `npm run build` exits 0 and the live flow matches the Independent Test (one note per click, 409 → existing note, error → inline message + stay; created note's frontmatter shows `status: seed`, `visibility: private`, empty body). (depends: T012, T013)

**Checkpoint**: all four stories functional; every AC has automated + live evidence.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T015 [P] Run the D8 validation gate end to end in the build worktree: `npm install`, `npm run test` (every suite — extended F1 + F2 untouched suites + new render/wikilink/api-note suites), `npm run build`; verify with `git status --short` that the unchanged-file list from "Binding constraints" is untouched, that `src/lib/notes.ts`'s diff is confined to `resolveWikiLink`, that nothing is staged, and that the repo's own `vault/` has no new files — Done when: all three commands exit 0 and the evidence is recorded in the completion report.
- [x] T016 [P] Verify the loopback/offline posture (FR-010, SC-007): no `server.host` in `astro.config.mjs`, no `--host` anywhere, no outbound `fetch`/network code in `src/lib/wikilink-client.ts` or `src/lib/render.ts` (same-origin POSTs only), and while `astro dev` runs no non-loopback listener exists for the app port (`awk '$4=="0A"{print $2}' /proc/net/tcp{,6}`) — Done when: the evidence is recorded; any outbound call found in the feature path is reported as a blocker, not silently patched.
- [x] T017 [P] Execute the scripted browser checklist from `plan.md` "Validation & Quickstart" (steps 1–7) against a hermetic temp vault, launching Chromium with `executablePath: '/opt/hermes/tools/chromium-1208/chrome-linux/chrome'` (plan R8 — default headless-shell revision is absent on this host; run the script from the scratch dir, add NO files to the repo): view timing < 500 ms, popup < 200 ms, full keyboard reachability, autocomplete key scoping, pending-create single-note proof, external-conflict flow, AC4 canonical-variant rendering, loopback listener check — Done when: each step's outcome (pass/fail with measurements) is written into the completion report; any failure becomes a follow-up card rather than a silent skip.
- [x] T018 [P] Update project documentation (AGENTS.md: "update docs when behavior or interfaces change"): `README.md` gains the `/note/[slug]` reading/edit view, the canonical resolution rules (slug → title → slugify-equivalence), the backlinks panel + pending-link flow, `POST /api/note`, and the explicit "edit saves do not commit until F9 ships" gap note — Done when: the docs match the shipped behavior and `npm run build` still exits 0. (no `*.astro`/`*.ts` behavior changes in this task)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 blocks everything (fresh worktree, no `node_modules`); T002 is independent config work.
- **Foundational (Phase 2)**: depends on Setup; T003 blocks US1 (renderer/panel resolution) and US3 (insert must match resolution).
- **User Stories**: US1 → US2 → US3 → US4 — not because the stories are conceptually coupled, but because they accumulate in the same two files (`src/pages/note/[slug].astro`, `src/lib/wikilink-client.ts`) and each story's surface is the next story's prerequisite (popup needs the editor; pending markers ship with the view but are activated last).
- **Polish**: after all stories are complete (T015–T018 are mutually parallel).

### Shared-file chains (MUST run in the listed order — one card at a time per file)

- `src/pages/note/[slug].astro`: T005 → T006 → T010 → T012 → T014
- `src/lib/wikilink-client.ts` + `wikilink-client.test.ts`: T009 → T011 → T013
- `src/lib/notes.ts` + `notes.test.ts`: T003 (single surgical hunk)
- `src/lib/render.ts` + `render.test.ts`: T004 (single line)
- `src/pages/api/note.ts` + `note.test.ts`: T007 → T008
- Config/docs (own files): T001, T002, T018

### Within Each User Story

- Endpoint/tests before the page wiring that consumes them (T007 → T008 → T010).
- Story complete (build + suites green) before moving to the next priority.
- US1+US2 together = the MVP checkpoint (AC2 + AC4); then US3 (AC1), then US4 (AC3).

### Parallel Opportunities

- After T001: T002 (yaml) ∥ T003 (notes.ts) ∥ T007 (endpoint) touch three different files.
- After T003: T004 (render) and T007/T008 (endpoint) run in parallel; T005 joins when T004 lands.
- US3 and US4 test lines (T011, T013) extend `wikilink-client.ts` in chain order; their page wiring serializes into `note/[slug].astro`.
- Polish: T015, T016, T017, T018 are all [P].

## Parallel Example: fan-out for the build card's delegate_task

```text
Chain A (F1 module):   T003  resolveWikiLink three-tier + tests
Chain B (renderer):    T004  render.ts + tests                     (after A)
Chain C (endpoint):    T007 → T008  api/note.ts + contract tests   (after T001)
Chain D (client lib):  T009 → T011 → T013  wikilink-client.ts + tests (after T001; T011 after T009)
Chain E (page):        T005 → T006 → T010 → T012 → T014  note/[slug].astro (after B; integrates D)
Chain F (config/docs): T001 → T002, later T018
# integrate → Phase 7 gate (T015) → live checks (T016, T017)
```

## Implementation Strategy

### MVP first (US1 read view, then US2 save — the demoable loop)

1. Phase 1: Setup (T001 → T002) — install + validation gate.
2. Phase 2: Foundational (T003) — canonical resolution.
3. Phase 3: US1 → **STOP and VALIDATE**: rendered links + pending markers + backlinks panel on a temp vault.
4. Phase 4: US2 → **STOP and VALIDATE**: edit → save → panel recompute with zero manual refresh, conflict flow proven.
5. Phase 5–6: US3, US4 → AC1/AC3 evidence.
6. Phase 7: gate + browser checklist + docs.

### Incremental delivery

- US1 → US2 delivers the network promise (AC2 + AC4); US3 adds authoring acceleration (AC1); US4 closes the create-on-click loop (AC3).
- Every checkpoint is independently testable (`npm run test` + `npm run build` + the quickstart smoke), and each story adds value without breaking the previous ones.

## Notes

- **Line = one implement card**: every task carries its own file paths and done-when so the orchestrator can fan out without re-deriving context; spec.md is the authority on any behavioral question this file does not answer.
- **Tests-first convention**: relaxed exactly as in F2 — each implementation line pairs with its unit-test file and is done when that suite is green; the endpoint contract suite keeps its own line (T008).
- **D6 is provable, not aspirational**: T008 asserts the `200.backlinks` payload reflects the just-saved body with no further step — that assertion IS AC2's automated evidence.
- **`notes.ts` is F3's only sanctioned F1-module edit** (D2 proven gap): if a change seems to need more than `resolveWikiLink`, stop and comment/block — do not widen it.
- **No third endpoint**: pending-create rides on `POST /api/capture` (plan R5/contract §4); saving rides on `POST /api/note`. If either contract looks wrong, that is an ANALYZE finding (plan verdict = yes), not a task-time invention.
- **No Playwright specs/config**: browser evidence is T017's one-off scripted run from the scratch dir; adding `*.spec.ts` would collide with vitest's default include (plan R8).
- **Hotspot discipline**: `src/pages/note/[slug].astro` and `src/lib/wikilink-client.ts` are shared across stories — strictly one worker per chain, in listed order; if two chains keep colliding in one file, leave a `hotspot:` comment on the card instead of piling on.
- **Never**: commit/push (D9), write to the repo's own `vault/`, bind a non-loopback address, modify the F2 read-only file list, or silently drop the Q4 "no commit on save" rule.
