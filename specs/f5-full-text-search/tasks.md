---

description: "Task list for F5 Full-Text Search — pure search.ts + search-shortcut.ts decision modules, /search page with tolerant embed, per-page Ctrl-K wiring, freshness, keyboard scope, perf evidence"
---

# Tasks: F5 Full-Text Search

**Input**: Design documents from `/specs/f5-full-text-search/` — `spec.md` (clarified 2026-10-24, 4 user stories + 4 headless clarifications) + `plan.md` (Research R1–R8, Data Model, Interface Contracts §1–§4, file-by-file changes, Validation & Quickstart). Per the card's F4-parity artifact set, the usual `research.md` / `data-model.md` / `contracts/` / `quickstart.md` are consolidated into `plan.md` — nothing is missing.

**Prerequisites**: `plan.md` (present), `spec.md` (present). `.specify/memory/constitution.md` is an unfilled `[PROJECT_NAME]` template → no gates. `.specify/extensions.yml` does not exist → `before_tasks` / `after_tasks` hook stages skipped silently (pre-check and mandatory post-check both performed).

**Tests**: Requested by this feature (FR-012 validation includes `npm run test`; spec SC-001–SC-006 demand automated evidence; plan R8). Unit tests are paired with the implementation line that turns them green; the vitest suites are the contract. Ordering convention under "Notes".

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently. Every line is standalone: what to change, the exact file paths, and a done-when check — one line = one implement unit. **This file is the self-contained handoff for the build card (t_6367dde7): do not re-spec; if a line contradicts spec.md/plan.md, treat spec.md as authority and comment/block rather than invent scope.**

## Format: `[ID] [P?] [Story] Description — Done when: …`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4 from `spec.md`; Setup / Foundational / Polish carry no story label
- **Done when**: the acceptance check the implementer must satisfy before the card may close

## Binding constraints (do not re-decide)

