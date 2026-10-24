# Implementation Plan: F4 Note Lifecycle States

**Branch**: `digitalgarden/t_bdceee6f-f4-note-lifecycle-states` (build card t_23323579) | **Date**: 2026-10-20 | **Spec**: [specs/f4-note-lifecycle/spec.md](./spec.md)

**Input**: Feature specification `specs/f4-note-lifecycle/spec.md` (clarified 2026-10-20, 5/5 questions resolved) + locked orchestrator decisions D1–D7 (parent card t_bdceee6f).

**Step**: `/speckit.plan` (Phase 5/6). Deliverable is this plan — implementation and task breakdown land in `tasks.md`; no code in this step.

> **Artifact consolidation**: the card fixes the F4 artifact set at `specs/f4-note-lifecycle/{spec,plan,tasks}.md` (F2/F3 parity), so the template's separate `research.md`, `data-model.md`, `contracts/`, and `quickstart.md` outputs are consolidated into this single file: "Research (Phase 0)" below, "Data Model" and "Interface Contracts" (Phase 1), "Validation & Quickstart" (Phase 1).
> **Extension hooks**: `.specify/extensions.yml` does not exist → `before_plan` / `after_plan` hook stages skipped silently (both pre-check and mandatory post-check performed).

---

## Summary

F4 makes the lifecycle real end to end: the existing `POST /api/note` is EXTENDED (D3 — no new endpoint) to accept an optional `status` alongside `body` under the same snapshot→409 conflict contract, so a status change is saved by the same protected machinery as a body edit; the note view gains a header `<select>` beside the unchanged badge that posts on change through that contract (disabled while editing or in flight, one shared conflict box); a new shared browse route `/status/[state]` lists any state newest-updated first with param-driven heading/empty text (F6 will reuse the pattern); and the dashboard gains "Seeds needing attention" via a pure `selectSeedsNeedingAttention` selector (seeds, `updated` ASC, slug tie-break, cap 5), with all dashboard note rows and status badges linking out (clarifications Q3/Q4).

Four facts verified against THIS checkout today drive the design, none assumed:

1. **Today the save endpoint would lie about status.** Probed the live handler: a payload carrying `status: 'growing'` alongside a body answers **200 while the on-disk status stays `seed`** (the key is silently ignored — the handler destructures only `{ slug, body, baseHash, force }`, `api/note.ts:49`), and a status-only payload **400s** because `body` is mandatory (`:51`). Both gaps become explicit contract: at least one of `body`/`status`, omitted field keeps disk truth, out-of-enum status → `400 invalid-payload` before anything is written (clarification Q1).
2. **The write path needs no new plumbing.** `saveNote` already validates status against `NOTE_STATUSES` (`notes.ts:677`), bumps `updated` (`writeNoteFile`, `:596-604`), and implements the snapshot/`force` → `ExternalEditConflictError` flow (`:705-712`); `archiveNote` (`:718`) is itself just a status save. `createNote` (`:638`) and the frontmatter parser (`:449`) already default missing status to `seed` — D2 needs a regression lock, not a re-plumb. Expect **zero hunks in `src/lib/notes.ts`**.
3. **The F3 contract suite survives the extension.** `api/note.test.ts` asserts the `200` body per field (`body.slug`, `typeof body.updated`, `body.backlinks`) — there is no whole-object equality — and every existing 400-case payload already carries a body, so adding a `status` key to the `200` response and the at-least-one rule breaks no shipped test (audited line by line today).
4. **The shared state route builds clean.** A temporary `src/pages/status/__probe/[state].astro` (no `getStaticPaths`) built with exit 0 on this exact `output:'server'` + `@astrojs/node` config; worktree clean after removal — so `/status/[state].astro` needs no route plumbing beyond the file itself. One trap verified: `refreshVaultIndex` throws on the first corrupt note file (`notes.ts: ~978`, its own doc-comment says so), while the dashboard reads notes one-by-one and skips the broken — the state page must use the dashboard's tolerant pattern.

Also verified today on this worktree: `npm install` exit 0, `npm run test` 9 files / 171 tests exit 0, `npm run build` exit 0 (F3's shipped state is green), and the scripted-browser Chromium is on disk at `/opt/hermes/tools/chromium-1208/chrome-linux/chrome` (F3's R8 host fact, re-checked).

## Technical Context

**Language/Version**: TypeScript on Node.js ≥ 20 (repo runs Node 26.7.0); `astro check` not wired — `npm run build` catches syntax/import errors, types are advisory (F2/F3 precedent; `npx tsc --noEmit` stays available as a voluntary gate).

