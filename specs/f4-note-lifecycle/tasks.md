---

description: "Task list for F4 Note Lifecycle States — extended POST /api/note with status, note-view status control with shared conflict UX, shared /status/[state] browse view, dashboard seeds-needing-attention, tests"
---
# Tasks: F4 Note Lifecycle States

**Input**: Design documents from `/specs/f4-note-lifecycle/` — `spec.md` (clarified 2026-10-20, 3 user stories) + `plan.md` (Research R1–R8, Data Model, Interface Contracts §1–§5, file-by-file changes, AC verification matrix, Validation & Quickstart). Per the card's F2/F3-parity artifact set, the usual `research.md` / `data-model.md` / `contracts/` / `quickstart.md` are consolidated into `plan.md` — nothing is missing.

**Prerequisites**: `plan.md` (present), `spec.md` (present). `.specify/memory/constitution.md` is an unfilled `[PROJECT_NAME]` template → no gates. `.specify/extensions.yml` does not exist → `before_tasks` / `after_tasks` hook stages skipped silently (pre-check and mandatory post-check both performed).

**Tests**: Requested by this feature (D7 validation includes `npm run test`; spec SC-001/002/003/005/009 demand automated evidence). Unit tests are paired with the implementation line that turns them green; the endpoint contract suite has its own line (T005). Ordering convention under "Notes".

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently. Every line is standalone: what to change, the exact file paths, and a done-when check — one line = one implement card. **This file is the self-contained handoff for the build card (t_23323579): do not re-spec; if a line contradicts spec.md/plan.md, treat spec.md as authority and comment/block rather than invent scope.**

## Format: `[ID] [P?] [Story] Description — Done when: …`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US3 from `spec.md`; Setup / Foundational / Polish carry no story label
- **Done when**: the acceptance check the implementer must satisfy before the card may close

## Binding constraints (do not re-decide)

- **D1–D7** (parent card t_bdceee6f, identical in every sibling card): compressed path — read-side + minimal status-mutation only, no new persistence layer, ship parks for operator approval, no commits/push/PR (D1); status enum = `NOTE_STATUSES` `['seed','growing','evergreen','archived']`, invalid status → 400 invalid-payload, missing on create/parse → `'seed'` — verify + regression-test at `notes.ts:449,638`, do NOT re-plumb (D2); status mutation reuses F1 `saveNote` via the EXTENDED `POST /api/note` with an optional `status` field, same baseHash/force → 409 flow, disk truth for title/tags, **no new endpoint**, status saves never git-commit (D3); `/status/[state]` is the SHARED status-browse view — param validated against `NOTE_STATUSES` (unknown → 404), listed most-recently-updated first, param-driven heading + empty text (NOT seed-shaped) so F6 reuses the pattern, archived visible at `/status/archived` (D4); dashboard gains `selectSeedsNeedingAttention(notes, limit)` in `src/lib/dashboard.ts` — filter `status==='seed'`, sort `updated` ASC, slug ASC tie-break, `SEEDS_ATTENTION_LIMIT=5` — plus an index.astro "Seeds needing attention" section whose rows link to `/note/<slug>` (D5); note view keeps the existing badge classes and adds a status `<select>` posting via the extended endpoint with the body save's snapshot/409 inline-conflict UX (D6); validation gate = `npm install` + `npm run test` + `npm run build`, all three already listed in `.ainative/project.yaml` (D7 — verified on disk 2026-10-20, do NOT edit that file).
- **Clarifications (spec, locked)**: Q1 payload `{ slug, baseHash, force?, body?, status? }` with **at least one of `body`/`status`**; an omitted field keeps its disk value; out-of-enum status → 400 invalid-payload before anything is written. Q2 the status `<select>` lives in the note header beside the badge, **posts on change**, is **disabled while edit mode is open and while any save is in flight**, and an unchanged re-selection posts nothing. Q3 entry points = note-view badge → `/status/<state>`, dashboard Recent-notes badges → `/status/<state>`, seeds heading → `/status/seed`; no nav chrome/counts/index page (F6 owns that). Q4 all dashboard note rows (Recent + Seeds) become `/note/<slug>` links. Q5 a status-only save **bumps `updated`** exactly like a body save — tests assert monotonicity (`>=`), never strict inequality (same-millisecond writes).
- **Contracts in `plan.md` are binding**: `POST /api/note` request/response table (Interface Contracts §1 — `200 { slug, status, updated, backlinks }`, at-least-one rule, validation order R2); the status-control client contract (§2 — one shared conflict box, `pendingPayload` retried with `force:true`, `400/500` revert); `/status/[state]` page contract (§3 — tolerant per-note read); `status-list.ts` export surface (§4 — the F6 reuse contract); seeds literals (§5 — D5 verbatim).
- **File boundaries**: `src/lib/notes.ts` MUST stay **ZERO-hunk** (D2 is verify + regression-test; a needed change there is a spec finding — stop and comment/block); `src/pages/new.astro`, `src/pages/api/capture.ts` + `capture.test.ts`, `src/lib/capture*.ts`, `src/lib/vault.ts`, `src/lib/render.ts` + `render.test.ts`, `src/layouts/Base.astro`, `src/styles/global.css`, `astro.config.mjs`, `package.json`/`package-lock.json`, `.ainative/project.yaml` are read-only for F4. `notes.test.ts` gains additive cases only.
- **No commits/push from these tasks** (D1 + D3/FR-006): verification runs against temp vaults (`GARDEN_VAULT_DIR=$(mktemp -d)` + `git init` + one seed commit); nothing is committed to `digitalgarden/t_bdceee6f-…`, and the extended save endpoint must never commit (T005 asserts it).
- **Workspace**: build in the SHARED parent worktree `/opt/data/mnt/workspace/digitalGarden/.worktrees/t_bdceee6f` (branch `digitalgarden/t_bdceee6f-f4-note-lifecycle-states`, HEAD f213b0d). `node_modules/` is already installed (spec session baseline: `npm install` 0, `npm run test` 9 files / 171 tests 0, `npm run build` 0). Check `git status` first; preserve unrelated changes; only `specs/f4-note-lifecycle/` is expected dirty from this spec chain.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: prove the gate baseline in the shared worktree before anything changes — nothing else runs without this.