- **D1–D8** (parent card t_9ae936d6, identical in every sibling card): client-side MiniSearch from existing `SearchDoc[]` via `buildSearchDocs`/`refreshVaultIndex`, no new server index endpoint, indexed title (boosted) + body + tags, displayed title + slug + tags + snippet (D1); `/search` = `src/pages/search.astro` on Base layout, input focused, no prior query, server embeds `SearchDoc` JSON via TOLERANT per-note read (never `refreshVaultIndex`-throws-500 the page), client constructs MiniSearch in browser (D2); Ctrl/⌘-K from any view → `/search` focused, modifier-only, no bare printable binding (D3); generic `refreshVaultIndex` is THE save hook (next `/search` load reflects edit/delete within one save cycle + in-memory re-add/replace path), keep it generic, NEVER fork a second hook — F6 consumes this one (D4); archived notes STAY indexed with status flag, filtered by default behind a filter; `visibility` carried for F10/F18, v1 serves all on localhost (D5); snippet ~160 chars around first body match, escaped HTML, `<mark>` highlight, title boost, prefix/fuzzy defaults tuned in planning (D6); ArrowUp/Down + Enter ONLY inside results-panel focus scope, container-scoped listeners, no document-global hijack (D7); this feature OWNS `src/lib/search.ts` + `src/pages/search.astro` (+ minimal client wiring, DOM-free-port pattern), may READ `notes.ts`/`vault.ts`/`dashboard.ts` but MUST NOT change `buildSearchDocs`/`refreshVaultIndex` shapes or `Base.astro`/`global.css`, no commits — ship is parent-level (D8).
- **Clarifications (spec, locked)**: Q1 MiniSearch config `fields: ['title','body','tags']`, `boost: { title: 2 }`, `idField: 'slug'`, `storeFields: ['title','slug','tags','status']`, `extractField` joins `tags` with spaces, `prefix: true`, `fuzzy: 0.2` (`combineWith: 'AND'` per plan R1). Q2 shortcut lives in shared `src/lib/search-shortcut.ts` (DOM-free predicate + wiring helper) imported by each page's own `<script>` (`index.astro`, `note/[slug].astro`, `new.astro`, `status/[state].astro`, `search.astro` guard) — `Base.astro` untouched. Q3 snippet fallback for title/tag-only hits = leading ~160 body chars (escaped, no `<mark>`). Q4 perf protocol = keystroke-to-rendered-results p95 over 5 queries × cold+warm in scripted Chromium on a deterministic seeded 1k-note temp vault.
- **Contracts in `plan.md` are binding**: `search.ts` export surface (Interface Contracts §1 — `SEARCH_OPTIONS`, `SEARCH_DEFAULTS`, `buildSearchIndex`, `searchIndex`, `buildSnippet`, `upsertDoc`, `removeDoc`, `resultsKeyCommand`, `moveSelection`, `escapeHtml`; type-only import of `SearchDoc`); `search-shortcut.ts` surface (§2 — `shouldOpenSearch`, `wireSearchShortcut` with unwire return); `/search` page contract (§3 — element ids `#search-docs`/`#search-input`/`#search-archive`/`#search-results`/`#search-empty`, empty-prompt + zero-match copy verbatim, row shape, page-scoped styles); perf protocol (§4 — seeded generator shape, 5 queries, p95 < 300 ms evidence in build report).
- **File boundaries**: `src/lib/notes.ts` MUST stay **ZERO-hunk** (D1/D5 consume-only; a needed change there is a spec finding — stop and comment/block); `src/lib/vault.ts`, `src/lib/dashboard.ts`, `src/lib/status-list.ts`, `src/lib/wikilink-client.ts`, `src/lib/capture-client.ts`, `src/lib/render.ts`, `src/lib/capture.ts`, `src/layouts/Base.astro`, `src/styles/global.css`, `astro.config.mjs`, `package.json`/`package-lock.json`, `.ainative/project.yaml` are read-only for F5. Existing test files gain additive cases only (no existing assertion touched).
- **No commits/push from these tasks** (D8): verification runs against temp vaults (`GARDEN_VAULT_DIR=$(mktemp -d)` + seeded files); nothing is committed to `digitalgarden/t_9ae936d6-f5-full-text-search`; the repo's own `vault/` gains no files.
- **Workspace**: build in the SHARED worktree `/opt/data/mnt/workspace/digitalGarden/.worktrees/t_9ae936d6` (branch `digitalgarden/t_9ae936d6-f5-full-text-search`, base 921752c). `node_modules/` is already installed (spec session baseline: `npm install` 0, `npm run test` 203/204 with ONLY the known `note.test.ts` unwritable-vault failure, `npm run build` 0). Check `git status` first; preserve unrelated changes; only `specs/f5-full-text-search/` is expected dirty from this spec chain.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: prove the gate baseline in the shared worktree before anything changes — nothing else runs without this.

- [x] T001 [P] Re-run the gate in `/opt/data/mnt/workspace/digitalGarden/.worktrees/t_9ae936d6` as the pre-change baseline — `npm install` (expect no-op, zero dependency changes), `npm run test` (expect 203/204 with ONLY the known `note.test.ts` "500: unwritable vault fails loudly" failure — root bypasses chmod, spec Finding 6), `npm run build` (expect exit 0) — and record `git status --short` (expect clean apart from `?? specs/f5-full-text-search/`) — Done when: all three commands report as expected and the evidence is in the completion report; any OTHER failure is a blocker reported on the build card, not fixed here; this task blocks every other task.
- [x] T002 [P] Verify the no-churn claims before writing code: `.ainative/project.yaml` already lists `npm install`, `npm run test`, `npm run build` in order (FR-012 — confirm, do not edit); `npm ls --depth=0` shows minisearch@7.2.0 and no added/removed packages versus `package.json` (zero dependency changes, plan Technical Context); `git diff --stat src/lib/notes.ts src/layouts/Base.astro src/styles/global.css` is empty (the D8 zero-hunk baseline) — Done when: all three checks pass and their output is recorded; any mismatch is a blocker reported on the card, not fixed here.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: lock the pure decision modules both user stories build on — the MiniSearch contract (R1/R2) and the shortcut predicate (R3) — so page wiring has tested seams to call.

