# Implementation Plan: F5 Full-Text Search

**Branch**: `digitalgarden/t_9ae936d6-f5-full-text-search` (spec card t_46c43bfc, build card t_6367dde7) | **Date**: 2026-10-24 | **Spec**: [specs/f5-full-text-search/spec.md](./spec.md)

**Input**: Feature specification `specs/f5-full-text-search/spec.md` (clarified 2026-10-24, 4/4 headless questions resolved) + locked orchestrator decisions D1–D8 (parent card t_9ae936d6).

**Step**: `/speckit.plan` (Phase 5/6). Deliverable is this plan — implementation and task breakdown land in `tasks.md`; no code in this step.

> **Artifact consolidation**: the card fixes the F5 artifact set at `specs/f5-full-text-search/{spec,plan,tasks}.md` (F4 parity), so the template's separate `research.md`, `data-model.md`, `contracts/`, and `quickstart.md` outputs are consolidated into this single file: "Research (Phase 0)" below, "Data Model" and "Interface Contracts" (Phase 1), "Validation & Quickstart" (Phase 1).
> **Extension hooks**: `.specify/extensions.yml` does not exist → `before_plan` / `after_plan` hook stages skipped silently (both pre-check and mandatory post-check performed).

---

## Summary

F5 makes the vault searchable end to end: a new pure module `src/lib/search.ts` owns the MiniSearch configuration (Q1: title/body/tags, title boost 2, slug identity, tags joined via `extractField`, prefix/fuzzy defaults), the snippet builder (~160-char window, escaped, `<mark>` highlight, leading-excerpt fallback per Q3), and the container-scoped results-key router (D7 posture); a tiny shared `src/lib/search-shortcut.ts` owns the Ctrl/⌘-K predicate (Q2) wired by each page's own `<script>` so `Base.astro` stays untouched; a new server-rendered `src/pages/search.astro` embeds `SearchDoc` JSON via the tolerant per-note read (dashboard/status pattern — never `refreshVaultIndex`, which throws on corrupt files), focuses the input on load, and constructs the MiniSearch index in the browser; freshness rides the generic `refreshVaultIndex` hook (D4 — next `/search` load reflects edits/deletes, plus an in-memory re-add/replace path for the session); archived docs stay indexed behind a default-exclude filter (D5); and the 300 ms budget is proven on a seeded 1,000-note vault per the Q4 protocol.

Six facts verified against THIS checkout today drive the design, none assumed:

1. **MiniSearch is installed with zero consumers.** `minisearch@7.2.0` in `package.json` + lockfile, `node_modules/minisearch/dist/{cjs,es,umd}` on disk, and zero source imports — F5 is a greenfield consumer. Its `index.d.ts` confirms the options this plan uses: `fields`, `boost`, `idField`, `storeFields`, `extractField`, `tokenize`, `prefix`, `fuzzy`, `combineWith`, and the `add`/`addAll`/`discard`/`replace` mutation surface for the in-memory refresh path.
2. **`buildSearchDocs` already emits exactly what D1 indexes.** `SearchDoc{slug,title,body,tags,status,visibility,updated}` (`notes.ts:180-188`), built per live note at `:964-977`, with the archived-stays-indexed decision in the module header (`:30-36`). `tags` is a `string[]` — hence Q1's `extractField` join. Expect **zero hunks in `src/lib/notes.ts`**.
3. **The tolerant read pattern is proven twice.** `index.astro:26-35` (`listNoteSlugs` → per-slug `readNote` in try/catch, skip broken) and `status/[state].astro` (same shape + friendly 404). `/search` copies it verbatim. `refreshVaultIndex` (`notes.ts:982-998`) throws on the first corrupt file by documented design — it is deliberately NOT the page read path (spec Finding 2).
4. **The DOM-free port pattern is proven twice.** `wikilink-client.ts` (505 lines + tests: `autocompleteKeyCommand` null-when-closed, save/conflict/pending decisions via injected ports) and `capture-client.ts` (448 lines + tests: `shouldOpenCapture` modifier/field discipline, `captureKeyCommand` exactly-three-bindings). `search.ts` + `search-shortcut.ts` follow it exactly — pure decisions, injected side effects, plain-vitest coverage, no browser needed.
5. **No shortcut or route collisions exist.** Probed every page: dashboard binds bare-`c` (guarded by `shouldOpenCapture`), `/new` binds `Ctrl/⌘+Enter` + title-`Enter` + `Esc`, note view binds `Esc` (edit-closed only) — no page binds Ctrl/⌘-K, no page binds arrows/Enter globally. D3/D7 are purely additive.
6. **The gate baseline is green-minus-one-known.** `npm install` exit 0, `npm run test` 10 files / 203 of 204 green (the 1 failure is the pre-existing `note.test.ts` unwritable-vault 500 case — root bypasses chmod, unrelated to F5, recorded in spec Finding 6), `npm run build` exit 0 (measured this session).

