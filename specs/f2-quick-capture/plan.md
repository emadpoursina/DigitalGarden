# Implementation Plan: F2 Quick Capture

**Branch**: `digitalgarden/t_fb2bd371-f2-quick-capture` | **Date**: 2026-10-16 | **Spec**: [specs/f2-quick-capture/spec.md](./spec.md)

**Input**: Feature specification `specs/f2-quick-capture/spec.md` (clarified 2026-10-16, 5/5 questions resolved) + locked orchestrator decisions D1–D7 (parent card t_fb2bd371).

**FLOW_ID**: `flow_20261015_2154_f2qc9x`

**Step**: `/speckit.plan` (Phase 5/6). Deliverable is this plan — implementation, task breakdown, and code land in later steps.

> **Artifact consolidation (D6)**: D6 fixes the F2 artifact set at `specs/f2-quick-capture/{spec,plan,tasks}.md`, so the template's separate `research.md`, `data-model.md`, `contracts/`, and `quickstart.md` outputs are consolidated into this single file: "Research (Phase 0)" below, "Data Model" and "Interface Contracts" (Phase 1), and "Validation & Quickstart" (Phase 1).
> **Extension hooks**: `.specify/extensions.yml` does not exist → `before_plan` / `after_plan` hook stages skipped silently (both pre-check and mandatory post-check performed).

---

## Summary

Add a one-keystroke capture loop on top of F1's storage layer: a server-rendered `/new` capture page (autofocused form, bare keys type only, `Esc` back to dashboard), a `POST /api/capture` endpoint that validates → `createNote` (`status: seed`, `visibility: private`, unique slug) → git-commits `docs(note): capture <slug>` → answers `201/409/400/500`, and a live dashboard `/` with the `c` shortcut and a recent-notes list where the new seed lands on top after save.

The technical crux — verified empirically against the repo's locked versions, not assumed — is that **any on-demand (server-rendered) route makes `astro build` require an adapter**: Astro flips `buildOutput` to `"server"` as soon as one route has `prerender = false` (`astro@7.3.8` `dist/core/routing/prerender.js:31`), and `astro build` then throws `NoAdapterInstalled` (`dist/core/build/index.js:98-100`). Capture writes to disk and a dashboard that shows the just-saved seed are both on-demand by nature, so F2 adds `@astrojs/node` (`output: 'server'`, standalone adapter) — this is a real architecture/dependency decision beyond D1–D7, which is why **ANALYZE = yes** (verdict and exact contracts to bless at the end).

Second verified crux: `simple-git@4.0.2` strips every `GIT_`-prefixed variable (and `EDITOR`/`PAGER`-class keys) from the git child environment unless the key is named in `allowEnvironment`. On this host identity arrives *only* via `GIT_AUTHOR_NAME/EMAIL` + `GIT_COMMITTER_NAME/EMAIL`, so a naive `simple-git().commit()` fails with `Author identity unknown`. The commit helper must pass the four identity keys through `allowEnvironment`; with that, add+commit measured **80 ms** (budget: < 1 s).

## Technical Context

**Language/Version**: TypeScript on Node.js ≥ 20 (repo runs Node 26.7.0), Astro 7.3.8 (lock), `astro check` not wired — `npm run build` catches syntax/import errors, types are advisory.

**Primary Dependencies**: `astro ^7.3.8` (locked 7.3.8), `simple-git ^4.0.2` (locked 4.0.2), `vitest ^5`, existing `markdown-it`/`minisearch`/`codemirror` untouched. **Added by this plan**: `@astrojs/node ^11.1.8` (peer `astro ^7.2.1` ✓, resolves from the public registry ✓).

**Storage**: plain Markdown + YAML frontmatter in the vault via F1 `src/lib/notes.ts` (unchanged); no database.

**Testing**: `npm run test` → `vitest run` (node environment, no config file needed while only `*.test.ts` exist); `npm run build` → `astro build`. Playwright is declared but no browser binaries exist on this host and no system browser is installed, so browser E2E is **not** part of this plan's primary evidence (see "Verification strategy").

**Target Platform**: local-first web app, loopback only (`astro dev` / `astro preview` both print `http://localhost:<port>` and require `--host`/`server.host: true` to expose — never set, per D5).

**Project Type**: single Astro project (SSG today → SSR local app with F2; static public build stays a v1.1 concern and can still prerender individual routes with `export const prerender = true`).

**Performance Goals**: submit → saved + committed < 1 s (PRD §8; measured primitive: 80 ms for add+commit, ~1-5 ms for `createNote` on a temp vault); shortcut → caret < 200 ms (SC-001) — achieved by a thin SSR page with one bundled script.