- [x] T003 Create `src/lib/search.ts` (pure, DOM-free, type-only `SearchDoc` import from `./notes` — no runtime notes.ts dependency) exporting the plan contract §1 verbatim: `SEARCH_OPTIONS` (fields/boost/idField/storeFields/extractField-join per Q1), `SEARCH_DEFAULTS` (`prefix: true, fuzzy: 0.2, combineWith: 'AND'` per R1), `buildSearchIndex(docs)` (new MiniSearch + addAll), `searchIndex(index, query, { archiveShown })` (empty/whitespace → `[]`; archived `status` filtered unless `archiveShown`), `buildSnippet(body, terms)` (R2: earliest case-insensitive hit window ~160 chars word-clamped, escape-then-mark first hit only; no-hit → escaped leading ~160 chars `matched:false`; empty body → `{ html:'', matched:false }`), `upsertDoc`/`removeDoc` (replace-or-append / drop-by-slug, inputs never mutated), `resultsKeyCommand({ key, panelFocused })` (non-null only when panelFocused + ArrowUp/ArrowDown/Enter), `moveSelection` (F3 wrap discipline), `escapeHtml` (`& < > "`) — Done when: the module imports `minisearch` (first code behind the installed package) and `npm run build` exits 0. (depends: T001)
- [x] T004 [P] Create `src/lib/search.test.ts` (plain vitest, no browser, no MiniSearch mocks — real MiniSearch over fixture `SearchDoc[]`) covering: title-match outranks body-only match for the same term (boost 2); tag-term matches via the `extractField` join; `idField` slug identity (`discard`+re-`add` replaces by slug); empty/whitespace query → `[]`; archived filtered by default + included with `archiveShown: true`; `buildSnippet` window contains the term wrapped in exactly one `<mark>` with surrounding context ≤ ~180 chars, HTML in body/query escaped (assert `<script>`/`<img onerror>` appear as text), title-only-hit fallback returns leading excerpt with `matched:false`, empty body → empty html; `upsertDoc`/`removeDoc` replace/append/drop without mutating inputs; `resultsKeyCommand` truth table (panelFocused=false → always null; each of the 3 keys → command when focused; every other key → null); `moveSelection` wrap at both ends; `escapeHtml` all four characters — Done when: `npx vitest run src/lib/search.test.ts` is green. (depends: T003)
- [x] T005 [P] Create `src/lib/search-shortcut.ts` (pure, DOM-free, F2/F3 port pattern) exporting the plan contract §2 verbatim: `shouldOpenSearch({ key, ctrl?, meta?, alt?, shift? })` → true iff `(key==='k'||key==='K') && (ctrl||meta) && !alt && !shift` (deliberately NO field/editable guard — R3: modified keystrokes never type), plus `wireSearchShortcut(navigate)` registering the document keydown listener and returning an unwire function — plus `src/lib/search-shortcut.test.ts`: `k`+ctrl → true, `K`+meta → true, bare `k`/`K` → false, `k`+ctrl+shift → false, `k`+ctrl+alt → false, `Enter`+ctrl → false, `c`+ctrl → false; `wireSearchShortcut` fires navigate(`/search`) on a matching dispatch and never on a non-match, unwire stops delivery — Done when: `npx vitest run src/lib/search-shortcut.test.ts` is green. (depends: T001)

**Checkpoint**: foundation locked — MiniSearch config, snippet, key router, and shortcut predicate are provable without a browser; page work can begin.

---

## Phase 3: User Story 1 — Open search from anywhere with the keyboard (Priority: P1) 🎯 MVP-open

**Goal**: `/search` exists, opens focused + empty, and Ctrl/⌘-K reaches it from every app view without disturbing any existing binding.

**Independent Test**: from `/`, `/note/<slug>`, `/new`, `/status/seed`, press Ctrl/⌘-K → `/search` loads with `#search-input` focused and empty each time; type bare `k` into a capture field → types, never navigates; open `/search` directly by URL → focused + empty.