## Technical Context

**Language/Version**: TypeScript on Node.js ≥ 20 (repo runs Node 26.x); `astro check` not wired — `npm run build` catches syntax/import errors, types are advisory (F2/F3/F4 precedent; `npx tsc --noEmit` stays available as a voluntary gate).

**Primary Dependencies**: `astro ^7.3.8`, `@astrojs/node ^11.1.8`, `markdown-it ^15.0.2` (untouched), `simple-git ^4.0.2` (untouched — F5 never commits), `minisearch ^7.2.0` (already installed — first code behind it), `vitest ^5`, `@playwright/test ^1.64.1` (verification only, no config/spec files added). **Added by this plan: nothing** — zero runtime and zero dev-dependency changes (locked into tasks' Done-when).

**Storage**: plain Markdown + YAML frontmatter via F1 `src/lib/notes.ts` — search reads existing files; no new persisted state, no schema migration, no new files in the vault.

**Testing**: `npm run test` → `vitest run` (node env, `*.test.ts` only); `npm run build` → `astro build`. Browser-only facts are covered by one-off scripted checks against `astro dev` (temp vault) using the installed Chromium — no `*.spec.ts`, no `playwright.config.ts`, therefore no vitest include-collision (F2/F3/F4's R8 lesson kept).

**Target Platform**: local-first web app, loopback only (`astro dev`/`astro preview` default to localhost; never `server.host: true`, never `--host`).

**Performance Goals**: keystroke-to-rendered-results p95 < 300 ms on the seeded 1,000-note vault (PRD §8, spec FR-006/SC-003, Q4 protocol); `/search` initial load interactive < 500 ms locally (PRD §8 view budget applied to the new surface).

**Constraints**: offline / zero non-loopback access (FR-011); zero data loss — search never writes to the vault, the refresh path is read-only (SC-004); no git commits from search (FR-007/SC-007); `npm install` + `npm run test` + `npm run build` must stay green (FR-012); `Base.astro`/`global.css`/`notes.ts` hook shapes read-only (D8).

**Scale/Scope**: single-user, ≤ 5,000 notes (PRD §8); per-request server embed + per-load client index build (see Research R7 for the scaling note).

**No NEEDS CLARIFICATION items remain** — all 4 spec clarifications are resolved in `spec.md`; the implementation-level questions they deferred (exact MiniSearch option values, the shortcut module's export surface, the snippet edge-case matrix, the perf harness shape) are decided in this plan.

## Constitution Check

*GATE: `.specify/memory/constitution.md` is still the unfilled `[PROJECT_NAME]` template — it defines **no gates**, so no constitution gate can pass or fail (same finding as F2's/F3's/F4's plans; re-checked this session). Complexity Tracking is therefore empty of violations (see bottom).*

In place of constitution gates, the plan is checked against the binding PRD §8 non-functional requirements:

| PRD §8 requirement | How this plan satisfies it | Re-check after design |
|---|---|---|
| Search response < 300 ms (1,000-note vault) | Client MiniSearch over embedded docs (no network round trip per keystroke); Q4 p95 protocol with seeded-vault evidence; R7 records the follow-up trigger | ✓ |
| Note/list views < 500 ms (local) | `/search` = one tolerant read pass + JSON embed (dashboard-proven shape); index build is one `addAll` over live docs | ✓ |
| Data loss: zero tolerance | Search writes nothing to the vault — the only writes in the feature path are the pre-existing save endpoints F5 does not touch; malformed files are skipped, never mutated | ✓ |
| Network exposure: loopback only | No config change; MiniSearch runs in-page; no fetch in the search path (docs are embedded server-side); never `--host` | ✓ |
| Vault format: plain Markdown + YAML | Unchanged — F1 serialization only; F5 adds no frontmatter keys | ✓ |
| Offline / no network service | No outbound calls anywhere in the feature path; all search decisions are local pure functions | ✓ |
| Accessibility: keyboard-only | Native `<input>` + checkbox filter + native links/buttons (inherently keyboard-reachable), container-scoped arrow/Enter (D7), Ctrl/⌘-K modifier-only (D3), labels on all search controls (FR-011) | ✓ |
| Scalability: 5,000 notes | Per-load `addAll` is the v1 shape; R7 records the trigger point and follow-up instead of building caching speculatively | ✓ |

## Project Structure

### Documentation (this feature)

```text
specs/f5-full-text-search/
├── spec.md                 # clarified spec (input, unchanged by this step)
├── plan.md                 # THIS FILE (/speckit.plan output; research/data-model/contracts/quickstart consolidated)
├── checklists/requirements.md   # 16/16 (specify/clarify steps; untouched here)
└── tasks.md                # Phase 2 output (/speckit.tasks — NOT created by this step)
```

### Source Code (repository root) — proposed end state

```text
src/
├── lib/
│   ├── notes.ts                # UNCHANGED — ZERO hunks (D1/D5: verify + consume only)
│   ├── vault.ts                # UNCHANGED — read-only (resolveVaultDir)
│   ├── dashboard.ts            # UNCHANGED — read-only (ordering discipline reference)
│   ├── search.ts               # NEW — F5 OWNS (pure: MiniSearch options, query, snippet, key router, archive filter)
│   ├── search.test.ts          # NEW — vitest for search.ts (DOM-free, no browser)
│   ├── search-shortcut.ts      # NEW — F5 OWNS (pure Ctrl/⌘-K predicate + wiring helper)
│   ├── search-shortcut.test.ts # NEW — vitest for search-shortcut.ts
│   ├── wikilink-client.ts      # UNCHANGED — read-only (port pattern reference)
│   └── capture-client.ts       # UNCHANGED — read-only (modifier/field discipline reference)
├── pages/
│   ├── search.astro            # NEW — F5 OWNS (/search: tolerant embed + focused input + client wiring)
│   ├── index.astro             # ADDITIVE — one Ctrl/⌘-K wiring line in existing <script> (D3)
│   ├── new.astro               # ADDITIVE — one Ctrl/⌘-K wiring line in existing <script> (D3)
│   ├── note/[slug].astro       # ADDITIVE — one Ctrl/⌘-K wiring line in existing <script> (D3)
│   └── status/[state].astro    # ADDITIVE — one Ctrl/⌘-K wiring line in existing <script> (D3)
├── layouts/
│   └── Base.astro              # UNCHANGED — read-only (D8)
└── styles/
    └── global.css              # UNCHANGED — read-only (D8)
```

**Structure Decision**: single-project web app — new lib modules beside the existing `*-client.ts` decision modules, one new page beside the existing routes, additive one-line wiring in four existing pages' scripts. No new directories, no new endpoints, no new dependencies.

---

## Research (Phase 0)

### R1 — MiniSearch configuration values (Q1 implementation)

*Decision*: construct with `{ fields: ['title', 'body', 'tags'], boost: { title: 2 }, idField: 'slug', storeFields: ['title', 'slug', 'tags', 'status'], extractField: (doc, field) => field === 'tags' ? (doc.tags ?? []).join(' ') : doc[field], }`; search with `{ prefix: true, fuzzy: 0.2, combineWith: 'AND' }` as the default, overridable per call.

*Rationale*: `fields`/`boost` are D1 verbatim with Q1's numeric boost (smallest value that deterministically outranks body matches under MiniSearch's BM25+ without drowning multi-term relevance). `idField: 'slug'` — the only stable identity (F1 slug contract). `storeFields` = exactly what rows display (D1) + `status` for the D5 filter — `body` is deliberately NOT stored (rows render snippets from the embedded docs lookup by slug, keeping the MiniSearch heap to display data; the full `SearchDoc[]` is already in the page for snippet windowing). `extractField` joins `tags: string[]` because MiniSearch's default extractor returns the raw value and arrays are not tokenized (verified in `index.d.ts`). `prefix: true` gives as-you-type completion; `fuzzy: 0.2` tolerates typos per D6 ("per MiniSearch defaults"); `combineWith: 'AND'` requires all terms (Journey 3's multi-word "retrieval practice" narrows instead of exploding).

*Alternatives considered*: `combineWith: 'OR'` (default) — rejected: multi-word queries on a 1,000-note vault return long low-relevance tails, working against SC-002's ranking promise. Storing `body` in the index — rejected: doubles in-memory text (embedded docs already carry it for snippets). Higher title boost (5–10) — rejected: single title-term matches would outrank multi-term body matches that are clearly more relevant.

### R2 — Snippet algorithm (D6 + Q3 implementation)

*Decision*: pure `buildSnippet(body, queryTerms): { html, matched }` — find the earliest case-insensitive occurrence of any query term in the body; window ~160 chars centered on it (clamped to string bounds, extended to word boundaries); HTML-escape the window, then wrap the matched term in `<mark>` (first occurrence only); when no term occurs in the body (title/tag-only hit), return the escaped leading ~160 chars with `matched: false` and no `<mark>` (Q3). Empty body → empty snippet string (row still shows title + tags — never a hole, never an error).

*Rationale*: D6 pins "window around first body match, escaped, `<mark>`"; Q3 pins the title/tag-only fallback. Earliest-term occurrence (not earliest query-string position) handles multi-term queries. Escape-then-mark ordering is the XSS posture (spec Edge Cases): marking first then escaping would emit a literal `<mark>` as text or, worse, pass through body HTML. Pure function over `(body, terms)` — no DOM, no MiniSearch dependency — so it is vitest-covered without a browser.

*Alternatives considered*: MiniSearch `match` positions from results — rejected: couples snippet to result-shape internals and complicates the DOM-free contract; a string scan over the already-embedded body is O(n) on one note and trivially testable. Whole-body render with CSS clamp — rejected: ships full bodies into every row's DOM (5,000-note scale) and leaks unescaped HTML.

### R3 — Shortcut predicate + per-page wiring (Q2 implementation)

*Decision*: `src/lib/search-shortcut.ts` exports pure `shouldOpenSearch({ key, ctrl?, meta?, alt?, shift? }): boolean` — true only when `(key === 'k' || key === 'K') && (ctrl || meta) && !alt && !shift`, with NO field/editable guard (unlike F2's `shouldOpenCapture`: a *modified* keystroke never types a character, so firing from inside a field is safe — Ctrl-K in a textarea types nothing, and navigating away with unsaved text is the user's explicit command, same as Ctrl/⌘+Enter submitting from `/new`'s form). Each of the four existing pages adds ~5 lines to its existing `<script>`: `import { shouldOpenSearch } …; document.addEventListener('keydown', (e) => { if (shouldOpenSearch({ key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey })) location.assign('/search'); });`. `search.astro` itself wires the same listener as a no-op guard (already on `/search` → `location.assign` to the same URL is harmless; alternatively skip when `location.pathname === '/search'` — plan leaves the exact guard to implementation, tasks pin the test).

*Rationale*: Q2's module placement with D8's Base-untouched constraint. No field guard is the deliberate difference from F2's bare-`c`: bare keys type, modified keys command (PRD §10's exact distinction). Per-page wiring (not Base) keeps each page's key discipline local and auditable — the F2/F3 printable-key sweep stays meaningful.

*Alternatives considered*: wiring in `Base.astro` — rejected: D8 read-only. A global `/search`-only listener with history push — rejected: no overlay/command-palette scope in v1 (spec Assumptions). `keydown` on `window` vs `document` — irrelevant; pages already use `document`, F5 matches.

### R4 — `/search` server read: tolerant embed (D2 implementation)

*Decision*: copy the `index.astro:26-35` / `status/[state].astro` tolerant pattern verbatim: `listNoteSlugs` → per-slug `readNote` in try/catch, skip broken → `buildSearchDocs(notes)` → `<script type="application/json" id="search-docs">` embed via `JSON.stringify`. Validate nothing (no params), 404 nothing (route is static `/search`). Malformed files are skipped server-side AND absent client-side (never indexed) — US3 scenario 3 holds at both layers.

*Rationale*: D2 mandates the tolerant read explicitly because `refreshVaultIndex` throws on the first corrupt file (spec Finding 2). The dashboard/status precedent is the audited shape; copying it keeps the failure posture identical across list views.

*Alternatives considered*: `refreshVaultIndex` + try/catch around the whole call — rejected: one corrupt file would zero the entire index (all-or-nothing), violating US3 scenario 3. A new `/api/search-docs` endpoint fetched on load — rejected: D1 "no new server index endpoint"; embed keeps search offline-first with zero fetch latency on the critical path.

### R5 — Client query flow + archive filter + in-memory refresh (D4/D5 implementation)

*Decision*: page load → `JSON.parse` the embed → `new MiniSearch(SEARCH_OPTIONS)` + `addAll(docs)` → keep a `Map<slug, SearchDoc>` for snippet lookup. Input handler (debounced ~100 ms): empty/whitespace → empty-prompt state; else `miniSearch.search(query, SEARCH_DEFAULTS)` → filter `status !== 'archived'` unless the archive checkbox is checked → map to rows via stored fields + `buildSnippet(docs.get(slug).body, terms)` → render with escaped strings (rows built via `textContent`/`createElement`, never `innerHTML` with dynamic data — the only `innerHTML` is the pre-escaped snippet `html`, which `buildSnippet` guarantees escaped). In-memory refresh: export pure `upsertDoc(docs, doc)` / `removeDoc(docs, slug)` list helpers in `search.ts` (operated on the embedded array) + `index.replace`/`index.discard` calls in page wiring — the session path for D4's "in-memory re-add/replace"; cross-load freshness comes free from the per-load rebuild (R4).

*Rationale*: D4's two-layer freshness (next-load rebuild + in-session patch) with the hook kept generic. Debounce absorbs rapid typing (spec Edge Cases: only the latest query renders — debounce + synchronous MiniSearch search makes out-of-order rendering structurally impossible). `createElement` row construction is the XSS posture matching `buildSnippet`'s escape-then-mark.

*Alternatives considered*: re-`addAll` on every keystroke — rejected: rebuild per keystroke wastes the index; search is synchronous and fast (< 300 ms budget has headroom). Server-sent events / polling for freshness — rejected: single-user local tool, per-load rebuild satisfies "within one save cycle".

### R6 — Results keyboard scope (D7 implementation)

*Decision*: pure `resultsKeyCommand({ key, panelFocused }): 'up' | 'down' | 'enter' | null` in `search.ts` — returns non-null ONLY when `panelFocused` is true and key is ArrowUp/ArrowDown/Enter; the page wires ONE `keydown` listener ON the results container (`panel.addEventListener`), so focus-outside-panel never reaches it (structural scoping, not a flag check that could drift). Selection state is a plain index into the current rendered rows (wrap-around via the F3 `moveSelection` discipline); Enter navigates via `location.assign('/note/' + slug)`. Highlight uses `aria-activedescendant` on the panel + `aria-selected` on rows (FR-011 screen-reader labels).

*Rationale*: D7's "same posture as F3 `autocompleteKeyCommand` returns null when popup closed" — but stronger: container-scoped listener means out-of-scope keys are unreachable by construction, not by predicate. `aria-activedescendant` keeps focus in the panel (no focus theft per row) while exposing the highlight to assistive tech.

*Alternatives considered*: document-global listener with a focus check — rejected: exactly the hijack shape D7 forbids; a stale flag could swallow caret movement in the input. Roving `tabindex` per row — rejected: heavier than `aria-activedescendant` for a v1 list; Tab reaches the panel once, arrows do the rest.

### R7 — Scale note (5,000 notes; plan-level, not built)

Per-request embed + per-load `addAll` is the v1 shape (dashboard/status precedent). If the 1,000-note p95 measurement (Q4) shows headroom, 5,000 notes need no work. If `/search` load or `addAll` time grows superlinearly, the recorded follow-up is: embed only `{slug,title,tags,status}` + lazy body fetch per snippet — NOT built now. The trigger is a measured miss, never speculation (same pattern as F3/F4 scale notes).

### R8 — Verification posture (F2/F3/F4 precedent, re-checked)

`npm install` + `npm run test` (vitest, `*.test.ts`) + `npm run build` stay the gate (FR-012). Browser-only facts (focus-on-load, Ctrl-K navigation, keystroke-to-render timing, container-scoped keys, 404-free `/search` with corrupt files) are covered by one-off scripted checks against `astro dev` on a hermetic temp vault (`GARDEN_VAULT_DIR=$(mktemp -d)`, seeded generator, `git init` + seed commit where the save path is exercised), launching Chromium at `/opt/hermes/tools/chromium-1208/chrome-linux/chrome` (F4's re-checked host fact — verify presence at build time, record if moved). No `*.spec.ts`, no `playwright.config.ts`, no repo files from scripts (run from the scratch dir).

---

## Data Model

No new persisted entities. F5 consumes the existing `SearchDoc` (`notes.ts:180-188`) unchanged:

```text
SearchDoc { slug, title, body, tags: string[], status, visibility, updated }
```

Derived runtime shapes (in-memory only, owned by `search.ts`):

```text
SearchRow { slug, title, tags: string[], snippetHtml (escaped, <mark> iff body hit), status }
SearchState { docs: SearchDoc[], index: MiniSearch, selected: number, archiveShown: boolean }
```

Validation rules: slug is the identity everywhere (rows keyed by slug, `Map<slug, SearchDoc>` lookup); `status === 'archived'` filtered by default (exact equality, same discipline as F4 `selectByStatus`); `visibility` carried, never filtered in v1 (D5).

## Interface Contracts

### §1 — `search.ts` export surface (THE F5 contract; tasks implement verbatim)

```text
SEARCH_OPTIONS: { fields: ['title','body','tags'], boost: { title: 2 },
  idField: 'slug', storeFields: ['title','slug','tags','status'],
  extractField: join-tags-with-space }
SEARCH_DEFAULTS: { prefix: true, fuzzy: 0.2, combineWith: 'AND' }
buildSearchIndex(docs: SearchDoc[]): MiniSearch   // new + addAll, no DOM
searchIndex(index, query, { archiveShown }): StoredHit[]  // empty/whitespace → []; archived filtered by default
buildSnippet(body: string, terms: string[]): { html: string; matched: boolean }
  // ~160-char window on earliest case-insensitive term hit, escaped, <mark> first hit only;
  // no body hit → escaped leading ~160 chars, matched:false; empty body → { html:'', matched:false }
upsertDoc(docs: SearchDoc[], doc: SearchDoc): SearchDoc[]  // replace-by-slug or append, no mutation
removeDoc(docs: SearchDoc[], slug: string): SearchDoc[]    // drop-by-slug, no mutation
resultsKeyCommand({ key, panelFocused }): 'up'|'down'|'enter'|null
moveSelection(delta, len, current): number  // F3 wrap discipline (re-export or duplicate — tasks pin)
escapeHtml(value: string): string           // &, <, >, " — shared by snippet + row rendering
```

`SearchDoc` type is imported from `../lib/notes` (type-only) — no runtime dependency on notes.ts.

### §2 — `search-shortcut.ts` export surface

```text
shouldOpenSearch({ key, ctrl?, meta?, alt?, shift? }): boolean
  // true iff (key==='k'||key==='K') && (ctrl||meta) && !alt && !shift
wireSearchShortcut(navigate: (url: string) => void): () => void
  // registers the document keydown listener, returns an unwire function (test seam);
  // the default navigate is location.assign — injected in tests, real on pages
```

### §3 — `/search` page contract

- Server: tolerant per-note read (R4) → `buildSearchDocs(notes)` → JSON embed `#search-docs`; input `#search-input` focused on load (`autofocus` + script `.focus()` fallback); archive checkbox `#search-archive`; panel `#search-results` (`role="listbox"`, `aria-activedescendant`); empty-prompt `#search-empty` copy: "Type to search your garden — title, body, and tags."; zero-match copy: `No notes match "<query>" — try different words.` (query escaped).
- Client: build index on load (R5); debounced input (~100 ms); rows as links `/note/<slug>` with badge-reuse classes for the archived state; page-scoped `<style>` only.
- Wiring additions to existing pages: one `wireSearchShortcut` import + call each in `index.astro`, `new.astro`, `note/[slug].astro`, `status/[state].astro` (R3).

### §4 — Perf protocol (Q4 implementation)

Seeded generator (deterministic PRNG, ~200-word bodies from a wordlist, 1–3 tags, mixed statuses incl. 10% archived, 1 corrupt file + 1 empty-body note planted): 1,000 real files in a temp vault → `astro dev` on a temp port → scripted Chromium: for each of 5 queries (title-hit, body-hit, tag-hit, multi-word, zero-match): cold load + type, warm re-type × 3 → record keystroke-to-rendered-rows ms → p95 < 300 ms budget. Evidence (per-query numbers + p95) goes in the build report.

## Validation & Quickstart

```bash
# 0. Orient (shared worktree, no new worktree, no commits):
cd /opt/data/mnt/workspace/digitalGarden/.worktrees/t_9ae936d6
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
git status --short --branch   # expect clean apart from ?? specs/f5-full-text-search/

# 1. Gate baseline (blocks everything else):
npm install && npm run test && npm run build
# expect: install 0; test 203/204 with ONLY the known note.test.ts unwritable-vault failure;
# build 0. Any OTHER failure is a blocker — comment/block, do not silently fix.

# 2. Per-module gates (during implementation):
npx vitest run src/lib/search.test.ts src/lib/search-shortcut.test.ts
npm run build   # after every .astro change

# 3. Scripted browser checklist (hermetic temp vault, Chromium executablePath
#    '/opt/hermes/tools/chromium-1208/chrome-linux/chrome', run from scratch dir):
#  a. Ctrl-K from /, /note/<slug>, /new, /status/seed → /search focused+empty each time
#  b. bare `k` typed in capture field → types, never navigates
#  c. 5 Q4 queries → ranked rows (title-first), snippet+mark+tags per row, timings recorded
#  d. nonsense query → named empty message; cleared input → empty-prompt state
#  e. archive filter off → no archived rows; on → archived rows with state shown
#  f. edit a note + delete a note → reload /search → edit reflected, deleted gone
#  g. corrupt file planted → /search still renders healthy notes
#  h. arrows/Enter inside panel → move/open; in input or outside → native/no-op
#  i. keyboard-only: Tab reaches input → filter → panel; labels present; focus visible
#  j. loopback check: no non-loopback listener for the app port; no outbound fetch in search path
#  k. seeded 1,000-note vault → Q4 p95 < 300 ms evidence

# 4. Final gate: npm install (no-op) + npm run test (all suites) + npm run build (exit 0);
#    git diff --stat confirms ZERO hunks in src/lib/notes.ts, Base.astro, global.css,
#    project.yaml, package.json/lockfile; vault/ has no new files; nothing staged.
```

---

## Complexity Tracking

> Empty — no constitution violations (no constitution gates exist) and no design complexity requiring justification: two new small modules + one new page + four one-line wirings, zero new dependencies, zero hunks in shared files.