**Primary Dependencies**: `astro ^7.3.8` (locked 7.3.8), `@astrojs/node ^11.1.8`, `markdown-it ^15.0.2` (F3 consumer — untouched by F4), `simple-git ^4.0.2` (untouched — F4 never commits, D3/Q6), `vitest ^5`, `@playwright/test ^1.64.1` (verification only, no config/spec files added). **Added by this plan: nothing** — zero runtime and zero dev-dependency changes (D1/D7; locked into tasks' Done-when).

**Storage**: plain Markdown + YAML frontmatter via F1 `src/lib/notes.ts` — status is an existing frontmatter field; no new persisted state, no schema migration, no new files in the vault (D1).

**Testing**: `npm run test` → `vitest run` (node env, `*.test.ts` only); `npm run build` → `astro build`. Browser-only facts are covered by one-off scripted checks against `astro dev` (temp vault) using the installed Chromium — no `*.spec.ts`, no `playwright.config.ts`, therefore no vitest include-collision (F2/F3's R8 lesson kept).

**Target Platform**: local-first web app, loopback only (`astro dev`/`astro preview` default to localhost; never `server.host: true`, never `--host`).

**Performance Goals**: dashboard and `/status/[state]` views interactive < 500 ms locally (PRD §8 view budget, spec SC-007); status save round-trip is one small file write + one full-vault index read — same shape as F3's body save, which already ships inside budget.

**Constraints**: offline / zero non-loopback access (FR-011); zero data loss — no silent overwrite of external edits, no dirty buffer ever discarded by a status save (SC-002, clarification Q2); no git commits from status saves (FR-006) and no commits/push from this plan card (D1); `npm install` + `npm run test` + `npm run build` must stay green (D7).

**Scale/Scope**: single-user, ≤ 5,000 notes (PRD §8); per-request reads today (see Research R7).

**No NEEDS CLARIFICATION items remain** — all 5 spec clarifications are resolved in `spec.md`; the implementation-level questions they deferred (exact payload validation order, the client disable/conflict-intent model, the state page's read strategy and F6 export surface) are decided in this plan.

## Constitution Check

*GATE: `.specify/memory/constitution.md` is still the unfilled `[PROJECT_NAME]` template — it defines **no gates**, so no constitution gate can pass or fail (same finding as F2's/F3's plans and the prior F4 chain; re-checked this session). Complexity Tracking is therefore empty of violations (see bottom).*

In place of constitution gates, the plan is checked against the binding PRD §8 non-functional requirements:

| PRD §8 requirement | How this plan satisfies it | Re-check after design |
|---|---|---|
| Data loss: zero tolerance | Status save runs the page-load snapshot → `ExternalEditConflictError` → the SAME inline reload/overwrite choice as body save (FR-003); the select is disabled while edit mode is open or any save is in flight, so a status post can never stale a dirty body buffer's snapshot (Q2); an omitted body keeps disk truth (Q1) | ✓ |
| Note/list views < 500 ms (local) | Status page = one tolerant read pass + sort; dashboard = the existing per-request read + one more pure selector; status save = one write + one index read (F3-proven shape) | ✓ |
| Network exposure: loopback only | No config change; the select posts same-origin only; never `--host` | ✓ |
| Vault format: plain Markdown + YAML | Unchanged — F1 serialization only; status is an existing frontmatter key in the canonical order (`notes.ts:70-78`) | ✓ |
| Offline / no network service | No outbound calls anywhere in the feature path; all decisions are local pure functions | ✓ |
| Accessibility: keyboard-only | A native `<select>` + native links/buttons (inherently keyboard-reachable), conflict pair already focusable, zero bare global bindings (FR-011, SC-006); F3's printable-key sweep stays green | ✓ |
| Scalability: 5,000 notes | Per-request reads are the shipped F2/F3 precedent; R7 records the trigger point and follow-up instead of building caching speculatively | ✓ |

## Project Structure

### Documentation (this feature)

```text
specs/f4-note-lifecycle/
├── spec.md                 # clarified spec (input, unchanged by this step)
├── plan.md                 # THIS FILE (/speckit.plan output; research/data-model/contracts/quickstart consolidated)
├── checklists/requirements.md   # 16/16 (specify/clarify step; untouched here)
└── tasks.md                # Phase 2 output (/speckit.tasks — NOT created by this step)
```

### Source Code (repository root) — proposed end state

```text
src/
├── lib/
│   ├── notes.ts                # UNCHANGED — ZERO hunks (D1/D2: verify + regression-test only)
│   ├── notes.test.ts           # MODIFY: additive AC1 regression lock (default-seed on create + parse, enum validation already covered)
│   ├── status-list.ts          # NEW  pure state-list selectors + copy (F6 reuse surface, plan contracts §4)
│   ├── status-list.test.ts     # NEW  selection/order/tie-break/copy-param tests
│   ├── dashboard.ts            # MODIFY: + selectSeedsNeedingAttention + SEEDS_ATTENTION_LIMIT (D5)
│   ├── dashboard.test.ts       # MODIFY: additive seeds-selector cases
│   ├── wikilink-client.ts      # MODIFY: SavePayload loosened + statusSavePayload/statusDecision/statusControlEnabled (R3/R6)
│   ├── wikilink-client.test.ts # MODIFY: additive status-decision cases
│   ├── capture.ts / capture-client.ts / vault.ts / render.ts   # UNCHANGED
│   └── *.test.ts (capture*, vault, render)                     # UNCHANGED
├── pages/
│   ├── index.astro             # MODIFY: "Seeds needing attention" section; note rows + badges link (Q3/Q4)
│   ├── new.astro               # UNCHANGED
│   ├── note/[slug].astro       # MODIFY: header status <select> + badge link + disable matrix + shared conflict retry (R3)
│   └── api/
│       ├── capture.ts / capture.test.ts   # UNCHANGED
│       ├── note.ts             # MODIFY: extended payload per contract §1 (the D3 extension)
│       └── note.test.ts        # MODIFY: extended contract tests (status cases)
├── layouts/Base.astro          # UNCHANGED
└── styles/global.css           # UNCHANGED (page-scoped <style> only)
```

Unchanged file list (F2/F3-shipped, read-only for F4): `src/pages/new.astro`, `src/pages/api/capture.ts` + `capture.test.ts`, `src/lib/capture.ts`, `src/lib/capture-client.ts`, `src/lib/vault.ts`, `src/lib/render.ts` + `render.test.ts`, `src/layouts/Base.astro`, `src/styles/global.css`, `astro.config.mjs`, `package.json` / `package-lock.json`, `.ainative/project.yaml` (already lists all three gate commands — D7 confirmed on disk today). `README.md` gains an F4 section (docs house rule).

**Structure Decision**: single-project layout, one new directory (`src/pages/status/`) and one new lib module (`status-list.ts`). The F2/F3 rule carries over unchanged: **every behavior lives in `src/lib/*.ts` as pure functions, and the `.astro` pages only wire DOM to them** — which is what makes the state ordering, the seeds selection, and the status-save decisions testable under plain vitest without a browser. `notes.ts` is READ-ONLY in F4 (unlike F3, which had a sanctioned proven-gap edit): D2 says verify + regression-test, do not re-plumb, and the probes show nothing needs to change there.

---

## Research (Phase 0) — resolved unknowns, with evidence

Every entry: Decision → Rationale → Alternatives considered. All findings come from probes run in this session against this checkout (temporary probe files under the repo were removed immediately; `git status --porcelain` is empty apart from `specs/f4-note-lifecycle/`).

**R1 — D3 verdict: EXTEND `POST /api/note`; no new endpoint, no second write path.**
*Evidence*: live handler probes today (temp vitest file invoking the real `POST` against a `mkdtemp` vault, removed after run): body + `status:'growing'` + valid hash → **200, response `{slug, updated, backlinks}` with NO status field, on-disk status still `seed`** — the key is silently ignored because the handler destructures `{ slug, body, baseHash, force }` (`api/note.ts:49`) and re-reads disk truth for everything else (`:66-69`); status-only payload → **400** (body required, `:51`). So today's contract can neither change a status nor honestly reject an attempt to.
*Decision*: extend the handler to the contract in §1 — `body` becomes optional, `status` is added, at least one of the two must be present, out-of-enum status → `400 invalid-payload` BEFORE any vault read/write, `200` gains `status`. Everything downstream (snapshot compare, `saveNote`, `refreshVaultIndex`, response) is reused verbatim.
*Alternatives*: (b) new `PATCH /api/note/<slug>/status` — rejected: D3 forbids a new endpoint and it would fork the conflict machinery into a second UX; (c) reuse `POST /api/capture` — rejected: capture is create-only (`mode:'new'`), extending it would couple a mutation to F2's create contract; (d) write status directly with `archiveNote`-style lib calls in the handler — rejected: duplicates the snapshot/409 flow that `saveNote` already owns.

**R2 — Payload validation order and the `200.status` addition.**
*Decision*: validate strictly in this order — JSON parse → plain-object check → `slug` non-empty string → `baseHash` non-empty string → **presence: `body !== undefined || status !== undefined` (at least one)** → type checks (`body` string when present; `status` string when present; `force` boolean when present) → **`status` ∈ enum** → `assertValidSlug(slug)` → vault ops. Rationale: every 400 class must be decidable without touching the vault (a malformed request can never create a partial write), and the enum check must precede `readNote` so an out-of-enum status is a clean `400`, not a `404`/`500` dressed as one. The `200` body gains `status` (the saved value) alongside `slug`/`updated`/`backlinks` — harmless to F3's per-field tests (audited), useful to any future no-reload client.
*Alternatives*: lenient parsing (trim/lowercase the incoming status) — rejected at the API boundary per spec Assumption (exact match; trimming is the frontmatter parser's job for disk files); accepting `status` without `baseHash` (a "trusted" mutation path) — rejected: no second trust model in a single-user loopback app, and it would bypass the 409 guarantee.

**R3 — Note-view control: one shared conflict UX, disabled matrix, last-attempt retry.**
*Decision*: the header `<select id="note-status-select">` (four options, current preselected) fires on `change` → `statusDecision({ inFlight, changed })` → `statusSavePayload(slug, value, baseHash, force)` → the SAME `fetch('/api/note')` + `handleSaveResponse` path the body save uses, with the page keeping a `pendingPayload` (the last payload it sent, body-save or status-save) so the Overwrite control retries it with `force: true` — one conflict region, one retry semantics, for both flows. `disabled = editOpen || saveInFlight` (Q2) so a status post can never stale the body editor's snapshot; a `400/500` shows the inline message and reverts the select to the current status; `200` → `location.reload()` (badge/lists re-render from disk — AC2's observable, same proof style as F3's save). New attempts clear the conflict region first (hardening noted by the analyze pass of the prior chain — non-contradicting, lives inside the same wiring task).
*Alternatives*: a separate status-conflict box — rejected: two conflict UXs to keep in sync for one vault; optimistic badge update without reload — rejected for v1 (the reload is the AC2 proof and needs zero client state; a no-reload upgrade can consume `200.status` later); auto-post on an explicit "Save status" button — rejected at clarify Q2 (post-on-change is one gesture; the disable matrix already prevents the hazards).

**R4 — `/status/[state]` as a tolerant read + pure selector, F6-reusable.**
*Evidence*: temp `src/pages/status/__probe/[state].astro` built exit 0 on this config (removed; tree clean). `refreshVaultIndex` throws on the first corrupt file (verified + its doc-comment at `notes.ts ~978`), while `index.astro` deliberately reads `listNoteSlugs` → `readNote` per slug in try/catch and skips the broken one.
*Decision*: new pure module `src/lib/status-list.ts` exporting the selection + copy helpers (contract §4); the page validates `Astro.params.state` against `NOTE_STATUSES` (unknown → the same friendly-404 response pattern `note/[slug].astro` already uses), reads notes tolerantly like the dashboard, sorts via the selector, and renders param-driven heading/empty text. Sort: `updated` DESC (D4), slug ASC tie-break (determinism, matching `selectRecentNotes`' discipline).
*Alternatives*: reuse `refreshVaultIndex` for the read — rejected: one malformed file would 500 the browse view, violating the dashboard's shipped resilience posture (spec US2 scenario 4); put the selector in `dashboard.ts` — rejected: D5 owns `dashboard.ts` for the seeds selector, and the state list is F6's reuse surface, not dashboard chrome; hard-code the four headings in the page — rejected: D4 demands param-driven copy so F6 can reuse the pattern.

**R5 — Seeds selector + dashboard wiring.**
*Decision*: `selectSeedsNeedingAttention(notes, limit)` in `dashboard.ts` next to `selectRecentNotes` (same `RecentNoteLike` shape + `status`), filter `status === 'seed'`, sort `updated` ASC (least recently updated first — "needs attention"), slug ASC tie-break, cap `SEEDS_ATTENTION_LIMIT = 5` (D5 literals verbatim). `index.astro` adds the section after Recent notes (PRD §6 lists "recent notes, seeds needing attention" in that order); both tables' rows become `/note/<slug>` links and their badges (plus the seeds heading → `/status/seed`) become state links (Q3/Q4).
*Alternatives*: inline the filter in the page — rejected: breaks the pure-selector precedent that makes AC3 testable without a browser; include `growing` notes below a freshness threshold — rejected: D5 pins the filter to `seed` exactly; PRD AC3 says "`seed` notes sorted by least recently updated".

**R6 — Client decisions extend `wikilink-client.ts`; no second client module.**
*Decision*: add `statusDecision({ inFlight, changed })` → `'save' | 'ignore'`, `statusSavePayload(slug, status, baseHash, force)`, and `statusControlEnabled({ editOpen, saveInFlight })` → boolean to the existing module, and loosen `SavePayload` so `body` and `status` are each optional (at-least-one enforced by the builders, mirroring the server rule). Rationale: `handleSaveResponse` (200/409/400/500 branches, conflict-box reveal, focus semantics) is already exactly what a status save needs — a second module would duplicate it (the exact anti-pattern F3's R5 rejected for pending-create).
*Alternatives*: a `status-client.ts` — rejected above; putting decision logic in the page script — rejected: untestable under vitest without a browser, against the module rule every feature so far has kept.

**R7 — List freshness: per-request reads, no cache in F4.**
*Decision*: every dashboard load and state-page load re-reads the vault (the dashboard already does; the state page follows). Correctness first — a status change is visible on the very next view with no invalidation logic, which is literally AC2/SC-001.
*Trigger recorded for tasks*: if a measured temp-vault run at ~5,000 notes exceeds the 500 ms view budget, the follow-up (frontmatter-only read or an mtime-keyed cache) becomes a task — deliberately not built speculatively (YAGNI, F2/F3 precedent).
*Alternatives*: in-process cache invalidated on save — rejected: staleness against external editors (F1.5's whole point) for a single-user tool at today's vault sizes.

**R8 — Verification strategy: vitest + build + one scripted Chromium pass.**
*Evidence (this session)*: `@playwright/test@1.64.1` is declared, no `playwright.config.ts` exists, and the working Chromium is on disk at `/opt/hermes/tools/chromium-1208/chrome-linux/chrome` (re-checked; F3 shipped its browser evidence through exactly this path).
*Decision*: primary evidence = vitest suites (pure selectors + client decisions + endpoint contract tests invoked directly against `mkdtemp` vaults via `GARDEN_VAULT_DIR`) + `npm run build`; browser-only facts (select post-on-change, disable matrix, conflict flow live, link entry points, view timing) are checked by one-off scripted sessions run from the scratch dir against `astro dev` with a temp vault — recorded in the completion report, never added to `npm run test`. No `*.spec.ts` files (vitest would pick them up).
*Alternatives*: install the matching playwright browser revision — unnecessary; manual-only checklist — strictly weaker than the scripted version now that launch is proven.

---

## Technical Approach

### 1. Extended save endpoint `src/pages/api/note.ts` (R1/R2, D3, FR-001/004/006, US1)

The thin adapter grows one branch, not a second path: parse → validate per R2's order → `readNote` (disk truth) → apply ONLY the fields present (`body` when sent, `status` when sent) → `saveNote(..., { baseSlug, baseSnapshot, force })` → `refreshVaultIndex` → `200 { slug, status, updated, backlinks }`. No path logic, no git anywhere in the file (status saves never commit — FR-006, asserted by test). The `409/404/400/500/405` mapping is unchanged; `400` simply gains two new provable cases (neither field present; out-of-enum status).

### 2. Status control on `/note/[slug]` (R3/R6, D6, FR-003/005, US1)

Header gains `<select id="note-status-select">` beside the badge (badge itself unchanged, D6) wrapped as a link to `/status/<state>` per Q3 — with the select stopPropagation-free and separately focusable. Page state adds `pendingPayload` + `statusInFlight`; `change` → `statusDecision` → fetch → `handleSaveResponse` (shared). Disable matrix wired from `statusControlEnabled`. `200` → reload; `409` → the existing conflict box (message mentions the changed field generically), Overwrite → re-POST `pendingPayload` + `force`; `400/500` → `#note-status` message + select revert + re-enable.

### 3. Shared browse route `src/pages/status/[state].astro` + `src/lib/status-list.ts` (R4, D4, FR-007/008/009, US2)

Page: validate param (unknown → friendly 404, no stack) → tolerant per-slug read → `selectByStatus(notes, state)` → table rows (title link, badge, `<time>`) newest-first → param-driven `<h1>` + empty text. `status-list.ts` holds the ordering AND the copy map so F6 can import both without touching this page (contracts §4). Archived renders exactly like every state (FR-009).

### 4. Dashboard seeds section (R5, D5, FR-010, US3)

`selectSeedsNeedingAttention` + `SEEDS_ATTENTION_LIMIT` in `dashboard.ts` (pure, DOM-free); `index.astro` renders the section after Recent notes with link-wrapped rows, its heading linked to `/status/seed`, and an explicit empty state; Recent notes rows/badges become links (Q3/Q4). The existing `c`-shortcut and git-warning behavior stay untouched (F2-owned code paths in the same file — additive section only).

### 5. Tests (D7)

All hermetic: `mkdtemp` vaults, `GARDEN_VAULT_DIR`, no network, no writes to the repo `vault/`, no commits anywhere.

| File | Covers |
|---|---|
| `src/lib/notes.test.ts` (extended) | AC1 regression lock: `createNote` without status → `seed`; parser without a `status` key → `seed`; (enum validation + save-path status rejection already covered by F1's suite — extend only what is missing, additive) |
| `src/pages/api/note.test.ts` (extended) | status-only save → `200` + on-disk status changed + body/title/tags byte-identical to disk truth + `updated` monotonic (`>=` before — same-millisecond writes make strict `!=` flaky); body+status save → both applied; out-of-enum status → `400` + vault untouched; neither field → `400`; `200.status` present; stale `baseHash` + status → `409` + disk unchanged, then `force:true` → `200` + status applied + body still disk truth; **`git log` unchanged after status saves** (FR-006); every F3 case stays green untouched |
| `src/lib/status-list.test.ts` | `selectByStatus` filter exactness (non-matching states excluded incl. archived-vs-live), `updated` DESC order, slug ASC tie-break, input never mutated; copy helpers return the requested state's heading/empty text (never seed-shaped for other states) |
| `src/lib/dashboard.test.ts` (extended) | seeds selector: only `seed` rows, ASC order, slug tie-break, cap at limit (and at `SEEDS_ATTENTION_LIMIT` default), empty input → `[]`, input not mutated |
| `src/lib/wikilink-client.test.ts` (extended) | `statusDecision` in-flight guard + changed/unchanged truth table; `statusSavePayload` shape (`status` + `baseHash` + optional `force`, NO body key); `statusControlEnabled` matrix over editOpen × saveInFlight; `SavePayload` builders still emit valid body-only payloads (F3 regression) |

Unchanged suites (`capture*`, `render`, `vault`, and the untouched parts of `notes`) are the regression net — the whole suite must stay green.

## Data Model (Phase 1)

No new entities and no persisted shape changes — status is an existing frontmatter field in F1's canonical key order.

| Entity | Fields (source) | Validation / state |
|---|---|---|
| **Note.status** (persisted, F1) | one of `NOTE_STATUSES`, default `seed` | unchanged; F4 only ever writes it via `saveNote` |
| **Status-save request** (ephemeral) | `slug`, `baseHash`, `status?`, `body?`, `force?` | at least one of `status`/`body`; `status` ∈ enum else 400; omitted fields keep disk truth |
| **Pending payload** (page state) | last sent `{ slug, …fields, baseHash }` | lets the single Overwrite control retry either flow with `force` |
| **Status-control state** (page) | `editOpen`, `saveInFlight`, select value | `disabled = editOpen || saveInFlight`; unchanged value posts nothing |
| **State-list row** (rendered) | `slug`, `title`, `status`, `updated` | one per note of the requested state, `updated` DESC, slug ASC tie-break |
| **Seeds-attention row** (rendered) | `slug`, `title`, `updated` | `status==='seed'` only, `updated` ASC, slug ASC tie-break, cap 5 |

State transitions: `read → (change select) → status-saving → read(reload) | conflict(409) → (Reload) → read | (Overwrite) → status-saving(force) → read`; `status-saving → (400/500) → message + select revert`; edit mode locks the select for the whole `editing` interval.

## Interface Contracts (Phase 1) — surfaces beyond D1–D7's literals

**1. `POST /api/note` (EXTENDED contract — the D3 extension)**

Request:
```json
{ "slug": "retrieval-practice", "baseHash": "<sha from page load>", "body": "optional string", "status": "optional enum", "force": false }
```
`slug` and `baseHash` required (non-empty strings); at least one of `body`/`status` required; `body` string when present (may be `""`); `status` one of `seed|growing|evergreen|archived` when present (exact match); `force` optional boolean (default `false`).

Responses:

| Status | Body | Meaning |
|---|---|---|
| `200` | `{ "slug", "status", "updated", "backlinks" }` | saved; only the sent fields changed; `status` is the saved value; `backlinks` stays the in-request recompute (F3's AC2 proof, unchanged) |
| `409` | `{ "error": "external-edit-conflict", "disk": { "updated", "hash" } }` | disk moved on since page load; nothing written (unchanged shape) |
| `404` | `{ "error": "note-not-found", "slug" }` | slug doesn't exist (unchanged) |
| `400` | `{ "error": "invalid-payload" }` | malformed JSON/object, missing slug/baseHash, neither `body` nor `status` present, wrong field types, out-of-enum `status`, invalid slug — nothing written |
| `500` | `{ "error": "save-failed", "message" }` | vault IO failure — loud, never silent (unchanged) |
| `405` | JSON | method guard (unchanged) |

**2. Status-control client contract** — post-on-change; `disabled = editOpen || saveInFlight`; `200` → reload; `409` → shared conflict box (Overwrite retries the page's `pendingPayload` with `force:true`); `400/500` → inline message + select reverts to current; unchanged selection posts nothing; status saves carry NO body key (disk truth by construction).

**3. `/status/[state]` page contract** — param ∈ `NOTE_STATUSES` else friendly 404; rows = title (link to `/note/<slug>`), status badge, last-updated, ordered `updated` DESC (slug ASC tie-break); param-driven heading + empty text; tolerant per-note read (a malformed file is skipped, never a 500).

**4. `status-list.ts` export surface (the F6 reuse contract)** — pure, DOM/fs-free: `selectByStatus(notes, state)` (filter + order + tie-break, input not mutated) and the copy helpers (`statusHeading(state)`, `statusEmptyText(state)` or one combined `statusListCopy(state)`). F6's `/tags/[tag]` will import the ordering discipline and copy-param pattern from here; this surface is the reason ANALYZE = yes.

**5. Seeds-attention selection literals** — `SEEDS_ATTENTION_LIMIT = 5`; filter `status === 'seed'`; sort `updated` ASC; slug ASC tie-break (D5 verbatim; binding for any future consumer of the attention list).

*These are the surfaces D1–D7 do not spell out — the reason ANALYZE = yes at the bottom.*

## File-by-file changes

| File | A/M | What changes | Done when |
|---|---|---|---|
| `src/pages/api/note.ts` | M | extended payload per contract §1 (validation order R2; apply-only-sent-fields; `200.status`) | contract tests green; `git diff` shows no path/resolution/git logic added |
| `src/pages/api/note.test.ts` | M | status contract cases (table above) | new + all F3 cases green |
| `src/lib/wikilink-client.ts` + `.test.ts` | M | `SavePayload` loosened; `statusDecision`/`statusSavePayload`/`statusControlEnabled` | suites green incl. F3 body-save regression + disable matrix |
| `src/pages/note/[slug].astro` | M | header select + badge link + disable matrix + `pendingPayload` shared retry + conflict-box reset | build green; live flow matches US1 scenarios |
| `src/lib/status-list.ts` + `.test.ts` | A | pure state selectors + param-driven copy (contract §4) | suites green |
| `src/pages/status/[state].astro` | A | param-validated tolerant list route (contract §3) | build green; served routes match; unknown param → 404 |
| `src/lib/dashboard.ts` + `dashboard.test.ts` | M | `selectSeedsNeedingAttention` + `SEEDS_ATTENTION_LIMIT` + additive tests (contract §5) | suites green |
| `src/pages/index.astro` | M | seeds section; rows + badges + heading links (Q3/Q4); additive only | build green; live dashboard matches US3 |
| `src/lib/notes.test.ts` | M | additive AC1 regression lock | suite green; **`src/lib/notes.ts` diff is empty** |
| `README.md` | M | lifecycle states, status control, `/status/[state]`, seeds section, extended save contract, no-commit note | docs match shipped behavior; build still green |
| `astro.config.mjs`, `src/pages/new.astro`, `src/pages/api/capture*.ts`, `src/lib/{capture,capture-client,vault,render}.ts` + their tests, `src/layouts/Base.astro`, `src/styles/global.css`, `package.json`/lockfile, `.ainative/project.yaml` | — | **unchanged** | `git status` shows them untouched |

## AC verification matrix (the parent card's 3 acceptance criteria)

| # | Acceptance criterion | Automated evidence (`npm run test`) | Live evidence (quickstart) |
|---|---|---|---|
| **AC1** | Create without status defaults to `seed` | `notes.test.ts`: `createNote` w/o status → `seed`; parser w/o `status` key → `seed` (regression lock; D2 verified at `notes.ts:449/638`, zero diff on `notes.ts`) | Capture a note via F2 without status → frontmatter shows `status: seed`; open its view → badge `seed` |
| **AC2** | Status change updates frontmatter on save and propagates to badge, `/status/[state]`, dashboard lists | `api/note.test.ts`: status-only save → `200` + on-disk frontmatter changed + `updated` monotonic + body/title/tags untouched + `200.status`; `status-list.test.ts` + `dashboard.test.ts` prove the read side orders/filters from the same data | Browser: change status → reload shows new badge; `/status/<new>` lists it, `/status/<old>` doesn't; dashboard sections move it; conflict case shows the shared 409 box with both controls keyboard-reachable |
| **AC3** | Dashboard shows "seeds needing attention" (seeds sorted least recently updated) | `dashboard.test.ts`: only-seed filter, ASC order, slug tie-break, cap 5, empty case | Browser: fixture vault with mixed states/ages → section shows the ≤5 oldest seeds, oldest first, rows link to notes; tending a seed removes it on next load |

Supporting SCs: **SC-002** = conflict tests (409 keeps disk + pending change, `force` only via explicit branch, disabled-while-editing matrix); **SC-004/005** = status-list/dashboard selector suites + live 404 check; **SC-006** = keyboard sweep live (select reachable, no new bare bindings — F3's sweep must stay green); **SC-007** = quickstart timing; **SC-008** = loopback check; **SC-009** = in-suite `git log`-unchanged assertion.

## Validation & Quickstart (Phase 1 run guide)

Prerequisites: Node ≥ 20, no network after install, `GARDEN_VAULT_DIR` for hermetic runs. Run from the build worktree (`/opt/data/mnt/workspace/digitalGarden/.worktrees/t_bdceee6f` — shared worktree per the card; `node_modules/` is already installed from this session's baseline run).

```bash
npm install                 # no-op expected: zero dependency changes
npm run test                # expect: all suites green — F1/F2/F3 suites untouched-in-intent + new status-list cases + extended api-note/dashboard/wikilink-client/notes cases
npm run build               # expect: exit 0
```

API smoke (hermetic — never touches the repo `vault/`):

```bash
VAULT=$(mktemp -d) && git -C "$VAULT" init -q && git -C "$VAULT" commit --allow-empty -m 'seed' -q
GARDEN_VAULT_DIR="$VAULT" npm run dev        # http://localhost:4321/ (loopback only)
# seed a note via POST /api/capture {"title":"Alpha"} → 201 {slug:'alpha'}; fetch its baseHash from the note view page data, then:
# 1) POST /api/note {"slug":"alpha","status":"growing","baseHash":"<hash>"}                    -> 200 {status:'growing',...}; frontmatter says status: growing; body unchanged
# 2) POST /api/note {"slug":"alpha","baseHash":"<new hash>"}                                   -> 400 (neither body nor status)
# 3) POST /api/note {"slug":"alpha","status":"mature","baseHash":"<hash>"}                     -> 400 invalid-payload; file untouched
# 4) edit alpha.md behind the app's back, re-POST a status change with the stale hash          -> 409; file unchanged; then force:true -> 200 (status applied, disk body preserved)
# 5) git -C "$VAULT" log --oneline                                                             -> ONLY the seed commit: status saves never commit (FR-006)
# 6) GET /status/growing -> 200 listing alpha; GET /status/mature -> 404; GET /status/seed -> empty-state text naming 'seed'
```

Browser checklist (scripted, `executablePath: '/opt/hermes/tools/chromium-1208/chrome-linux/chrome'`, R8; run from the scratch dir — no files added to the repo):

1. Fixture vault (notes across all four states + >5 seeds at varied ages + one deliberately malformed file) → dashboard: seeds section = 5 oldest seeds, oldest first, rows link; Recent notes rows link; malformed file skipped, page renders.
2. `/note/<seed>` → select `growing` → badge updates after reload; `/status/growing` lists it; seeds section no longer does (AC2 propagation, < 500 ms view timing recorded).
3. Conflict flow: external edit mid-view → status change → shared 409 box → Reload (confirm) and Overwrite both work, nothing lost; select disabled while body edit is open and while a save is in flight.
4. Keyboard: Tab reaches select, badges, rows, conflict pair; no bare-key hijacks (F3's printable sweep unchanged).
5. `/status/nonsense` → 404; `/status/evergreen` (empty) → param-driven empty text; `/status/archived` lists archived notes.
6. Loopback: no non-loopback listener for the app port (`awk '$4=="0A"{print $2}' /proc/net/tcp{,6}`), no `--host` anywhere.

Cleanup: stop dev; temp vaults under `mktemp`/`TMPDIR`. Verification as written creates **zero** commits on the build branch (D1; the only git activity is the throwaway vault's seed commit). The repo's own `vault/` is never written.

---

## Risks & spec-internal tension (resolved here, not re-opened)

- **Second edits to F2/F3-owned files**: `api/note.ts`, `wikilink-client.ts`, `note/[slug].astro`, `index.astro`, `dashboard.ts` all ship from earlier features. Every change is additive-in-place with the unchanged-file list asserted in the gate task; any reviewer seeing diffs in those files should check them against the file-by-file table only.
- **`notes.ts` must stay ZERO-hunk**: D2 is verify + regression-test. If implementation seems to need a `notes.ts` change, that is a spec finding, not a task-time edit — stop and comment/block.
- **Same-millisecond `updated` flakiness**: `writeNoteFile` stamps ISO-with-ms, so a strict `updated !== before` assertion can flake when two writes land in one millisecond — tests assert monotonicity (`>=`) or seed an older fixture timestamp (handoff note carried from the prior chain's analyze I1, applied here at plan level).
- **Conflict-box-open + new status change**: Q2's disable matrix covers edit-open and in-flight but not "409 box already showing" — a repeat attempt re-posts the same stale hash → 409 again, and `pendingPayload` tracks the latest attempt so Overwrite stays coherent; the wiring clears the conflict region when a new attempt begins (handoff note from the prior chain's analyze U1, decided here).
- **Shared conflict UX couples both flows**: if F3's body-save contract ever changes shape, the status flow inherits it — recorded in contract §2 so nobody forks a second conflict box without re-running ANALYZE.
- **`status-list.ts` is an F6 contract surface**: its export shape (ordering + copy helpers) is deliberately small and pure; changing it later is a cross-feature change, not a local refactor.
- **Tolerant vs loud reads**: the state page and dashboard skip malformed notes; the direct note view still loud-fails. This asymmetry is shipped behavior (dashboard precedent), not an F4 regression — recorded so the critic does not read it as inconsistency.
- **Reload-after-status-save UX**: `location.reload()` resets scroll — chosen deliberately (server re-render = AC2 proof, zero client state); `200.status` already carries what a future no-reload upgrade needs.
- **5,000-note budget**: per-request reads may press 500 ms only at PRD scale; trigger point + follow-up recorded in R7 rather than speculative caching.

## Complexity Tracking

> Fill only if the Constitution Check has violations to justify — it has none (unfilled template, no gates). Additions beyond D1–D7 are recorded under Research R1–R8 and the Interface Contracts instead.

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Extended `POST /api/note` payload | browsers cannot write files, and D3 pins reuse of the existing protected save path | a new status endpoint would fork the snapshot/409 machinery into a second UX (D3 forbids it) |
| `status-list.ts` pure module | D4's F6-reuse requirement needs the ordering + copy discipline importable without the page | in-page logic is untestable under vitest and invisible to F6 |
| `wikilink-client.ts` extensions | status decisions must stay DOM-free-testable like every other decision in this app | a second client module would duplicate `handleSaveResponse` |
| `pendingPayload` page state | one Overwrite control must retry EITHER flow with `force` | two conflict boxes would fork UX and double the test surface |
| Tolerant per-note read on the state page | one malformed file must not 500 a browse view (dashboard precedent) | `refreshVaultIndex` throws on first corrupt file (verified) |

## ANALYZE verdict

**ANALYZE: yes — a read-only architecture review pass is warranted before implementation.**

Reason: the plan necessarily fixes contracts and cross-feature surfaces that D1–D7 do not spell out — (1) the extended `POST /api/note` payload: validation order, at-least-one rule, `200.status` (F3-owned endpoint, F3 tests are the regression net), (2) the disable/conflict-intent model sharing F3's conflict box via `pendingPayload` (a data-loss-adjacent interaction), (3) `status-list.ts`'s export surface as an explicit F6 reuse contract, and (4) the second round of edits to F2/F3-owned files (`index.astro`, `wikilink-client.ts`, `note/[slug].astro`, `dashboard.ts`). A read-only pass should bless these four; nothing in the plan re-opens D1–D7 or the 5 recorded clarifications.

## Out of scope for this step

No code, no `tasks.md`, no commits/push/PRs, no board-status changes, no writes outside this worktree's `specs/f4-note-lifecycle/`. Follow-on: `/speckit.tasks` (Phase 2), then the analyze-equivalent cross-artifact report, then the orchestrator's build → critic → tester chain with `ANALYZE: yes` feeding the review pass.