- [x] T006 [US1] Create `src/pages/search.astro` (server-rendered, `Base.astro` layout, page-scoped `<style>` only) with the plan contract §3 server half: tolerant per-note read copied from `index.astro:26-35` (`listNoteSlugs` → `readNote` per slug in try/catch, skip broken — NOT `refreshVaultIndex`), `buildSearchDocs(notes)`, JSON embed `<script type="application/json" id="search-docs">`; markup: `<h1>Search</h1>`, `<input id="search-input" type="search" aria-label="Search notes" autocomplete="off" placeholder="…">`, `<label><input type="checkbox" id="search-archive"> Include archived</label>`, `<div id="search-results" role="listbox" aria-label="Search results">`, `<p id="search-empty">` with the empty-prompt copy "Type to search your garden — title, body, and tags."; script focuses the input on load (`autofocus` + `.focus()` fallback) and wires the Q2 self-guard listener — Done when: `npm run build` exits 0 and `/search` on a temp vault renders focused input + empty-prompt state with healthy notes embedded and a planted corrupt file skipped (no 500). (depends: T003)
- [x] T007 [US1] Wire the Ctrl/⌘-K shortcut into the four existing pages (R3, ADDITIVE one-import-one-call each in their existing `<script>`, no other line touched): `src/pages/index.astro`, `src/pages/new.astro`, `src/pages/note/[slug].astro`, `src/pages/status/[state].astro` each gain `import { wireSearchShortcut } from '../lib/search-shortcut'` (path adjusted per file depth) + `wireSearchShortcut((url) => location.assign(url))` — Done when: `npm run build` exits 0 and the live flow matches US1 scenarios 1–4 (Ctrl-K and ⌘-K from each of the 4 pages → `/search` focused+empty; bare `k` in capture/note fields types; direct-URL open focused+empty; existing `c` / `Ctrl+Enter` / `Esc` bindings still behave). (depends: T005, T006)

**Checkpoint**: At this point, US1 is fully functional and testable independently — the search view opens focused from everywhere; results wiring (US2) is the only gap.

---

## Phase 4: User Story 2 — Type a query, get ranked results with snippets (Priority: P1)

**Goal**: typing runs the client MiniSearch query and renders ranked rows (title link + highlighted escaped snippet + tags) with archive filtering, empty states, and zero-match honesty.

**Independent Test**: seed notes with distinctive words in title-only / body-only / tags-only positions; type each query → title-hit outranks body-hit, every row shows title link + `<mark>` snippet + tags; nonsense query → `No notes match "<query>" — try different words.`; cleared input → empty-prompt state; archive off → no archived rows, on → archived rows with state shown.

- [x] T008 [US2] Wire the client query flow in `src/pages/search.astro` (R5, page `<script>` only — no new files): parse `#search-docs` → `buildSearchIndex` + `Map<slug, SearchDoc>` → debounced (~100 ms) input handler (empty/whitespace → empty-prompt state; else `searchIndex` + row render); rows built with `createElement`/`textContent` (never `innerHTML` with dynamic data — only the pre-escaped `buildSnippet` html is assigned); each row: `<a href="/note/<slug>">` title + snippet paragraph + tag list + (when shown) archived badge reusing the dashboard `.badge[data-status]` classes; zero-match → the §3 copy with the escaped query; `?q=` param (if present) only pre-fills the input and runs the same client search (never a second read path) — Done when: `npm run build` exits 0 and the live flow matches US2 scenarios 1–2/4–6 (ranking, row shape, empty-prompt, named zero-match, snippet fallback on title/tag-only hits). (depends: T004, T006)
- [x] T009 [US2] Prove US3's read-side half through the page just built (AC3 next-load freshness + malformed tolerance, R4/R5): with the app running on a temp vault, edit a note's distinctive word via the existing save path and delete (trash) another note → reload `/search` → the edited note matches only the new word and the deleted note matches nothing; plant one corrupt note file → `/search` still renders every healthy note and query (no 500); verify `refreshVaultIndex` itself is untouched (generic hook — F5 adds no second hook, F6 consumes this one) — Done when: the scripted checklist steps 3f–3g pass with evidence recorded and `git diff --stat src/lib/notes.ts` is still empty. (depends: T008)

**Checkpoint**: At this point, US1 AND US2 are both functional — open, type, ranked rows, freshness, tolerance.

---

## Phase 5: User Story 3 — The index stays fresh across edits and deletes (Priority: P1)

**Goal**: D4's session half — in-memory re-add/replace so the current `/search` session reflects saves without a reload — is wired and proven alongside the next-load path.

**Independent Test**: with `/search` open, save an edit to a note in another tab (same vault) then re-query the open page after its session refresh → edited content matches; delete a note → re-query → gone; reload → same results (both layers agree).

