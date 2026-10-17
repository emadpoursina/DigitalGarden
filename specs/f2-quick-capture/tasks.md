---

description: "Task list for F2 Quick Capture — /new capture page, save+commit path, dashboard shortcut + recent notes, title-conflict UX, focus discipline, tests"
---

# Tasks: F2 Quick Capture

**Input**: Design documents from `/specs/f2-quick-capture/` — `spec.md` (clarified 2026-10-16, 4 user stories) + `plan.md` (Research R1–R8, Data Model, Interface Contracts, file-by-file changes, AC verification matrix). Per D6 the usual `research.md` / `data-model.md` / `contracts/` / `quickstart.md` are consolidated into `plan.md` — nothing is missing.

**FLOW_ID**: `flow_20261015_2154_f2qc9x`

**Prerequisites**: `plan.md` (present), `spec.md` (present). `.specify/memory/constitution.md` is an unfilled `[PROJECT_NAME]` template → no gates. `.specify/extensions.yml` does not exist → `before_tasks` / `after_tasks` hook stages skipped silently (pre-check and mandatory post-check both performed).

**Tests**: Requested by this feature (D5 + spec test scenarios + plan's test matrix). Unit tests are paired with the implementation line that turns them green; the integration/contract suites have their own lines (T011, T020). Ordering convention is documented under "Notes".

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently. Every line is standalone: what to change, the exact file paths, and a done-when check — one line = one implement card.

## Format: `[ID] [P?] [Story] Description — Done when: …`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4 from `spec.md`; Setup / Foundational / Polish carry no story label
- **Done when**: the acceptance check the implementer must satisfy before the card may close

## Binding constraints (do not re-decide)

- **D1–D7** (parent card t_fb2bd371, identical in every sibling card): `/new` = quick-capture page, dashboard `/` gets the shortcut + recent notes (D1); save via F1 `createNote` with `status:'seed'`, `visibility:'private'`, `slugify` + `resolveUniqueSlug`, `SlugConflictError` → HTTP 409 → open `/note/<slug>` or save-as-new-unique-slug (D2); commit `docs(note): capture <slug>` via simple-git, save+commit < 1 s, no git → save + warn once (D3); keyboard rules — dashboard-scoped `c` (inert in inputs), `/new` autofocuses, capture-open ⇒ bare keys type only, `Esc` → dashboard (D4); validation `npm run test` + `npm run build`, loopback bind only, never `host: true` / `--host` (D5); F1 base `src/lib/notes.ts` + `src/lib/notes.test.ts` (D7).
- **Contracts in `plan.md`** are binding: `POST /api/capture` request/response schema (Interface Contracts §1), `GARDEN_VAULT_DIR` resolution (§2), the simple-git `allowEnvironment` commit recipe with `add` + `commit(message, [file])` and a ~900 ms timeout (§3, Research R3/R4) — without the 4-key identity allowlist the commit can never succeed on this host.
- **Read-only files**: `src/lib/notes.ts`, `src/lib/notes.test.ts`, `src/layouts/Base.astro`, `src/styles/global.css` — never modified (D7).
- **No commits/push from these tasks**: the feature's runtime git commits are exercised only against temp vaults (`GARDEN_VAULT_DIR=$(mktemp -d)` + `git init`); nothing is committed to `digitalgarden/t_fb2bd371-f2-quick-capture`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: make the project installable and server-capable — nothing else runs without this (the worktree has no `node_modules` yet, and Astro refuses to build/serve any on-demand route without an adapter, plan R1).

- [X] T001 [P] Add `"@astrojs/node": "^11.1.8"` to `dependencies` in `package.json` and run `npm install` in `/opt/data/mnt/workspace/digitalGarden/.worktrees/t_fb2bd371` — Done when: install exits 0, `node_modules/` exists, `package-lock.json` diff contains only the `@astrojs/node` subtree, and the lock keeps `astro@7.3.8` + `simple-git@4.0.2`; this task blocks every other task (no `node_modules` exists today).
- [X] T002 Configure `astro.config.mjs` for SSR: `output: 'server'` with `adapter: node({ mode: 'standalone' })` (import `node` from `@astrojs/node`), and extend the file's existing loopback comment with "never `server.host: true`, never `--host`" (plan R1/R7) — Done when: `npm run build` exits 0 and logs `output: "server"` with the `@astrojs/node` adapter, and no `server.host` key exists in the config. (depends: T001)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the one contract every on-demand route needs before any story work — how a process resolves its vault directory (plan R6; no config module exists in the repo today).

- [X] T003 [P] Create `src/lib/vault.ts` exporting `resolveVaultDir()` — non-empty `process.env.GARDEN_VAULT_DIR` wins, else `join(process.cwd(), 'vault')` — plus `src/lib/vault.test.ts` covering: env override wins, default resolves to `<cwd>/vault`, empty/whitespace override falls back to the default — Done when: `npx vitest run src/lib/vault.test.ts` is green, and this is the only vault-path resolver in the app (later tasks import it, they do not re-implement path logic). (depends: T001)

**Checkpoint**: foundation ready — user story implementation can begin.

---

## Phase 3: User Story 1 — One-keystroke capture from the dashboard (Priority: P1) 🎯 MVP-open

**Goal**: pressing `c` on the dashboard (or clicking the visible Capture link) lands on `/new` with the caret already in the capture title; direct URL access also autofocuses.

**Independent Test**: open `/`, press `c` with nothing focused → `/new` opens with the title input focused and typing lands text, zero further keystrokes; separately click the header Capture link → same focused state; load `/new` directly → focused with no keypress. `c` typed inside any input does NOT open capture.

### Implementation for User Story 1

- [X] T004 [US1] Create `src/pages/new.astro` quick-capture shell using `src/layouts/Base.astro` + page-scoped `<style>` only: `<form id="capture-form">` with `#capture-title` (`<input autofocus>` plus an explicit `.focus()` on load, `aria-label="Title"`), `#capture-body` (`<textarea>` for raw Markdown), `#capture-tags` (`<input>`, `aria-label="Tags (comma-separated)"`), a visible Save `<button type="submit">`, a `#capture-status` region (`role="alert"`) and a hidden `#capture-conflict` region (`role="alert"`) holding `#save-as-new` (first in DOM) and `#open-existing` buttons; NO submit or key script yet (T016/T019/T022 add it) — Done when: `npm run build` exits 0 and a served GET `/new` returns the form with the caret in `#capture-title` on load with zero keypresses (SC-001, plan §1). (depends: T002)
- [X] T005 [US1] Replace the scaffold body of `src/pages/index.astro` with a header whose first focusable element is `<a href="/new" id="capture-entry">Capture</a>` — the visible, keyboard-reachable entry point for FR-001, placed in a header row (plan §4 placement decision), not the old `<nav>` list — keeping `Base.astro` and page-scoped styles only — Done when: `npm run build` exits 0, GET `/` shows the Capture link, and Tab reaches it before any other control. (depends: T002)
- [X] T006 [US1] Create `src/lib/capture-client.ts` with the pure, DOM-free predicate `shouldOpenCapture({ key, ctrl, meta, alt, activeTag })` — true only for a bare `c` when the active element is not `input`/`textarea`/`select`/`[contenteditable]` — plus `src/lib/capture-client.test.ts` covering: `c` + nothing focused → open; `c` inside input/textarea/select/contenteditable → inert; every modifier combo and every other key → inert (FR-002, plan §4) — Done when: `npx vitest run src/lib/capture-client.test.ts` is green. (depends: T002)
- [X] T007 [US1] Wire the dashboard shortcut in `src/pages/index.astro`: ONE `document` keydown listener that calls `shouldOpenCapture` (T006) and then `location.assign('/new')`, with no other key bindings on the page — Done when: `npm run build` exits 0; live on `/` pressing `c` (nothing focused) opens `/new` with the caret in the title; the predicate tests still prove `c` inside a field is inert. (depends: T005, T006)

**Checkpoint**: US1 fully functional — the capture surface is one keystroke away and autofocuses.

---

## Phase 4: User Story 2 — Save a seed in under a second (Priority: P1) 🎯 MVP-loop

**Goal**: submit title + body + optional comma-separated tags → note written as `status: seed` / `visibility: private` under a unique derived slug, git-committed `docs(note): capture <slug>`, and the seed lands on top of the dashboard's recent-notes list — submit→visible < 1 s; git failure degrades to save + exactly one warning per page session.

**Independent Test**: submit a capture and verify (a) the Markdown file exists with the right frontmatter and slug, (b) `git log -1 --format=%s` is `docs(note): capture <slug>`, (c) the dashboard shows the seed first, (d) submit→visible < 1 s; with a non-repo vault the note still saves with `git.committed:false` and one warning.

### Save + commit path

- [X] T008 [US2] Create `src/lib/capture.ts` with `parseCaptureTags(text)` (split on commas, trim, drop empties — F1's `createNote` still owns normalization), `captureCommitMessage(slug)` returning the literal `docs(note): capture ${slug}`, and `commitCapture(vaultDir, slug)` per plan R3/R4 — `simpleGit({ baseDir: vaultDir, allowEnvironment: ['GIT_AUTHOR_NAME','GIT_AUTHOR_EMAIL','GIT_COMMITTER_NAME','GIT_COMMITTER_EMAIL'] })`, `add('<slug>.md')`, `commit(message, ['<slug>.md'])`, try/catch that never throws, ~900 ms timeout — plus `src/lib/capture.test.ts` cases: commit-message literal; temp-repo commit exists and contains ONLY that file (a pre-staged unrelated file stays staged, not swept); non-repo vault → `{ committed:false, reason }` with no throw — Done when: `npx vitest run src/lib/capture.test.ts` is green. (depends: T001)
- [X] T009 [US2] Add `saveCapture(vaultDir, { title, body?, tagsText?, mode })` and the `CaptureResult` types to `src/lib/capture.ts`, extending `src/lib/capture.test.ts`: trimmed empty title → `{ kind:'invalid', error:'title-required' }` BEFORE any fs write or git call; `mode:'new'` → `createNote(vaultDir, { title, body, tags, status:'seed', visibility:'private', slug: slugify(title) })` with `SlugConflictError` → `{ kind:'conflict', slug }`; `mode:'unique'` omits the slug so F1 auto-uniquifies (`title`, `title-2`, …); success attaches `git: { committed, reason? }`; `NoteValidationError`/fs errors → `{ kind:'error', message }`; write-then-commit order; body stored verbatim (multi-line, fences), tags normalized, `status`/`visibility` always pinned; save+commit elapsed < 1000 ms over 5 consecutive runs — Done when: the suite is green including the <1000 ms assertion, the no-write-on-invalid assertion, and the trash-freed-slug → no conflict case (D2/D3, FR-004/013). (depends: T008)

### Endpoint + dashboard

- [X] T010 [US2] Create `src/pages/api/capture.ts` as a thin adapter: `POST` parses the JSON body → `saveCapture(resolveVaultDir(), …)` → maps `201 { slug, status:'seed', git }`, `409 { error:'slug-conflict', slug }`, `400 { error:'title-required' }` / `{ error:'invalid-payload' }`, `500 { error:'save-failed', message }`; `GET` → `405` JSON; no other logic lives here — Done when: `npm run build` exits 0 and the responses match `plan.md` "Interface Contracts" §1 verbatim (import `resolveVaultDir` from `src/lib/vault.ts`, nothing else resolves paths). (depends: T003, T009)
- [X] T011 [US2] Create `src/pages/api/capture.test.ts` invoking the handler directly with `process.env.GARDEN_VAULT_DIR` set to a `mkdtemp` vault (with its own `git init`): `201` body shape for a happy capture, `400 title-required` with the vault still empty, `500` on vault IO failure, `GET` → `405`, and submit→response latency < 1000 ms — Done when: the suite is green and the full `npm run test` stays green (integration evidence for AC2). (depends: T010)
- [X] T012 [US2] Create `src/lib/dashboard.ts` with `selectRecentNotes(notes, limit)` (sort by `updated` DESC — ISO strings compare lexicographically — then slice `limit`) plus `src/lib/dashboard.test.ts`: most-recently-updated first, limit 5, legacy date-only timestamps sort correctly, empty vault → `[]` — Done when: `npx vitest run src/lib/dashboard.test.ts` is green. (depends: T001)
- [X] T013 [US2] Render recent notes in `src/pages/index.astro`: `listNoteSlugs(resolveVaultDir())` → `readNote` each → `selectRecentNotes(notes, 5)` → rows showing title, slug, status badge and last-updated — rows are NON-links in F2 (`/note/<slug>` ships with F8; plan §4) — Done when: `npm run build` exits 0 and a capture saved through the endpoint appears as the FIRST row on `/` with no manual refresh (FR-005, US2.2). (depends: T005, T012)

### Client submit + degraded warning

- [X] T014 [US2] Extend `src/lib/capture-client.ts` and `src/lib/capture-client.test.ts` with the submit guard and the non-conflict response handling: `shouldAcceptSubmit(inFlight)` (a second submit while one is in flight is rejected → exactly one note, SC-008/FR-011) and `handleCaptureResponse` — `201` → `location.assign('/')`; `201` with `git.committed:false` and no warn flag yet → `sessionStorage['dg.gitWarned'] = '1'` + `assign('/?degraded=1')`; repeat degraded in the same page session → `assign('/')`; `400` → inline title message with NO navigation (plan R5, mocked fetch/location/sessionStorage) — Done when: the suite is green for all four branches. (depends: T006)
- [X] T015 [US2] Add the pure warn-once decision `gitWarningDecision({ navType, hasParam, warned }) → { banner, warned }` to `src/lib/capture-client.ts` per plan R5: navigation type `reload` clears the warned flag (a reload starts a new page session), `?degraded=1` + not-yet-warned → show the banner and set the flag, already-warned → no second banner; unit-test the full truth table — Done when: the suite is green covering FR-010/SC-006 exactly-once-per-session semantics. (depends: T014)
- [X] T016 [US2] Wire submission in `src/pages/new.astro` (script bundles `src/lib/capture-client.ts`): Save `<button>` plus `Ctrl/⌘+Enter` anywhere in the form POST `fetch('/api/capture', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ title, body, tagsText, mode }) })`; `Enter` in `#capture-title` preventDefaults and focuses `#capture-body`; Save and conflict controls are disabled while `shouldAcceptSubmit` admits exactly one in-flight request; the result goes through `handleCaptureResponse` (T014) for navigation and inline messages — Done when: `npm run build` exits 0 and live: title+body capture → `201` → lands on `/` with the seed first in Recent Notes, submit→visible < 1 s; whitespace-only title → inline `#capture-status` message, no file, no commit (FR-013, US2.4/US2.5). (depends: T004, T011, T014)
- [X] T017 [US2] Add the degraded-history banner to `src/pages/index.astro`: a banner region driven by `gitWarningDecision` (T015) that appears when `?degraded=1` is present and then `history.replaceState`s the URL back to `/`, with a `load`/navigation-type check clearing `sessionStorage['dg.gitWarned']` on reload — Done when: `npm run build` exits 0 and quickstart step 7 passes against a non-repo temp vault: note saved with `git.committed:false`, exactly one banner per page session, no banner on the second capture in the same tab, banner again after a reload (FR-010). (depends: T013, T015)

**Checkpoint**: the full capture loop works — open → type → save → committed → visible on the dashboard in < 1 s, with a graceful no-git path.

---

## Phase 5: User Story 3 — Capture focus discipline (Priority: P2)

**Goal**: while `/new` is open, typing is typing — every printable key inserts text and never fires an app command; `Esc` returns to the dashboard, confirming first when unsaved text would be lost.

**Independent Test**: sweep every printable key (a–z, A–Z, 0–9, punctuation) on `/new` and verify each inserts its character with zero app-command side effects and no URL change; `Esc` with text prompts (Cancel keeps focus in the capture), `Esc` with empty fields returns to `/` immediately.

### Tests for User Story 3

- [X] T018 [US3] Extend `src/lib/capture-client.ts` and `src/lib/capture-client.test.ts` with `isCaptureKeyCommand` — matching ONLY `Escape`, `Ctrl/⌘+Enter`, and `Enter` while `#capture-title` is focused — plus the Esc decision helper (empty fields → navigate immediately; non-empty → confirm first, cancel refocuses the title) and a printable-key sweep asserting a–z, A–Z, 0–9 and common punctuation match NO command predicate (FR-006, SC-004; plan §5) — Done when: the suite is green with zero printable-key matches and the Esc branches covered with a mocked `confirm`. (depends: T015)

### Implementation for User Story 3

- [X] T019 [US3] Wire the key handlers in `src/pages/new.astro` using the T018 predicates: `Enter` on `#capture-title` → preventDefault + focus `#capture-body`; `Ctrl/⌘+Enter` anywhere in the form → submit; `Escape` on the document → `window.confirm('Discard this capture?')` when any field holds text (accept → `location.assign('/')`, cancel → refocus `#capture-title`), empty fields → immediate `assign('/')` with no prompt; install NO document-level printable-key handler (FR-006/FR-007, plan §1) — Done when: `npm run build` exits 0 and a live key sweep on `/new` shows every printable key inserting its character, the URL never changing, focus never leaving the capture fields, and both Esc behaviors matching AC3. (depends: T016, T018)

**Checkpoint**: capture focus discipline holds — the surface never hijacks typing.

---

## Phase 6: User Story 4 — Title collision offers a choice (Priority: P2)

**Goal**: a title-derived slug that belongs to a live note produces an inline 409 conflict with two keyboard-reachable choices — open the existing note, or save under the first free unique slug — with the typed title/body/tags preserved; nothing is ever overwritten.

**Independent Test**: with an existing note "Retrieval Practice", capture the same title again → inline conflict appears; "Open existing" navigates to `/note/retrieval-practice` (the navigation is the F2 acceptance point; the F8 route may 404); "Save as new" creates `retrieval-practice-2` with the captured text intact and commits it normally.

### Tests for User Story 4

- [X] T020 [US4] Extend `src/pages/api/capture.test.ts` with the collision contract: a second identical title → `409 { error:'slug-conflict', slug }` with NOTHING overwritten; `mode:'unique'` → `201` with slug `…-2`; slugged-equivalent titles ("Café Society" / "Cafe Society") collide; a slug freed by trash → `201` with no conflict (FR-008/009, SC-005, US4.1/US4.4/US4.5) — Done when: the suite is green, the pre-existing note file's bytes are unchanged, and no note is written outside the temp vault. (depends: T011)

### Implementation for User Story 4

- [X] T021 [US4] Extend `src/lib/capture-client.ts` and `src/lib/capture-client.test.ts` with the 409 conflict decision — keep the typed title, body and tags in their fields, reveal the conflict state, move focus to `#save-as-new` (the content-preserving choice), leave `#capture-status` clear — and the two choices: save-as-new → re-POST the same payload with `mode:'unique'` → on `201` `assign('/')`; open-existing → `location.assign('/note/' + slug)` with no second prompt (draft discarded by explicit user choice; the F8 route may 404 — that is the sanctioned acceptance point, clarify Q2) — Done when: all three branches are green under mocked fetch/location (AC4, plan §3). (depends: T018)
- [X] T022 [US4] Wire the conflict UI in `src/pages/new.astro`: `#capture-conflict` becomes visible with the message `A note already exists at "<slug>"` plus the two real `<button>`s (`#save-as-new` first in DOM, `#open-existing`) — Tab/Shift-Tab and Enter/Space reach both, no modal, no focus trap — and all three submit controls are disabled while a request is in flight — Done when: `npm run build` exits 0 and the live flow matches quickstart step 6: duplicate title → inline conflict with both controls keyboard-reachable, "Save as new" lands on `/` with `retrieval-practice-2` first in Recent Notes, "Open existing" navigates to `/note/retrieval-practice`. (depends: T019, T021)

**Checkpoint**: all four stories independently functional; collisions never lose or overwrite data.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T023 [P] Run the D5 validation gate end to end in the worktree: `npm run test` (every suite, including F1's untouched `src/lib/notes.test.ts`) and `npm run build`; verify with `git status --short` that `src/lib/notes.ts`, `src/lib/notes.test.ts`, `src/layouts/Base.astro` and `src/styles/global.css` are unchanged and that no writes landed in the repo's own `vault/` — Done when: both commands exit 0 and the evidence is recorded in the completion report.
- [X] T024 [P] Verify the loopback/offline posture (FR-012, SC-007, D5): no `server.host` in `astro.config.mjs`, no `--host` anywhere, and while the app runs no non-loopback listener exists for the app port (`awk '$4=="0A"{print $2}' /proc/net/tcp /proc/net/tcp6`) — Done when: the evidence is recorded; any outbound network call found in the capture path is reported as a blocker, not silently patched.
- [X] T025 [P] Execute the manual browser checklist from `plan.md` "Validation & Quickstart" steps 4–7 against a hermetic temp vault (`GARDEN_VAULT_DIR=$(mktemp -d)` + `git init` in it): shortcut→caret < 200 ms, full printable key sweep, conflict choice flow, degraded warn-once, submit→visible < 1 s — Done when: each step's outcome (pass/fail with measurements) is written into the completion report; any failure becomes a follow-up card rather than a silent skip (plan R8: no browser automation exists on this host).
- [X] T026 [P] Update project documentation for the new interfaces (AGENTS.md "update docs when behavior or interfaces change"): the `/new` capture loop, the `GARDEN_VAULT_DIR` vault-resolution contract, and the new run model (`output:'server'` + `@astrojs/node` standalone, `dist/server` + `dist/client`, loopback-only reminder) in `README.md` — Done when: the docs match the shipped behavior and `npm run build` still exits 0.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 blocks everything (no `node_modules` in the worktree today); T002 blocks every route task.
- **Foundational (Phase 2)**: depends on Setup; blocks US1/US2 (T010, T015 import `resolveVaultDir`).
- **User Stories**: US1 → US2 → US3 → US4 in that order — not because the stories are conceptually coupled, but because they extend the same two page files (`src/pages/new.astro`, `src/pages/index.astro`) and the same client module.
- **Polish**: after all desired stories are complete (T023–T026 are mutually parallel).

### Shared-file chains (MUST run in the listed order — one card at a time per file)

- `src/lib/capture-client.ts` + `src/lib/capture-client.test.ts`: T006 → T014 → T015 → T018 → T021
- `src/pages/new.astro`: T004 → T016 → T019 → T022
- `src/pages/index.astro`: T005 → T007 → T013 → T017
- `src/lib/capture.ts` + `src/lib/capture.test.ts`: T008 → T009
- `src/pages/api/capture.test.ts`: T011 → T020

### Within Each User Story

- Implementation task before the task that consumes it (T008 → T009 → T010 → T011; T012 → T013).
- Story complete (build + suites green) before moving to the next priority.

### Parallel Opportunities

- After T001–T003: T004, T005 and T006 touch three different files and can run in parallel; T007 joins once T005 + T006 land.
- Within US2: T008 (save path) and T012 (dashboard selector) touch different files and run in parallel with T009–T011.
- Polish: T023, T024, T025, T026 are all [P].

## Parallel Example: User Story 1

```text
Task: "Create src/pages/new.astro quick-capture shell …"            (T004)
Task: "Replace the scaffold body of src/pages/index.astro …"        (T005)
Task: "Create src/lib/capture-client.ts shouldOpenCapture …"        (T006)
# then, once T005 + T006 are done:
Task: "Wire the dashboard shortcut in src/pages/index.astro …"      (T007)
```

## Implementation Strategy

### MVP first (US1 open-capture, then US2 save — the demoable loop)

1. Phase 1: Setup (T001 → T002) — the app must install, build and serve as SSR first.
2. Phase 2: Foundational (T003) — vault resolution.
3. Phase 3: US1 → **STOP and VALIDATE**: caret lands in the capture title from one keystroke.
4. Phase 4: US2 → **STOP and VALIDATE**: the full Journey 1 loop under 1 s against a temp vault.

### Incremental delivery

- US1 → US2 delivers the whole capture loop (PRD Journey 1); US3 hardens trust (no key hijacking); US4 closes the zero-data-loss collision path.
- Each story adds value without breaking the previous ones; every checkpoint is independently testable (`npm run test` + `npm run build` + the quickstart smoke).

## Notes

- **Line = one implement card**: every task carries its own file paths and done-when so the orchestrator can fan out without re-deriving context.
- **Tests-first convention**: the template's RED→GREEN test ordering is intentionally relaxed — each implementation line pairs with its unit-test file and is done when that suite is green (this mirrors `plan.md`'s file-by-file table and keeps every line standalone-green for fan-out). Contract/integration suites that exercise already-shipped code keep their own lines (T011, T020).
- **No Playwright**: no `*.spec.ts` files are added (they would also require a vitest exclude); browser-only facts are covered by the manual checklist T025 (plan R8).
- **Performance budgets are assertions, not hopes**: T009 asserts < 1000 ms save+commit in vitest; T011 asserts < 1000 ms through the endpoint handler; live submit→visible < 1 s is T025.
- **simple-git footgun**: the `allowEnvironment` identity allowlist in T008 is binding for every later feature that commits (F8 editor save, F9 auto-commit) — do not "simplify" it away (plan R3).
- **Never**: commit/push, touch `src/lib/notes.ts` / `src/lib/notes.test.ts`, write outside this worktree, bind a non-loopback address, or write to the repo's own `vault/` during verification.

---

## Phase 8: Convergence

**Purpose**: the single gap `/speckit.converge` found on card t_1d879f83 (FLOW_ID `flow_20261015_2154_f2qc9x`), appended without rewriting or renumbering T001–T026. Everything else in T001–T026 was re-verified against the disk rather than trusted from prose: `npm run test` exits 0 (6 files / 108 tests), `npm run build` exits 0 logging `output: "server"` + `adapter: @astrojs/node`, `git status --short` shows only the F2 files (F1 base `src/lib/notes.ts` / `notes.test.ts` / `Base.astro` / `global.css` untouched, nothing staged, HEAD still `33d5584`, repo `vault/` still only `welcome.md`), a live HTTP smoke against a hermetic temp vault returned 201/409/400/405 with `docs(note): capture <slug>` commits, and an independent real-Chromium checklist re-ran all 18 browser-only acceptance checks green.

- [X] T027 Fix the `TS2352` type error at `src/lib/capture.ts:146:40` — `npx tsc -p tsconfig.json --noEmit` fails with `error TS2352: Conversion of type 'CaptureInput' to type 'Record<string, unknown>' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first. Index signature for type 'string' is missing in type 'CaptureInput'.` (the `const raw: Record<string, unknown> = (input ?? {}) as Record<string, unknown>` line in `saveCapture`); change that cast so shipped code type-checks — e.g. `(input ?? {}) as unknown as Record<string, unknown>`, or type the local as `CaptureInput` and read the optional fields without a cast — owner: `src/lib/capture.ts` (implement-B file); do not change runtime behavior. Done when: `npx tsc -p tsconfig.json --noEmit` exits 0 AND `npm run test` + `npm run build` still exit 0. per plan: Technical Context (TypeScript strict `tsconfig`, types advisory) + orchestrator verification item 2026-10-16 (partial)