**Constraints**: offline/no non-loopback network (FR-012, SC-007); zero data loss (FR-008/009/013); `npm run test` + `npm run build` must stay green (D5); never commit/push from this step (ban applies to this plan card; runtime commits are the *feature's* behavior, exercised only against a temp vault in verification).

**Scale/Scope**: single-user, ≤ 5,000 notes (PRD §8); recent-notes shows 5 rows (spec assumption).

**No NEEDS CLARIFICATION items remain** — all 5 spec clarifications were resolved in `spec.md`; the two open implementation questions they deferred (Esc confirm mechanism, dashboard entry-point placement) are decided in this plan.

## Constitution Check

*GATE: `.specify/memory/constitution.md` is an unfilled `[PROJECT_NAME]` template — it defines **no gates**, so no constitution gate can pass or fail (same finding as the clarify step). Re-checked after Phase 1 design: unchanged, no gates to violate. Complexity Tracking is therefore empty (see bottom).*

In place of constitution gates, the plan is checked against the binding PRD §8 non-functional requirements:

| PRD §8 requirement | How this plan satisfies it | Re-check after design |
|---|---|---|
| Quick capture → saved + committed < 1 s | `saveCapture` = one fs write + one git add/commit (measured 80 ms); endpoint awaits both and answers once; dashboard redirect is a separate navigation | ✓ |
| Network exposure: loopback only | No config change to host binding; `astro dev`/`astro preview` default to localhost (verified); no external fetches anywhere in the capture path | ✓ |
| Data loss: zero tolerance | `createNote` never overwrites (F1 `SlugConflictError`); conflict → inline choice, content preserved; commit uses pathspec commit so it cannot sweep or lose unrelated work; write-then-commit order means a commit failure still leaves the note on disk | ✓ |
| Vault format: plain Markdown + YAML | Unchanged — F1 serialization only | ✓ |
| Offline / no network service | `simple-git` runs a local binary only; no push, no telemetry | ✓ |
| Accessibility: keyboard-only operation | Real `<form>`/`<input>`/`<button>` controls, `autofocus`, no modal, no focus trap, conflict controls are buttons | ✓ |

## Project Structure

### Documentation (this feature)

```text
specs/f2-quick-capture/
├── spec.md                 # clarified spec (input, unchanged by this step)
├── plan.md                 # THIS FILE (/speckit.plan output; research/data-model/contracts/quickstart consolidated per D6)
├── checklists/requirements.md   # 16/16 (clarify step; untouched here)
└── tasks.md                # Phase 2 output (/speckit.tasks — NOT created by this step)
```

### Source Code (repository root) — proposed end state

```text
src/
├── lib/
│   ├── notes.ts                  # F1 storage (UNCHANGED — read-only base per D7)
│   ├── notes.test.ts             # F1 tests (UNCHANGED)
│   ├── vault.ts                  # NEW  vault-dir resolution contract
│   ├── vault.test.ts             # NEW
│   ├── capture.ts                # NEW  saveCapture: validate → createNote → commitCapture
│   ├── capture.test.ts           # NEW  save+commit path, degraded git, <1 s budget
│   ├── capture-client.ts         # NEW  pure client decisions (keys, submit guard, warn-once, conflict mapping)
│   ├── capture-client.test.ts    # NEW  focus discipline / shortcut / conflict / warn-once units
│   ├── dashboard.ts              # NEW  selectRecentNotes(list, limit)
│   └── dashboard.test.ts         # NEW
├── pages/
│   ├── index.astro               # MODIFY dashboard: capture entry + `c` shortcut + recent notes + warn banner
│   ├── new.astro                 # NEW  quick-capture page (form, conflict state, status region)
│   └── api/
│       ├── capture.ts            # NEW  POST endpoint (409/400/500 semantics)
│       └── capture.test.ts       # NEW  endpoint contract tests (direct handler invocation)
├── layouts/Base.astro            # UNCHANGED (D7 shell; pages need nothing more)
└── styles/global.css             # UNCHANGED (page-scoped <style> only — keeps this diff off shared files)

astro.config.mjs                  # MODIFY output:'server' + @astrojs/node (standalone)
package.json / package-lock.json  # MODIFY + @astrojs/node ^11.1.8 (npm install)
```

**Structure Decision**: single-project layout (the repo's existing `src/lib` + `src/pages` shape). No new directories beyond `src/pages/api/`; no separate backend package — the local app *is* the server (PRD §9 "same framework serves the local dev UI (v1)"). Rule for the whole feature: **every behavior lives in `src/lib/*.ts` with injected side-effect ports, and `.astro` pages only wire DOM to those functions** — this is what makes AC1/AC3/AC4 testable under plain vitest without a browser.

---

## Research (Phase 0) — resolved unknowns, with evidence

Every entry: Decision → Rationale → Alternatives considered. Findings come from probes run against this repo's locked versions (probe project pinned to `astro@^7.3.8`/`@astrojs/node@^11.1.8`, `simple-git@4.0.2` from this checkout) in a scratch directory — no repo files were modified by the probes.

**R1 — Rendering mode: `output: 'server'` + `@astrojs/node` (standalone).**
*Rationale*: capture must write to disk (browser cannot) and the dashboard must show the just-saved seed without a rebuild, so `/`, `/new`, and `/api/capture` are on-demand routes. Astro 7 flips `buildOutput` to `"server"` for any `prerender = false` route (`prerender.js:31`) and `astro build` then throws `NoAdapterInstalled` unless an adapter is configured (`build/index.js:98-100`; reproduced end-to-end: static build of an endpoint project exits 0, adding `export const prerender = false` makes it exit 1). With `adapter: node({ mode: 'standalone' })` the same project builds (exit 0), `astro dev` serves `POST` bodies, and `astro preview` serves the built app (`HTTP 200` on `POST /api/capture`).
*Alternatives*: (a) **dev-only app, no adapter** — build goes green but only because every route stays prerendered, in which case POST bodies are stripped: Astro logs `[router] /api/capture POST requests are not available in static endpoints` and the handler runs with an empty body; the feature would not work in any served form. Rejected. (b) **static pages + a second hand-rolled Node server for writes** — two servers, two ports, stale dashboard, contradicts PRD §9. Rejected. (c) **client-side-only capture** — impossible: browsers cannot write files. Rejected.

**R2 — Interface: JSON `POST /api/capture` endpoint, client `fetch`, full-page redirect on success.**
*Rationale*: JSON carries the 409 payload (existing slug) the inline conflict state needs, keeps typed content client-side until an explicit choice, and lets the client measure submit→response latency (SC-002). After `201` the client `location.assign('/')`, so the dashboard is *server-rendered fresh* — the "seed at top of recent notes with no manual refresh" requirement (FR-005) is satisfied by construction, with zero client-side list rendering code.
*Alternatives*: HTML `<form action="/api/capture" method="post">` navigation — cannot render an inline conflict state while preserving typed content (would need a round-trip page). Server actions/`Astro.actions` — a second, newer contract surface with no need here; plain endpoints are debuggable with `curl`. Client-side recent-notes re-fetch — duplicates F1 logic and still needs another endpoint. All rejected.

**R3 — Git commit recipe (D3) — this is the plan's highest-risk detail.**
*Finding*: `simple-git@4.0.2`'s `allowEnvironment` plugin takes the child env from `process.env` but **deletes every guarded key** (`git_*`-prefixed plus `EDITOR`/`PAGER`-class) unless it is named in the option; a guarded key supplied via `.env()` and not allowlisted rejects the task outright (`Use of "GIT_SSH_COMMAND" is not permitted without enabling allowUnsafeSshCommand`). Measured on this host: default instance → `git commit` fails with `Author identity unknown` (identity here exists only as `GIT_AUTHOR_NAME/EMAIL` + `GIT_COMMITTER_NAME/EMAIL`; `$HOME` points at a profile home with no `.gitconfig`).
*Decision*: construct the helper as `simpleGit({ baseDir: vaultDir, allowEnvironment: ['GIT_AUTHOR_NAME','GIT_AUTHOR_EMAIL','GIT_COMMITTER_NAME','GIT_COMMITTER_EMAIL'] })`, stage with `git.add(noteFile)` and commit with `git.commit(message, [noteFile])`. Verified: commit succeeds with `Emad Poursina <…>` author in **80 ms**; an unrelated pre-staged file stays staged and is **not** swept into the commit; a non-repo vault throws `fatal: not a git repository` → the degraded path.
*Alternatives*: passing `process.env` wholesale — rejected (blocked by the guard, and would leak `GIT_SSH_COMMAND`/`GIT_PAGER` into the child). Writing `user.name`/`user.email` into repo config — mutates the repository and contradicts the spec assumption "capture only sets the message". Rejected.
*Note*: `GIT_SSH_COMMAND` gets stripped silently — harmless, capture never pushes (F9.3 push is out of F2 scope).

**R4 — Commit scope and ordering.**
*Decision*: write the file first (`createNote`), then `add` + `commit -- <file>`; failures degrade to "saved without history" (FR-010). Pathspec commit is required: `git commit -m … -- newfile` fails with `pathspec … did not match any file(s) known to git` until the file is added, and once added, committing with the pathspec limits the commit to that path (verified both).
*Rejected*: `git add -A` / bare `git commit` — would commit the implementer's unrelated working-tree changes on a shared branch.

**R5 — Warn-once-per-page-session (FR-010, clarified Q4: reload starts a new session).**
*Decision*: `/new` sets `sessionStorage['dg.gitWarned'] = '1'` on a degraded save and navigates to `/?degraded=1` **only if the flag was not already set**; the dashboard shows the banner when `?degraded=1` is present and immediately `history.replaceState`s the URL back to `/`; on any load whose navigation type is `reload` the dashboard clears the flag (so a reload starts a fresh session, exactly as clarified). Decision logic lives as a pure function in `capture-client.ts` (`gitWarningDecision({ navType, hasParam, warned }) → { banner, warned }`) and is unit-tested.
*Alternatives*: `sessionStorage` alone — survives reload, violating the clarification. A flag on the dashboard module — lost by the required post-save navigation. Server session cookie — extra server state for one banner. Rejected.

**R6 — Vault path resolution (new contract, not covered by D1–D7).**
*Finding*: F1's functions take `vaultDir` as a parameter; no config module exists anywhere in the repo (searched `src/` for `vaultDir|process.env|VAULT` — only F1's parameter plumbing).
*Decision*: one new module `src/lib/vault.ts` exporting `resolveVaultDir()` = `process.env.GARDEN_VAULT_DIR` (when non-empty) else `join(process.cwd(), 'vault')`, used by both the dashboard and the endpoint. `process.cwd()` is the project root for `astro dev`/`build`/`preview` and for `node dist/server/entry.mjs` started from the repo root (documented prerequisite). The env override is what makes every test and every live smoke run hermetic (temp vault, temp git repo) — verification never commits to the feature branch.
*Alternatives*: `import.meta.url`-relative resolution — breaks in `dist/server/chunks/*`. A settings page (F-scope) — out of F2. Rejected.

**R7 — Loopback posture (D5).**
*Verified*: `astro dev` prints `Local http://localhost:<port>` and `Network use --host to expose`; `astro preview` and the standalone server both listened on `::1`/`localhost` only (inspected `/proc/net/tcp{,6}` — no `0.0.0.0` listener for our port). No `server.host` config, never `--host`. Plan keeps `astro.config.mjs`'s existing loopback comment and extends it.

**R8 — Verification strategy (no browser automation available).**
*Finding*: `@playwright/test` is declared, but no `~/.cache/ms-playwright` and no system Chromium/Firefox exist, so E2E would gate on a ~170 MB browser download.
*Decision*: primary evidence = vitest unit + integration tests over the `src/lib` modules (including the endpoint handler invoked directly), plus `npm run build`, plus a scripted manual browser checklist in "Validation & Quickstart" for the genuinely browser-only facts (autofocus timing, real key sweep, native `Esc` confirm). Playwright specs are **not** added by this plan (adding them would also require a `vitest.config.ts` exclude, because vitest's default include picks up `*.spec.ts`); if a later step wants them, it must add the browser install step and the vitest exclude together.

---

## Technical Approach

### 1. Capture route `/new` (D1, D4, FR-003/006/007)

`src/pages/new.astro`, server-rendered (inherits `output: 'server'`; no per-route flags needed).

Markup: a `<form id="capture-form">` containing `#capture-title` (`<input autofocus>`, `aria-label="Title"`), `#capture-body` (`<textarea>`, raw Markdown), `#capture-tags` (`<input>`, comma-separated text, `aria-label="Tags (comma-separated)"`), a visible Save `<button type="submit">`, a `#capture-status` region (`role="alert"`, for validation + save errors), and a hidden `#capture-conflict` region (`role="alert"`) holding the notice plus two `<button>`s: `#save-as-new` (first in DOM — the content-preserving choice) and `#open-existing`. Page-scoped `<style>` only.

Behavior (script bundles `capture-client.ts`):
- **Autofocus** (SC-001): `autofocus` attribute *plus* an explicit `#capture-title.focus()` on load — belt and braces, because autofocus can be ignored on restored tabs. No other JS runs before focus; no fonts/images block the page → caret within 200 ms.
- **Bare keys type only** (FR-006, D4): the page installs **no** document-level printable-key handler. The only key handlers are: `Enter` on the title (preventDefault → focus body, per spec Assumption "Enter in the title advances focus"), `Ctrl/⌘+Enter` anywhere in the form (submit), `Escape` on the document (FR-007), and the form's `submit` event. Modifier/`Shift`/arrow keys are untouched (native).
- **Esc → dashboard** (FR-007): native `window.confirm('Discard this capture?')` when any field is non-empty — chosen over a custom dialog because it is inherently keyboard-reachable, needs no focus trap, and cancel preserves everything typed (zero data loss). Empty fields navigate immediately with no prompt. On cancel the script refocuses `#capture-title`. Clarify Q3 rejected native dialogs for the *conflict* choice (two actions + content preservation) — that stays inline; this is the single-action discard confirm the spec left implementation-defined.

### 2. Save + commit path (D2, D3, FR-004/011/013)

`src/lib/capture.ts` exposes the whole operation so it is testable without HTTP:

- `parseCaptureTags(text: string): string[]` — split on commas, trim, drop empties. F1's `normalizeTags` (trim + case-insensitive de-dup) still applies inside `createNote`, so normalization has exactly one implementation owner (spec Q5).
- `captureCommitMessage(slug) → 'docs(note): capture ${slug}'` (D3 literal).
- `commitCapture(vaultDir, slug): Promise<{ committed: true } | { committed: false; reason: string }>` — the simple-git recipe from **R3/R4** (`allowEnvironment` identity allowlist, `add` + `commit(message, [file])`), wrapped in try/catch so it can **never** throw, plus a hard timeout (~900 ms, simple-git `timeout` plugin config) so a wedged git can never blow the 1 s budget or block capture (FR-010 "capture MUST NOT block or fail because of git").
- `saveCapture(vaultDir, input): Promise<CaptureResult>` — `input = { title, body?, tagsText?, mode: 'new' | 'unique' }`:
  1. **Validate first** (FR-013): trim `title`; empty/whitespace → return `{ kind: 'invalid', error: 'title-required' }` *before any fs write or git call* (no file, no commit). Reject a non-string/malformed payload as `invalid-payload`.
  2. **Create** (D2): `mode: 'new'` (default) → `createNote(vaultDir, { title, body, tags, status: 'seed', visibility: 'private', slug: slugify(title) })`. Because the slug is *explicit*, F1 throws `SlugConflictError` exactly when the title's slug belongs to a live note → `{ kind: 'conflict', slug }`. `mode: 'unique'` → omit `slug` so F1 auto-uniquifies through `resolveUniqueSlug` (`title`, `title-2`, …) → never conflicts (FR-009). `status`/`visibility` are always pinned to `seed`/`private` (D2, PRD F7.1).
  3. **Commit** (D3): `commitCapture(...)`; attach `git: { committed, reason? }` to the success result. `NoteValidationError`/fs errors → `{ kind: 'error', message }` (loud failure, nothing reported as saved — spec edge "Vault unreachable").
- Order matters: **write → commit**. A commit failure leaves the note on disk (FR-010), and the pathspec commit cannot lose or sweep other work (R4).

`src/pages/api/capture.ts` — thin adapter: parse JSON → `saveCapture(resolveVaultDir(), …)` → map to HTTP (contract in the next section). Nothing else lives here.

**Latency budget (SC-002, < 1 s)**: `createNote` = one small `writeFileSync` (≈1–5 ms), `commitCapture` = 80 ms measured, JSON parse/serialize < 1 ms → server-side ≈ 100 ms, leaving headroom for network/render. The clock stops at the `201` response for the automated test; the dashboard render after redirect is a separate navigation (measured live in quickstart).

### 3. Title-conflict UX (D2, FR-008/009, US4)

On `409 { error: 'slug-conflict', slug }` the client **stays on `/new`**: title/body/tags are untouched (they are still in the DOM fields), `#capture-conflict` becomes visible with the message `A note already exists at "<slug>"` and the two buttons, focus moves to `#save-as-new` (content-preserving choice), and `#capture-status` stays clear.

- **Save as new** → re-`POST` the same payload with `mode: 'unique'` → `201` → redirect `/` (US4.3: first free slug `title-2`, body/tags intact, committed normally).
- **Open existing** → `location.assign('/note/' + slug)` with no second prompt (spec Assumption: explicit user decision discards the draft). The navigation target is the F2 acceptance point; the route ships with F8 and may 404 until then (clarify Q2).
- Both controls are real `<button>`s inside the page, so Tab/Shift-Tab and `Enter`/`Space` reach them (no modal, no focus trap, satisfies PRD F8.4). While a request is in flight both buttons and the Save button are `disabled` (FR-011).

### 4. Dashboard `/` (D1, D4, FR-001/002/005)

`src/pages/index.astro` (currently the F1 scaffold placeholder) becomes:

- **Header**: `<a href="/new" id="capture-entry">Capture</a>` — the visible, keyboard-reachable entry point (FR-001), first focusable element in the header. Placement decision (clarify's outstanding item): header row, not the scaffold's `<nav>` list — discoverable, one Tab away, and identical for pointer users.
- **Recent notes**: server-side, `listNoteSlugs(vaultDir)` → `readNote` each → `selectRecentNotes(notes, 5)` (sort by `updated` DESC, ISO strings compare lexicographically, slice 5) → rows showing title, slug, status badge, last-updated (the spec's Recent-Notes Entry fields). **Rows are non-links in F2**: `/note/<slug>` 404s until F8, and shipping a dashboard full of dead links is worse than the spec's entity, which does not require clickability — only the conflict flow is explicitly sanctioned to navigate there. Recent-notes sizing assumes ≤ a few hundred notes; for vaults near the 5,000-note PRD scale the follow-up is frontmatter-only reads or an mtime pre-sort (documented, deliberately not built — YAGNI at F2 scope).
- **`c` shortcut** (FR-001/002, D4): one `document`-level `keydown` listener that fires `location.assign('/new')` only when *all* hold: `key === 'c'`, no `ctrl`/`meta`/`alt`, and the active element is not `input`/`textarea`/`select`/`[contenteditable]`. Everything else — including `c` typed into a field — falls through to native behavior. The predicate is the pure function `shouldOpenCapture({ key, ctrl, meta, alt, activeTag })`.
- **Degraded-history banner** (FR-010): the warn-once algorithm from **R5** (banner region + tiny script; pure decision function unit-tested).
- After a save the client navigates here with a full page load → the new seed is at the top of the list with no manual refresh (FR-005).

### 5. Focus discipline summary (AC3 / SC-004)

| Surface | Handler | Printable keys |
|---|---|---|
| `/` dashboard | `document keydown` → `shouldOpenCapture` only | untouched (no other bindings) |
| `/new` | `Enter` on title, `Ctrl/⌘+Enter`, `Escape`, form `submit` | untouched by design — no handler claims them |

Because `/new` binds nothing printable, the "100% of printable keys type, 0% trigger commands" property is structural, not a list to maintain; `capture-client.test.ts` still sweeps a–z, A–Z, 0–9 and punctuation through `shouldOpenCapture`/`isCaptureKeyCommand` to prove no predicate matches, and covers the dashboard side (the `c` predicate matches only the exact conditions above).

### 6. Tests (D5)

All tests are hermetic: temp vault via `mkdtemp` + `GARDEN_VAULT_DIR` override (endpoint tests set `process.env.GARDEN_VAULT_DIR` before invoking the handler), temp `git init` repo, no network, no writes to `vault/`, no commits to the feature branch.

| File | Covers |
|---|---|
| `src/lib/vault.test.ts` | env override wins; default resolves to `<cwd>/vault`; empty/whitespace override falls back |
| `src/lib/capture.test.ts` | `captureCommitMessage` literal; `saveCapture` happy path → file on disk with `status: seed`, `visibility: private`, derived slug, body verbatim (multi-line/fences), tags normalized; commit exists (`git log -1 --format=%s`) with the exact message; **save+commit < 1000 ms**; unrelated pre-staged file not swept; non-repo vault → `{ committed:false }` with the note still saved; missing identity → degraded, never throws; empty/whitespace title → `invalid` with **no file and no commit**; `mode:'unique'` → `title-2`; trash-freed slug → no conflict |
| `src/lib/capture-client.test.ts` | `shouldOpenCapture`: `c` + no focus → open; `c` in input/textarea/contenteditable → inert; modifiers/other keys → inert; `isCaptureKeyCommand`: only Esc / Ctrl+Enter / Enter-in-title match, full printable sweep matches nothing; double-submit guard (`inFlight` blocks the second submit); conflict mapping (409 → show state, keep fields, focus `#save-as-new`); 201 → `location.assign('/')`, degraded 201 → `assign('/?degraded=1')`, repeat degraded → `assign('/')`; `gitWarningDecision` truth table incl. `reload` clearing the flag; 400 → inline title message, no navigation |
| `src/lib/dashboard.test.ts` | `selectRecentNotes`: most-recently-updated first, limit 5, legacy date-only timestamps sort correctly, empty vault → `[]` |
| `src/pages/api/capture.test.ts` | endpoint contract verbatim: `201` body; `409 { error, slug }`; `400 { error:'title-required' }` (and no write); `500` on vault IO failure; `mode:'unique'` → `201` with `title-2`; `GET` → 405; end-to-end latency `< 1000 ms` |

Unchanged: `src/lib/notes.test.ts` (F1) must still pass untouched.

---

## Data Model (Phase 1)

| Entity | Fields (source) | Validation / state |
|---|---|---|
| **Capture Draft** (ephemeral, in-page) | `title`, `body` (raw Markdown), `tagsText` (one comma-separated string), `dirty`, `inFlight`, `conflict?: { slug }` | lives only in the open `/new` DOM; discarded on Esc/navigation (no persistence, v1 assumption); `title` must be non-empty after trim |
| **Note (seed)** (persisted, F1) | `title`, `slug`, `tags[]`, `status: 'seed'`, `visibility: 'private'`, `created`, `updated`, `body` | created via `CreateInput` with explicit slug (mode `new`) or auto-uniquified (mode `unique`); tags normalized by F1 |
| **Slug Conflict** (response state) | `slug` (existing live note), two choices | produced only by `SlugConflictError` → HTTP 409; never resolved server-side; never overwrites |
| **Recent-Notes Entry** (rendered) | `title`, `slug`, `status`, `updated` | top 5 by `updated` DESC, recomputed per request |
| **Git Commit (capture)** | message `docs(note): capture <slug>` | best-effort: `committed: true` or `{ committed:false, reason }`; write precedes commit; never blocks |
| **Vault config** (new, minimal) | `GARDEN_VAULT_DIR` env override, else `<cwd>/vault` | single source for dashboard + endpoint (contract below) |

State transitions (capture): `editing → (submit) → inFlight → saved(201) | invalid(400) | conflict(409) | error(500)`; `conflict → (Save as new) → inFlight → saved(201)`; `conflict → (Open existing) → navigate /note/<slug> (draft discarded, explicit)`; `inFlight` blocks re-entry (FR-011).

## Interface Contracts (Phase 1) — **new surface beyond D1–D7**

**1. `POST /api/capture`** (JSON; loopback only)

Request:
```json
{ "title": "Retrieval Practice", "body": "raw **markdown**…", "tagsText": "memory, spaced", "mode": "new" }
```
`title` required string; `body` optional (default `""` → title-only seeds are valid, US2.4); `tagsText` optional raw text; `mode` optional, `"new"` (default) | `"unique"`.

Responses:

| Status | Body | Meaning |
|---|---|---|
| `201` | `{ "slug": "…", "status": "seed", "git": { "committed": true } }` | saved + committed |
| `201` | `{ "slug": "…", "status": "seed", "git": { "committed": false, "reason": "…" } }` | saved, history degraded (FR-010 → warn once) |
| `409` | `{ "error": "slug-conflict", "slug": "<existing-slug>" }` | D2 conflict; client keeps draft |
| `400` | `{ "error": "title-required" }` / `{ "error": "invalid-payload" }` | FR-013; nothing written, no commit |
| `500` | `{ "error": "save-failed", "message": "…" }` | vault unreachable / fs failure — loud, never "saved" |
| `405` | JSON (GET) | method guard |

**2. `GARDEN_VAULT_DIR`** — optional env var; when set to a non-empty path it is the vault for that process, otherwise `<cwd>/vault`. Consumed only through `resolveVaultDir()` in `src/lib/vault.ts`.

**3. Capture commit construction (internal, but binding for every future commit helper)** — `simpleGit({ baseDir: vaultDir, allowEnvironment: [GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL, GIT_COMMITTER_NAME, GIT_COMMITTER_EMAIL] })`, then `add(<slug>.md)` + `commit(captureCommitMessage(slug), [<slug>.md])`, all failures converted to `{ committed:false, reason }` and bounded by a ~900 ms timeout.

*These three are the reason ANALYZE = yes*: D2 names "HTTP 409" but not the payload/status schema, D1–D7 say nothing about vault-path resolution, and the simple-git env allowlist is a cross-cutting contract every later commit (F8 editor save, F9 auto-commit) must reuse.

## File-by-file changes

| File | A/M | What changes | Done when |
|---|---|---|---|
| `package.json` | M | add `"@astrojs/node": "^11.1.8"` to `dependencies` | `npm install` succeeds, no other dependency drift (lock keeps `astro@7.3.8`, `simple-git@4.0.2`) |
| `package-lock.json` | M | regenerated by `npm install` | lockfile diff contains only the `@astrojs/node` subtree |
| `astro.config.mjs` | M | `output: 'server'`, `adapter: node({ mode: 'standalone' })`; extend the existing loopback comment ("never `server.host: true`, never `--host`") | `npm run build` exits 0 and logs `output: "server"` + `adapter: @astrojs/node` |
| `src/lib/vault.ts` | A | `resolveVaultDir()` (R6) | unit tests pass; endpoint + dashboard import nothing else for paths |
| `src/lib/capture.ts` | A | `parseCaptureTags`, `captureCommitMessage`, `commitCapture`, `saveCapture`, `CaptureResult` types (R3/R4) | `capture.test.ts` green incl. `<1000 ms` and degraded paths |
| `src/lib/capture-client.ts` | A | `shouldOpenCapture`, `isCaptureKeyCommand`, `shouldAcceptSubmit`, `handleCaptureResponse`, `gitWarningDecision` — pure, DOM-free (R5) | `capture-client.test.ts` green incl. printable-key sweep |
| `src/lib/dashboard.ts` | A | `selectRecentNotes(notes, limit)` | `dashboard.test.ts` green |
| `src/pages/api/capture.ts` | A | `POST` (+ `GET` 405) → `saveCapture(resolveVaultDir(), …)` → status mapping | `api/capture.test.ts` green; `curl` smoke in quickstart returns the table's statuses |
| `src/pages/new.astro` | A | form markup, conflict/status regions, page-scoped styles, script wiring to `capture-client.ts` | autofocus present on load; Esc/confirm/Enter/Ctrl+Enter behave per §1 |
| `src/pages/index.astro` | M | replace scaffold with header + Capture link + recent-notes list + `c` shortcut + warn banner (R5) | `npm run build` green; live smoke shows the seed on top |
| `src/layouts/Base.astro` | — | no change expected (slot shell suffices) | file untouched |
| `src/styles/global.css` | — | no change expected (page-scoped `<style>`) | file untouched |
| `src/lib/notes.ts`, `src/lib/notes.test.ts` | — | **read-only F1 base (D7)** — never modified | `git status` shows them unchanged |

## AC verification matrix (the parent card's 4 acceptance criteria)

| # | Acceptance criterion | Automated evidence (`npm run test`) | Live evidence (quickstart) |
|---|---|---|---|
| **AC1** | Dashboard shown → one keystroke focuses the quick-capture input | `capture-client.test.ts`: `shouldOpenCapture` returns open for `c` + nothing focused; inert for `c` inside `input`/`textarea`/`contenteditable` and for all modifier combos; `capture.test.ts` cannot cover focus (browser-only) → covered by build + smoke | Open `/`, press `c` → URL `/new` with caret in the title (DevTools performance: keypress → focused input < 200 ms); separate click on the header Capture link → same focused state; direct URL `/new` loads already focused |
| **AC2** | Submit title+body → saved `seed`/`private`, auto-derived slug, git commit, all < 1 s | `capture.test.ts`: `saveCapture` writes frontmatter exactly (`status: seed`, `visibility: private`, derived slug), `git log -1 --format=%s` = `docs(note): capture <slug>`, elapsed < 1000 ms (repeated 5×); `api/capture.test.ts`: `201` + latency | Against a temp vault: submit → `201`, file exists, commit exists, dashboard shows the seed **first** with no manual refresh; Network panel submit→response < 1 s; title-only capture saves with empty body; whitespace title → inline message, no file, no commit |
| **AC3** | Capture open → every printable key types, none trigger app commands | `capture-client.test.ts`: printable sweep (a–z, A–Z, 0–9, punctuation) matches no command predicate; only Esc / Ctrl+Enter / Enter-in-title are bound; Esc-with-empty → immediate `assign('/')`, Esc-with-text → confirm requested first (mocked `confirm` → cancel refocuses title, accept navigates) | Real browser key sweep on `/new`: every printable key inserts its character, no navigation (URL stays `/new`), focus never leaves the fields; typing `c` and `s` does nothing app-level; `Esc` with text prompts, with empty fields returns to `/` |
| **AC4** | Duplicate title → offer open-existing vs save-as-new | `api/capture.test.ts`: second identical title → `409 { error:'slug-conflict', slug:'…' }`; `mode:'unique'` → `201` slug `…-2`; slugged-equivalent titles ("Café Society"/"Cafe Society") collide; trashed slug → `201`; `capture-client.test.ts`: 409 keeps fields, shows both controls, focuses `#save-as-new`, "open existing" → `assign('/note/<slug>')`, "save as new" → re-POST `mode:'unique'` → `assign('/')` | Create note "Retrieval Practice", capture the same title → inline conflict with both controls reachable by Tab/Enter; Save as new → dashboard with `retrieval-practice-2`; Open existing → browser navigates to `/note/retrieval-practice` (404 until F8 is the sanctioned F2 acceptance point) |

Supporting SCs: **SC-006** (git degraded → save + exactly one warning) = `capture.test.ts` non-repo/identity cases + `gitWarningDecision` truth table; **SC-008** (duplicate submit → exactly one note) = `shouldAcceptSubmit` in-flight guard test; **SC-007** (zero non-loopback access) = config/quickstart loopback check (no outbound code paths exist); **SC-005** (0% overwrite) = F1's `SlugConflictError` guarantees + `409` mapping tests.

## Validation & Quickstart (Phase 1 run guide)

Prerequisites: Node ≥ 20, `git` on PATH with an identity resolvable **or** `GIT_AUTHOR_*`/`GIT_COMMITTER_*` exported (this host already exports them; `git var GIT_AUTHOR_IDENT` confirms). No network needed after install.

```bash
cd /opt/data/mnt/workspace/digitalGarden/.worktrees/t_fb2bd371
npm install                     # also materialises @astrojs/node
npm run test                    # expect: all green, incl. new capture/dashboard/api suites, F1 suite untouched
npm run build                   # expect: exit 0, logs output: "server" / adapter: @astrojs/node
```

Live smoke (hermetic — never touches `vault/` or the feature branch):

```bash
VAULT=$(mktemp -d) && git -C "$VAULT" init -q          # temp vault with its own git history
GARDEN_VAULT_DIR="$VAULT" npm run dev                   # prints Local http://localhost:4321/
```
1. `curl -s -o /dev/null -w '%{http_code}' http://localhost:4321/api/capture -X POST -H 'content-type: application/json' -d '{"title":"   "}'` → **400**, and `$VAULT` stays empty.
2. `curl -s -X POST … -d '{"title":"Probe Note","body":"hello","tagsText":"a, A, b"}'` → **201** with slug `probe-note`, `git.committed:true`; `git -C "$VAULT" log -1 --format=%s` → `docs(note): capture probe-note`; note file shows `status: seed`, `visibility: private`, tags `[a, b]`.
3. Repeat the same title → **409** `{"error":"slug-conflict","slug":"probe-note"}`; re-send with `"mode":"unique"` → **201** `probe-note-2`.
4. Browser: `/` → press `c` → caret in `/new` title (< 200 ms) → type title + body + tags → `Ctrl+Enter` → lands on `/` with the seed **first** in Recent Notes, submit→visible < 1 s (DevTools timing).
5. Key sweep on `/new` (a–z, A–Z, 0–9, `c`, `s`, punctuation): every key types; URL never changes; `Esc` with text prompts (Cancel → focus back on title), `Esc` empty → `/` instantly.
6. Conflict UI: capture the existing title again → inline conflict, Tab reaches both controls, "Save as new" preserves the typed body, "Open existing" navigates to `/note/<slug>`.
7. Degraded history: point the server at a temp directory that is **not** a git repo (`PLAIN=$(mktemp -d); GARDEN_VAULT_DIR="$PLAIN" npm run dev`) → capture still saves to `$PLAIN` with `git.committed:false` (`commitCapture` returns `fatal: not a git repository`); exactly one warning banner appears on the dashboard; a second capture in the same tab shows no second banner; reload the dashboard, then cause a new failure → the banner shows again. (Equivalent on a host whose git identity is not resolvable: strip `GIT_AUTHOR_*`/`GIT_COMMITTER_*` from the server's environment — commit fails with `Author identity unknown`, same degraded path.)
8. Loopback: with the app running, confirm no non-loopback listener (`awk '$4=="0A"{print $2}' /proc/net/tcp /proc/net/tcp6`) for the app port, and never start it with `--host`.

Cleanup: stop the dev server; temp vaults live under `mktemp`/`TMPDIR` and are pruned automatically. Verification as written creates **zero** commits on `digitalgarden/t_fb2bd371-f2-quick-capture`; live captures against the repo's own `vault/` are explicitly optional and would create real feature-branch commits (operator-visible) — do them only if a reviewer wants that specific evidence.

---

## Risks & spec-internal tension (resolved here, not re-opened)

- **Two-tabs edge case vs US4**: the spec's edge case says two simultaneous captures "both save under distinct unique slugs", while US4/SC-005/D2 require *every* title collision to surface the 409 choice. Under `mode:'new'` a simultaneous **same-title** submit gets a 409 with the draft fully preserved (zero data loss) rather than silently becoming `title-2`; different titles still both save. US4/SC-005/D2 are the stronger, acceptance-bearing statements, so they win; this is documented rather than silently reconciled. (Post-save dashboard ordering is unaffected: both outcomes redirect to `/`.)
- **`/note/<slug>` 404 until F8** — sanctioned by clarify Q2; acceptance point is the navigation itself.
- **simple-git env guard** is a footgun for every later card (F8/F9): recorded in the contract section so the implementer does not "simplify" it away; without the allowlist, AC2's commit can never succeed on this host.
- **Adapter addition** changes `dist/` shape (`dist/server` + `dist/client`) and makes `astro preview` the built-app runner; static public publishing (F10) remains possible per-route with `prerender = true`.
- **Vitest/Playwright collision**: this plan adds no `*.spec.ts`, so no vitest config is needed; if a later step adds Playwright it must also add a `vitest.config.ts` exclude for that directory.
- **Dashboard scale**: all-notes read per request is fine at F2 scale; documented follow-up for 5k-note vaults.

## Complexity Tracking

> Fill only if the Constitution Check has violations that must be justified — it has none (unfilled template, no gates). Architectural additions are recorded under Research R1/R3/R6 and the contract section instead.

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| `@astrojs/node` dependency + `output: 'server'` | Astro refuses to build any on-demand route without an adapter (`NoAdapterInstalled`); capture writes files and the dashboard must render live | dev-only static app cannot serve POST bodies at all (Astro strips them on static endpoints) |
| `GARDEN_VAULT_DIR` env contract | no config module exists; tests and smoke runs must be hermetic | hardcoding `<cwd>/vault` would make every test write into the repo |
| `allowEnvironment` identity allowlist | simple-git strips all `GIT_*` vars; identity on this host exists only as those vars | repo-local `user.name` config would mutate the repository and contradict "capture only sets the message" |

## ANALYZE verdict

**ANALYZE: yes — a read-only architecture review pass is warranted.**

Reason: the plan necessarily introduces contracts and a schema that D1–D7 do not fix — (1) the `POST /api/capture` request/response schema and its 201/409/400/500 semantics (D2 names only "HTTP 409"), (2) the `GARDEN_VAULT_DIR` vault-resolution contract (no vault config exists anywhere in the repo today), (3) the cross-cutting simple-git `allowEnvironment` commit recipe that F8/F9 will have to reuse, and (4) a dependency/rendering-mode change (`@astrojs/node`, `output:'server'`) that reshapes `dist/` and the app's run model for every later feature. A read-only pass should confirm these four before implementation; nothing else in the plan re-opens D1–D7.

## Out of scope for this step

No code, no `tasks.md`, no task breakdown, no commits/push/PRs, no board-status changes, no writes outside this worktree. Follow-on steps: `/speckit.tasks` (Phase 6), then orchestrator-decided implement/converge/critic/tester, with `ANALYZE: yes` feeding the optional architecture-review pass.