- [x] T010 [US3] Wire the in-memory session refresh in `src/pages/search.astro` (D4/R5, page `<script>` only): after any app save that returns fresh `SearchDoc`-shaped data for the session (or on `pageshow`/`visibilitychange` re-read of the embed contract where available — plan leaves the trigger to implementation, tasks pin the test: the chosen trigger MUST be same-origin, vault-read-only, and never a new endpoint), apply `upsertDoc`/`removeDoc` to the local docs array plus `index.replace`/`index.discard` on the live MiniSearch instance, then re-run the current query so visible results update with no reload — Done when: the live flow matches US3 scenarios 1–2/4 (edit reflected, deleted gone, no manual reindex, no commit introduced) and the session path agrees with a reload. (depends: T008)

**Checkpoint**: All P1 stories functional — open (US1), query (US2), fresh (US3).

---

## Phase 6: User Story 4 — Keyboard-navigate results without hijacking the page (Priority: P2)

**Goal**: container-scoped ArrowUp/Down + Enter move/open results only inside the panel; everything else on the page keeps native key behavior; full keyboard reachability with labels.

**Independent Test**: run a query, Tab into the panel, ArrowDown ×2 + Enter → third-row note opens; click into the input, arrows → caret moves, highlight frozen; focus outside panel, arrows → nothing; Tab-only run reaches input → filter → panel with visible focus + labels.

- [x] T011 [US4] Wire the results keyboard scope in `src/pages/search.astro` (D7/R6, page `<script>` + page-scoped `<style>` only): ONE `keydown` listener ON `#search-results` (container-scoped — never document-global) routing through `resultsKeyCommand({ key, panelFocused: true })`; selection index with `moveSelection` wrap discipline, highlight via `aria-activedescendant` + `aria-selected` + a visible CSS class; Enter → `location.assign('/note/' + slug)`; focus in `#search-input` or anywhere outside the panel keeps fully native behavior (no document arrow/Enter listener anywhere in the feature path) — Done when: the live flow matches US4 scenarios 1–4 and the F2/F3 printable-key sweep still passes (no new bare bindings). (depends: T008)

**Checkpoint**: All user stories independently functional — US4 adds scoped keyboard nav without touching US1–US3 behavior.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: perf evidence, posture checks, docs, and the final gate — nothing here changes behavior.

- [x] T012 [P] Run the Q4 perf protocol (plan contracts §4) and record the evidence: deterministic seeded generator (1,000 real files, ~200-word bodies, 1–3 tags, 10% archived, 1 corrupt + 1 empty-body note) in a temp vault → `astro dev` on a temp port → scripted Chromium (executablePath `/opt/hermes/tools/chromium-1208/chrome-linux/chrome` — verify presence first, record if moved) → 5 queries (title-hit, body-hit, tag-hit, multi-word, zero-match) × cold load + warm re-type ×3 → keystroke-to-rendered-rows ms per run + p95 — Done when: p95 < 300 ms with per-query numbers in the build report; a miss is a recorded follow-up (plan R7), never a silent skip or speculative optimization. (depends: T008)
- [x] T013 [P] Verify the loopback/offline + keyboard posture (FR-011, SC-006): no `server.host` in `astro.config.mjs`, no `--host` anywhere, no outbound `fetch`/network code in the F5 feature path (docs are embedded server-side; MiniSearch runs in-page; shortcut navigates same-origin only) — and while `astro dev` runs, no non-loopback listener exists for the app port — plus the printable-key sweep (bare `k`/`K`/arrows/Enter in fields behave natively on every F5-touched page) — Done when: the evidence is recorded; any outbound call or hijacked key in the feature path is reported as a blocker, not silently patched. (depends: T007, T011)
- [x] T014 [P] Update project documentation (AGENTS.md house rule: update docs when behavior or interfaces change): `README.md` gains the F5 surface — `/search` + Ctrl/⌘-K shortcut, title/body/tag index with title boost, snippet + archive-filter row shape, one-save-cycle freshness via the generic `refreshVaultIndex` hook (F6 consumes it), container-scoped results keys, the Q4 perf result, and the explicit "search never writes/commits" note — Done when: the docs match the shipped behavior and `npm run build` still exits 0 (no `*.astro`/`*.ts` behavior changes in this task). (depends: T008, T011)
- [x] T015 [P] Run the D7-equivalent final gate after all changes: `npm install` (expect no-op), `npm run test` (every suite — expect all green except the known `note.test.ts` unwritable-vault failure, which must be unchanged-or-fixed but never worsened), `npm run build` (expect exit 0); verify with `git status --short` / `git diff --stat` that `src/lib/notes.ts`, `src/layouts/Base.astro`, `src/styles/global.css`, `.ainative/project.yaml`, `package.json`/`package-lock.json` are untouched (zero hunks, zero dependency changes), nothing is staged, and the repo's own `vault/` has no new files — Done when: all commands exit as expected and the evidence is in the completion report. (depends: T010, T011, T012, T013, T014)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001 blocks everything; T002 parallel with T001.
- **Foundational (Phase 2)**: Depends on T001 — T003 (search.ts) then T004 (its tests); T005 (shortcut) parallel with T003/T004 (different files).
- **US1 (Phase 3)**: T006 (page shell) depends on T003; T007 (wirings) depends on T005 + T006.
- **US2 (Phase 4)**: T008 depends on T004 + T006; T009 depends on T008.
- **US3 (Phase 5)**: T010 depends on T008.
- **US4 (Phase 6)**: T011 depends on T008.
- **Polish (Phase 7)**: T012 depends on T008; T013 depends on T007 + T011; T014 depends on T008 + T011; T015 depends on all of T010–T014.