- [x] T001 [P] Re-run the D7 gate in `/opt/data/mnt/workspace/digitalGarden/.worktrees/t_bdceee6f` as the pre-change baseline — `npm install` (expect no-op, zero dependency changes), `npm run test` (expect 9 files / 171 tests green), `npm run build` (expect exit 0) — and record `git status --short` (expect clean apart from `?? specs/f4-note-lifecycle/`) — Done when: all three commands exit 0 and the evidence is in the completion report; this task blocks every other task.
- [x] T002 [P] Verify the no-churn claims before writing code: `.ainative/project.yaml` already lists `npm install`, `npm run test`, `npm run build` in order (D7 — confirm, do not edit); `npm ls --depth=0` shows no added/removed packages versus `package.json` (zero dependency changes, plan Technical Context); `git diff --stat src/lib/notes.ts` is empty (the D2 zero-hunk baseline) — Done when: all three checks pass and their output is recorded; any mismatch is a blocker reported on the card, not fixed here.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: lock AC1's default-seed guarantee so every later task can trust it — and prove the F1 module needs no change.

- [x] T003 [US1] Add the AC1 regression lock to `src/lib/notes.test.ts` (additive cases only): `createNote(vault, { title })` with no `status` → created note + on-disk frontmatter `status: seed`; `parseNoteFile` on a frontmatter block without a `status` key → `status: 'seed'`; an out-of-enum status in a file → `NoteValidationError` (the F1 behavior D2 relies on; skip if already covered — check the existing suite first and reference, don't duplicate) — Done when: `npx vitest run src/lib/notes.test.ts` is green with pre-existing assertions untouched, and `git diff src/lib/notes.ts` is EMPTY (zero hunks — this task must not touch that file). (depends: T001)

**Checkpoint**: foundation locked — AC1 is provable and `notes.ts` is confirmed read-only for F4.

---

## Phase 3: User Story 1 — Change a note's status from its view (Priority: P1) 🎯 MVP-open

**Goal**: `POST /api/note` accepts `status` under the existing conflict contract; the note view gains the header `<select>` that posts on change with the shared 409 UX; the badge and every list reflect the change on the next view (AC2's mutation half).

**Independent Test**: with a temp vault, POST a status-only change → 200 + frontmatter updated + body/title/tags byte-identical + `git log` unchanged; POST an out-of-enum status → 400 + vault untouched; stale-hash status change → 409 with nothing written, then `force:true` → 200 applying only the status. Live: open a seed note, pick `growing`, reload → badge `growing`, select disabled while body edit is open.

### Endpoint + tests

- [x] T004 [US1] Extend `src/pages/api/note.ts` as a thin adapter per plan R2/contract §1: payload `{ slug, baseHash, force?, body?, status? }` with **at least one of `body`/`status`** — validation order: JSON → object → `slug` non-empty string → `baseHash` non-empty string → presence rule → types (`body` string when present, `status` string when present, `force` boolean when present) → `status` ∈ `NOTE_STATUSES` (import from `src/lib/notes`) → `assertValidSlug` → vault ops; then `readNote` (disk truth) and apply ONLY the fields present (`{ ...current, ...(body !== undefined ? { body } : {}), ...(status !== undefined ? { status } : {}) }`) → `saveNote(..., { baseSlug, baseSnapshot: { slug, mtimeMs: 0, hash: baseHash }, force })` → `refreshVaultIndex` → `200 { slug, status, updated, backlinks }`; the `409/404/400/500/405` mapping stays exactly as shipped (only the 400 provable cases grow); no path logic, no resolution logic, **no git anywhere in this file** — Done when: `npm run build` exits 0 and every response matches plan Interface Contracts §1 verbatim. (depends: T001)
- [x] T005 [US1] Extend `src/pages/api/note.test.ts` (direct handler invocation + `GARDEN_VAULT_DIR` = `mkdtemp` vault with `git init` + one seed commit) with the status contract cases: status-only save → `200`, on-disk `status` changed, **body/title/tags byte-identical to the disk copy before the save**, `updated` monotonic (`>=` before — never strict `!=`, Q5), response `200.status` equals the saved value; body+status save applies both; out-of-enum status (`'mature'`, `'SEED'`, `42`) → `400 { error: 'invalid-payload' }` with vault bytes + file list unchanged; `{ slug, baseHash }` with neither field → `400`; stale `baseHash` + status change → `409 external-edit-conflict`, file unchanged, then `force: true` → `200` with the status applied AND the disk body preserved; **`git -C vault log --oneline` unchanged after a status save** (FR-006, seed commit still HEAD); plus assert **every F3 case still passes untouched** — Done when: the suite is green and the full `npm run test` stays green. (depends: T004)

### Client decisions + wiring

- [x] T006 [US1] Extend `src/lib/wikilink-client.ts` (DOM-free, existing ports pattern) with the status decisions per plan R3/R6: `statusDecision({ inFlight, changed })` → `'save' | 'ignore'` (in-flight guard; `changed=false` when the select value equals the current status — no request), `statusSavePayload(slug, status, baseHash, force)` → `{ slug, status, baseHash, ...(force ? { force: true } : {}) }` (NO body key — disk truth by construction), `statusControlEnabled({ editOpen, saveInFlight })` → boolean (true only when neither is true); loosen `SavePayload` so `body`/`status` are each optional while the existing `savePayload` builder keeps emitting valid body-only payloads (F3 regression) — plus `src/lib/wikilink-client.test.ts` cases: all four `statusControlEnabled` combinations, `statusDecision` truth table (in-flight → ignore; unchanged → ignore; changed+idle → save), payload shape incl. absent body + optional force, and the existing F3 body-save/popup/pending suites still green — Done when: `npx vitest run src/lib/wikilink-client.test.ts` is green. (depends: T001)
- [x] T007 [US1] Wire the status control in `src/pages/note/[slug].astro`: header gains `<label for="note-status-select">Status</label><select id="note-status-select">` with the four `NOTE_STATUSES` options (server-rendered, current preselected — pass the allowed values + current from the frontmatter) beside the unchanged badge, and the badge becomes a link to `/status/<state>` (Q3) keeping its existing classes (D6); the page script adds `statusInFlight` + `pendingPayload` state: `change` → `statusDecision` → `statusSavePayload(slug, value, baseHash, false)` → the SAME `fetch('/api/note')` + `handleSaveResponse` path as body save (`pendingPayload` records every sent payload); `setControlsEnabled(false)` also disables the select; `statusControlEnabled` drives `select.disabled = editOpen || saveInFlight`; the Overwrite button re-POSTs `pendingPayload` with `force:true` (works for both flows); a new save attempt (body or status) clears `#note-conflict` first; `400/500` → `#note-status` message + select reverts to the current status + controls re-enabled; `200` → `location.reload()` — Done when: `npm run build` exits 0 and the live flow matches US1 scenarios 1–4 and 7 (post-on-change, disabled while editing/in-flight, unchanged selection silent, conflict box shared, disk body preserved on forced status save). (depends: T005, T006)

**Checkpoint**: MVP open — AC2's mutation half works end to end; status saves never commit (T005 asserts).

---

## Phase 4: User Story 2 - Browse notes by lifecycle state (Priority: P1)

**Goal**: `/status/[state]` lists any state newest-updated first with param-driven copy and a friendly 404 — the shared pattern F6 will reuse (D4); AC2's propagation half becomes observable.

**Independent Test**: fixture vault with notes in all four states → each `/status/<state>` lists exactly its notes newest-first with title/badge/updated; `/status/nonsense` → 404; a vault with a malformed-status file → page still renders, file skipped; empty state → param-named empty text.

### Tests + page

- [x] T008 [US2] Create `src/lib/status-list.ts` (pure, DOM/fs-free — the F6 reuse surface, plan contract §4) exporting `selectByStatus(notes, state)` (filter `status === state` exactly; sort `updated` DESC with slug ASC tie-break — the `selectRecentNotes` string-comparison discipline; input array never mutated; accepts `{ slug, title, status, updated }`-shaped notes) and the param-driven copy helpers `statusHeading(state)` + `statusEmptyText(state)` (or one combined export) returning state-named strings for all four states — never seed-shaped text for another state (D4) — plus `src/lib/status-list.test.ts`: exact filtering (archived excluded from live states and vice versa), DESC order, tie-break determinism, mutation-free, copy names each requested state, and an invalid state is a caller error (the page 404s before calling) — Done when: `npx vitest run src/lib/status-list.test.ts` is green. (depends: T001)
- [x] T009 [US2] Create `src/pages/status/[state].astro` (server-rendered, page-scoped `<style>`, `Base.astro` untouched): validate `Astro.params.state` against `NOTE_STATUSES` — unknown → the same friendly-404 response pattern `note/[slug].astro` uses (no stack trace, dashboard link back); read notes TOLERANTLY like `index.astro` (`listNoteSlugs` → `readNote` per slug in try/catch, skipping the broken — NOT `refreshVaultIndex`, which throws on the first corrupt file, plan R4); rows via `selectByStatus` — title as a link to `/note/<slug>`, existing badge classes, `<time>` updated — under `statusHeading(state)`, empty state via `statusEmptyText(state)`; badge class styling matches the dashboard's existing badge CSS (no new styling system) — Done when: `npm run build` exits 0 and the live routes match the Independent Test (4 valid states list correctly, unknown → 404, malformed file skipped, archived listed). (depends: T008)

**Checkpoint**: AC2 fully observable — a status change ripples badge → state lists → dashboard on the next view.

---

## Phase 5: User Story 3 - Dashboard "seeds needing attention" (Priority: P2)

**Goal**: the weekly-tending surface (PRD Journey 4): seeds sorted least-recently-updated, capped at 5, linking to their notes; all dashboard rows/badges become links (Q3/Q4).

**Independent Test**: vault with mixed states/ages and >5 seeds → section shows the 5 oldest seeds, oldest first, non-seeds absent; tend a seed → it leaves on the next load; zero seeds → explicit empty message; Recent notes rows now link to their notes.

### Selector + wiring

- [x] T010 [US3] Extend `src/lib/dashboard.ts` with `selectSeedsNeedingAttention(notes, limit)` per D5/contract §5: filter `status === 'seed'` (widen the `RecentNoteLike`-style input shape with `status`), sort `updated` ASC (least recently updated first), slug ASC tie-break, cap at the truncated non-negative `limit` (same clamping discipline as `selectRecentNotes`), input never mutated; export `SEEDS_ATTENTION_LIMIT = 5`; keep `selectRecentNotes` and `RECENT_NOTES_LIMIT` untouched — plus additive `src/lib/dashboard.test.ts` cases: only-seed filter (growing/evergreen/archived excluded), ASC order, tie-break determinism, cap at a given limit, default-limit constant is 5, empty input → `[]`, mutation-free — Done when: `npx vitest run src/lib/dashboard.test.ts` is green with the F2 cases untouched. (depends: T001)
- [x] T011 [US3] Extend `src/pages/index.astro` (additive only — the F2 `c`-shortcut and git-warning code paths stay untouched): add a "Seeds needing attention" section after Recent notes — heading `<a href="/status/seed">` (Q3), rows from `selectSeedsNeedingAttention(notes, SEEDS_ATTENTION_LIMIT)` as a table (title link → `/note/<slug>` per Q4/D5, slug, updated; no status column needed — every row is a seed — but if shown it reuses the badge classes), explicit empty text when there are no seeds; Recent notes rows: title becomes a link to `/note/<slug>` and the badge becomes a link to `/status/<state>` (Q3/Q4) — Done when: `npm run build` exits 0 and the live dashboard matches US3 scenarios 1–5 (5 oldest seeds, oldest first, deterministic ties, non-seeds absent, links work, empty state, Recent notes linking). (depends: T010)

**Checkpoint**: all three stories functional; every parent AC has automated + live evidence.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T012 [P] Run the D7 gate end to end after all changes: `npm install` (no-op), `npm run test` (every suite), `npm run build`; verify with `git status --short` / `git diff --stat` that `src/lib/notes.ts` is still ZERO-hunk, the unchanged-file list from "Binding constraints" is untouched (incl. `.ainative/project.yaml`, `package.json`/lockfile — zero dependency changes), nothing is staged, and the repo's own `vault/` has no new files — Done when: all three commands exit 0 and the evidence is in the completion report.
- [x] T013 [P] Verify the loopback/offline posture (FR-011, SC-008): no `server.host` in `astro.config.mjs`, no `--host` anywhere, no outbound `fetch`/network code in the F4 feature path (status select posts same-origin only; `status-list.ts`/selectors are pure) — and while `astro dev` runs, no non-loopback listener exists for the app port (`awk '$4=="0A"{print $2}' /proc/net/tcp{,6}`) — Done when: the evidence is recorded; any outbound call in the feature path is reported as a blocker, not silently patched.
- [x] T014 [P] Execute the scripted browser checklist from `plan.md` "Validation & Quickstart" (steps 1–6) against a hermetic temp vault, launching Chromium with `executablePath: '/opt/hermes/tools/chromium-1208/chrome-linux/chrome'` (plan R8 — run the script from the scratch dir, add NO files to the repo): dashboard seeds ordering + links + malformed-file tolerance; status change → badge/`/status/*`/dashboard propagation with view timing < 500 ms recorded; shared 409 conflict flow with both controls; select disable matrix; keyboard reachability with no new bare bindings; `/status/nonsense` → 404; empty-state copy; loopback listener check — Done when: each step's outcome (pass/fail with measurements) is written into the completion report; any failure becomes a follow-up card rather than a silent skip.
- [x] T015 [P] Update project documentation (AGENTS.md house rule: update docs when behavior or interfaces change): `README.md` gains the F4 surface — lifecycle states + seed default, the note-view status control and its conflict behavior, `/status/[state]`, the dashboard seeds section and row/badge links, the extended `POST /api/note` contract, and the explicit "status saves do not commit until F9" note — Done when: the docs match the shipped behavior and `npm run build` still exits 0 (no `*.astro`/`*.ts` behavior changes in this task).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 blocks everything; T002 is independent verification ∥ T001.
- **Foundational (Phase 2)**: T003 depends on T001 (needs the baseline suite green to prove its additions additive).
- **User Stories**: US1 → US2 → US3 — US1 ships the mutation, US2 the propagation surface, US3 the observer; they touch disjoint files except `index.astro` (US2's Q3 badges + US3's section) and could partially overlap, but the story order keeps every checkpoint independently demoable.
- **Polish**: after all stories (T012–T015 are mutually parallel; T014 needs the app buildable, i.e. after integrate).

### Shared-file chains (MUST run in the listed order — one card at a time per file)

- `src/pages/api/note.ts` + `api/note.test.ts`: T004 → T005
- `src/lib/wikilink-client.ts` + `.test.ts`: T006 (single line)
- `src/pages/note/[slug].astro`: T007 (single line; after A + B)
- `src/lib/status-list.ts` + `.test.ts` → `src/pages/status/[state].astro`: T008 → T009
- `src/lib/dashboard.ts` + `.test.ts` → `src/pages/index.astro`: T010 → T011
- `src/lib/notes.test.ts`: T003 (additive only; `src/lib/notes.ts` itself never changes)
- Config/docs (own files): T001, T002, T015

### Within Each User Story

- Endpoint/tests before the page wiring that consumes them (T004 → T005 → T007; T008 → T009; T010 → T011).
- Story complete (build + suites green) before moving to the next priority.
- US1+US2 together = the MVP checkpoint (AC2 end to end); then US3 (AC3).

### Parallel Opportunities

- After T001: T002 (verify) ∥ T003 (notes.test.ts) ∥ T004 (api/note.ts) ∥ T006 (wikilink-client.ts) ∥ T008 (status-list.ts) ∥ T010 (dashboard.ts) touch six different files.
- After T004: T005 (contract tests) ∥ T006 ∥ T008 ∥ T010.
- After T005+T006: T007 (note page). After T008: T009. After T010: T011.
- Polish: T012, T013, T014, T015 are all [P] (T014 after integrate).

## Parallel Example: fan-out for the build card's delegate_task

```text
Chain A (endpoint):   T004 → T005  api/note.ts + status contract tests      (after T001)
Chain B (client lib): T006  wikilink-client.ts status decisions + tests      (after T001)
Chain C (note page):  T007  note/[slug].astro select + shared conflict UX   (after A+B)
Chain D (state view): T008 → T009  status-list.ts + status/[state].astro    (after T001)
Chain E (dashboard):  T010 → T011  dashboard.ts seeds selector + index.astro (after T001)
Chain F (AC1 lock):   T003  notes.test.ts additive (zero-diff notes.ts)      (after T001)
Chain G (setup):      T001 → T002, later T015 README
# integrate → Phase 6 gate (T012) → loopback (T013) → browser checklist (T014)
```

## Implementation Strategy

### MVP first (US1 mutation, then US2 propagation — the demoable loop)

1. Phase 1: Setup (T001 → T002) — baseline + no-churn verification.
2. Phase 2: Foundational (T003) — AC1 regression lock, zero-hunk proof.
3. Phase 3: US1 → **STOP and VALIDATE**: status-only/body+status/409/force/400 cases green; live select flow works (quickstart API smoke 1–5).
4. Phase 4: US2 → **STOP and VALIDATE**: state lists + 404 + tolerant read + copy (quickstart smoke 6).
5. Phase 5: US3 → AC3 evidence (seeds ordering + links).
6. Phase 6: gate + loopback + browser checklist + docs.

### Incremental delivery

- US1 delivers the mutation (AC2 mutation half); US2 makes propagation observable (AC2 full); US3 adds the weekly-tending surface (AC3). Each story is independently testable (`npm run test` + `npm run build` + the quickstart smoke).

## Notes

- **Line = one implement card**: every task carries its own file paths and done-when so the orchestrator can fan out without re-deriving context; spec.md is the authority on any behavioral question this file does not answer.
- **Tests-first convention**: relaxed exactly as in F2/F3 — each implementation line pairs with its unit-test file and is done when that suite is green; the endpoint contract suite keeps its own line (T005).
- **AC2 is provable, not aspirational**: T005's status-only save assertions (on-disk status changed + body/title/tags byte-identical + `updated` monotonic + `200.status`) ARE the automated half of AC2; T007's live propagation is the other half.
- **`notes.ts` is UNTOUCHABLE in F4** (D2 verify-only): if a change seems to need more than additive `notes.test.ts` cases, stop and comment/block — do not widen it.
- **No new endpoint, no second conflict UX**: the status flow rides `POST /api/note` and the EXISTING `#note-conflict` region (contract §2). If either contract looks wrong, that is an ANALYZE finding (plan verdict = yes), not a task-time invention.
- **No Playwright specs/config**: browser evidence is T014's one-off scripted run from the scratch dir; adding `*.spec.ts` would collide with vitest's default include (plan R8).
- **Hotspot discipline**: `src/pages/note/[slug].astro` (T007), `src/pages/index.astro` (T011), `src/lib/wikilink-client.ts` (T006) and `src/pages/api/note.ts` (T004) each accumulate across this chain — strictly one worker per chain, in listed order; if two chains keep colliding in one file, leave a `hotspot:` comment on the card instead of piling on.
- **Never**: commit/push (D1), write to the repo's own `vault/`, bind a non-loopback address, modify the read-only file list (incl. `.ainative/project.yaml` and `package.json`), touch `src/lib/notes.ts`, or silently drop the FR-006 "no commit on status save" rule.