### User Story Dependencies

- **US1 (P1)**: Starts after Foundational — no dependencies on other stories. MVP-open: open + focused + shortcut.
- **US2 (P1)**: Needs US1's page shell (T006) — query + rows + freshness-read-side.
- **US3 (P1)**: Needs US2's client flow (T008) — session refresh layer.
- **US4 (P2)**: Needs US2's client flow (T008) — scoped keys; independently testable once rows render.

### Within Each User Story

- Tests pair with implementation (T004 tests T003; T005 is self-testing); page tasks carry their own live verification.
- Pure modules before page wiring (T003/T005 → T006/T007 → T008 → T010/T011).
- Story complete before next priority; Polish only after all stories.

### Parallel Opportunities

- T001 + T002 (setup, different checks); T003 + T005 (different files); T004 later parallel with T005; T012/T013/T014/T015 paths parallel once their deps land (T015 last).
- US3 (T010) and US4 (T011) parallel after T008 (different concerns, same file — sequence the edits, not the verification).

---

## Parallel Example: Foundational

```bash
# Two writers, two files, no conflicts:
Writer A: T003 src/lib/search.ts → T004 src/lib/search.test.ts
Writer B: T005 src/lib/search-shortcut.ts + src/lib/search-shortcut.test.ts
# Page work (T006+) starts when A+B land.
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Setup (T001 gate + T002 no-churn)
2. Complete Phase 2: Foundational (T003/T004 search.ts + tests, T005 shortcut + tests)
3. Complete Phase 3: US1 (T006 page shell + T007 shortcut wirings)
4. Complete Phase 4: US2 query flow (T008) + read-side freshness (T009)
5. **STOP and VALIDATE**: open from everywhere → type → ranked rows → freshness → tolerance (US1–US2 independent tests)

### Incremental Delivery

1. Setup + Foundational → decision modules proven without a browser
2. + US1 → search opens focused from everywhere (MVP-open)
3. + US2 → query + ranked rows + freshness (MVP-usable)
4. + US3 → session refresh without reload
5. + US4 → scoped keyboard nav
6. + Polish → perf evidence + posture + docs + final gate

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (A: T003/T004, B: T005)
2. Once Foundational is done:
   - Developer A: US1 page shell (T006) → US2 flow (T008)
   - Developer B: US1 wirings (T007, needs T005+T006) → US4 keys (T011, needs T008)
   - Developer C: US3 session refresh (T010) + perf harness (T012) once T008 lands
3. Stories complete and integrate independently; T015 gates the close.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Tests pair with implementation (vitest green is the done-when, not an afterthought)
- Commit after each task or logical group — BUT NOT IN THIS CHAIN: no commits from these tasks (D8 — ship is parent-level); "commit" in the template means checkpoint the worktree state for the build report
- Stop at any checkpoint to validate the story independently
- Avoid: vague tasks, cross-story dependencies that break independence, touching read-only files, adding dependencies, forking a second save hook
