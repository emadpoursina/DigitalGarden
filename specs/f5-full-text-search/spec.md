# Feature Specification: F5 Full-Text Search

**Feature Branch**: `digitalgarden/t_9ae936d6-f5-full-text-search` (spec card t_46c43bfc, parent t_9ae936d6)

**Created**: 2026-10-24

**Status**: Draft

**Input**: Parent card t_9ae936d6 — 4 acceptance criteria (AC1 shortcut opens `/search` focused with no prior query, AC2 query returns ranked title+snippet results < 300 ms on a 1,000-note vault, AC3 edit/delete reflected within one save cycle, AC4 arrows/Enter navigate only inside the results panel's focus scope), grounded in PRD §7 F5 (client-side index over title + body + tags, fuzzy search with snippets; its four acceptance criteria are the parent's AC1–AC4 verbatim), §4 Journey 3 (Find a Note: shortcut → focused input → results with title/snippet/tags < 300 ms → open or refine), §6 (app map: `/search` — search results with title, snippet, tags), §8 (search response < 300 ms on 1,000 notes; loopback only; zero data loss; 5,000-note scale benchmark), §9 (MiniSearch client-side index — Pagefind deferred to F18), §10 (Ctrl/⌘-K interaction pattern; modifier-only or command-mode shortcuts — bare printable keys never bound globally; screen-reader labels on search controls; WCAG 2.1 AA), §13 (open question: do `archived` notes appear in default search results or behind a filter?), and the on-disk F1/F3/F4 surface (`SearchDoc` + `buildSearchDocs` + `buildTagIndex` + `refreshVaultIndex` in `src/lib/notes.ts`, minisearch@7.2.0 installed with zero code behind it, the `/status/[state]` tolerant per-note read pattern, the F4 `/status/archived` listing policy, the DOM-free port pattern in `src/lib/wikilink-client.ts` + `capture-client.ts`).

**Provenance note**: sibling card t_460b8c48 completed an F5 spec chain on a now-removed worktree; its artifacts were lost with that worktree, so nothing is reused from disk. The locked decisions D1–D8 (on this card's body) and the acceptance criteria bind this spec; every code fact cited below was re-verified by fresh probes against THIS checkout (branch `digitalgarden/t_9ae936d6-f5-full-text-search` @ 921752c) today, not carried over.

Locked orchestrator decisions D1–D8 are recorded in "Locked Constraints" at the end of this document and are NOT open questions.

## Clarifications

### Session 2026-10-24

Headless clarify run (spec card t_46c43bfc, single-session chain): 4 questions raised, each resolved by selecting the recommended option grounded in locked decisions D1–D8 and fresh probes of this checkout; choice + rationale recorded here and applied to the relevant sections. D1–D8 were not re-opened.

- **Q: How is the MiniSearch instance configured (fields, boost, id, stored fields), given D1 names "title boosted" but no numeric values?** → **A: `fields: ['title', 'body', 'tags']` with `boost: { title: 2 }`, `idField: 'slug'`, `storeFields: ['title', 'slug', 'tags', 'status']`; `extractField` joins the `tags` array with spaces so tag terms index as text; prefix/fuzzy stay MiniSearch defaults (`prefix: true`, `fuzzy: 0.2`) tuned in planning.** Rationale: D1 pins the field set and "title (boosted)" — boost 2 is the smallest value that deterministically outranks body matches in MiniSearch's BM25+ scoring without drowning multi-term body relevance; slug is the only stable identity (F1); stored fields are exactly what rows display (D1) plus `status` for the archive filter; `tags` is a `string[]` on `SearchDoc` so `extractField` joining is required (verified against minisearch@7.2.0 `index.d.ts`: `extractField` fetches per-field values, arrays are not tokenized by default). (Applies to FR-003/FR-004, US2 scenarios 1–2, Edge Cases.)
- **Q: Where does the Ctrl/⌘-K listener live so it works "from any view" without touching Base.astro (D8 read-only)?** → **A: A tiny shared client module (`src/lib/search-shortcut.ts`, DOM-free predicate + wiring helper, same port pattern as F2/F3) imported by each page's own `<script>` (`index.astro`, `note/[slug].astro`, `new.astro`, `status/[state].astro`, `search.astro` itself as a no-op guard); Base.astro stays untouched.** Rationale: D8 forbids changing Base.astro/global.css, and each page already owns exactly one `<script>` with its own key discipline (F2 `c`, F3 Esc/popup) — a shared predicate keeps the modifier-only rule (D3/PRD §10) in one tested place while each page wires it in its own scope, so no global hijack and no Base churn. (Applies to FR-001/FR-002, US1 scenarios 1–4, Edge Cases.)
- **Q: What does the snippet show for a title-only or tag-only match (no body match to center the ~160-char window on)?** → **A: Fallback is the leading ~160 characters of the body (escaped, no `<mark>` when no body term matched); the row still shows title link + tags, and the archive state when applicable.** Rationale: D6 defines the window "around first body match" — when there is none, a leading excerpt keeps every row shape-identical (title + snippet + tags per AC2/Journey 3.3) with no empty-snippet hole; escaping still applies (XSS edge case) and `<mark>` appears only for real body hits so highlighting never lies. (Applies to FR-004, US2 scenario 2, Edge Cases.)
- **Q: How is the <300 ms budget measured (what counts, what vault, cold vs warm) so SC-003 is verifiable and not a vibe?** → **A: Seeded 1,000-note vault (deterministic generator, temp dir, real files through the tolerant read path); measured keystroke-to-rendered-results in the scripted Chromium (plan R8 host fact) for 5 representative queries × cold load + warm typed runs; budget is p95 < 300 ms; evidence recorded in the build report.** Rationale: AC2 says "completing within 300 ms for a 1,000-note vault" without a protocol — keystroke-to-render is the user-observable interpretation (Journey 3.3 "returns … in under 300 ms"), p95 over representative queries absorbs MiniSearch's first-search JIT warmth, and the seeded-vault + scripted-Chromium setup reuses the F2/F3/R8 verification posture the repo already practices. (Applies to FR-006, SC-003, US2 scenario 3.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open search from anywhere with the keyboard (Priority: P1)

The Gardener is reading a note (or sitting on the dashboard) and half-remembers another note. They press Ctrl-K (or ⌘-K on macOS); the search view opens with the input already focused and empty — no prior query, no stale results. They can start typing immediately. The shortcut works from every app view and never fires while they are typing a printable character into a field (it requires the modifier).

**Why this priority**: AC1 is the entry point to the whole feature — without a reachable, focused search view, the index has no observable surface. Journey 3 step 2 is exactly this story.

**Independent Test**: from the dashboard, a note view, and `/new`, press Ctrl/⌘-K and verify `/search` loads with the input focused and empty each time; type a bare `k` into a capture field and verify nothing navigates.

**Acceptance Scenarios**:

1. **Given** any app view (dashboard, note view, capture page, status browse), **When** the Gardener presses Ctrl-K (⌘-K on macOS), **Then** the browser navigates to `/search` and the search input is focused with no prior query text.
2. **Given** `/search` opened via the shortcut, **When** the page finishes loading, **Then** no search has run yet — the results panel shows its empty-prompt state, not stale results from a previous visit.
3. **Given** focus inside a text field (capture title/body, note editor), **When** the Gardener types printable characters (including `k`), **Then** the keystroke types the character and never navigates — the shortcut fires only with Ctrl/⌘ held.
4. **Given** `/search` opened directly by URL (bookmark, reload), **When** the page loads, **Then** the input is likewise focused and empty — focus does not depend on the shortcut path.

---

### User Story 2 - Type a query, get ranked results with snippets (Priority: P1)

The Gardener types "retrieval practice" into the focused input. Matching notes appear ranked by relevance — title matches first — each row showing the note's title (linking to its view), a ~160-character context snippet from the body with the match highlighted, and its tags. The round trip from keystroke to rendered results completes within 300 ms on a 1,000-note vault. A query with no matches gets an honest empty sentence naming the query, not a blank panel. Archived notes are searchable but hidden by default behind a filter the Gardener can toggle.

**Why this priority**: AC2 is the feature's core promise ("retrieve any idea without remembering where I filed it", F5 user story) and Journey 3 step 3. Everything else (freshness, keyboard nav) observes this result list.

**Independent Test**: seed a vault with notes whose distinctive words live in titles, bodies, and tags respectively; type each query and verify the title-match outranks the body-match, every row shows title link + highlighted snippet + tags, and a 1,000-note seeded vault measures < 300 ms keystroke-to-render; type a nonsense query and verify the named empty message.

**Acceptance Scenarios**:

1. **Given** the search view with the index loaded, **When** the Gardener types a query matching note titles, bodies, and tags, **Then** matching notes are listed ranked by relevance with title matches boosted above body-only matches.
2. **Given** a results list, **When** the Gardener reads a row, **Then** it shows the note's title (linking to `/note/<slug>`), a context snippet of ~160 characters around the first body match with the matched text highlighted and all HTML escaped, and the note's tags.
3. **Given** a vault seeded to 1,000 notes, **When** the Gardener types a query, **Then** results render within 300 ms of the keystroke (measured per the plan's perf protocol).
4. **Given** a query matching nothing, **When** the search runs, **Then** the panel shows an empty message naming the query — never a blank panel, never an error.
5. **Given** archived notes matching the query, **When** the search runs with default settings, **Then** archived notes are excluded from the list; toggling the archive filter includes them with their archived status visible.
6. **Given** an empty query (input cleared), **When** the input changes, **Then** the results panel returns to its empty-prompt state — no search runs on empty input.

---

### User Story 3 - The index stays fresh across edits and deletes (Priority: P1)

The Gardener edits a note (changing a distinctive word) or deletes one, then opens `/search` and queries for the changed word. The results reflect the edit — the edited note matches the new word and no longer matches the old one; the deleted note is gone from results. Freshness lands within one save cycle: the very next `/search` load after the save shows current data. A note file that cannot be parsed never takes the search view down — it is skipped like the dashboard and status views skip it.

**Why this priority**: AC3 ("update the search index within one save cycle") is what keeps search trustworthy; a stale index teaches the Gardener not to use search. It also wires the generic `refreshVaultIndex` hook D4 pins for F6.

**Independent Test**: with the app running, edit a note's distinctive word via the note save path and delete another note; reload `/search` and verify the edited note matches only the new word and the deleted note matches nothing; corrupt one note file on disk and verify `/search` still renders for every healthy note.

**Acceptance Scenarios**:

1. **Given** a note edited through the app's save path, **When** `/search` next loads, **Then** the index reflects the edit — the note matches its new text and no longer matches removed text.
2. **Given** a note deleted (trashed) through the app, **When** `/search` next loads, **Then** the deleted note appears in no result list.
3. **Given** a note file whose frontmatter or body cannot be parsed, **When** `/search` loads, **Then** the page still renders the index over every healthy note — one malformed file never 500s the view.
4. **Given** a successful edit, **When** the save completes, **Then** no second save path, no manual "reindex" step, and no git commit is introduced by the search refresh (F9 owns commits).

---

### User Story 4 - Keyboard-navigate results without hijacking the page (Priority: P2)

With results showing, the Gardener presses ArrowDown/ArrowUp to move a visible highlight through the rows and Enter to open the highlighted note. These keys work only while focus is inside the results panel — pressing arrows while typing in the search input moves the caret, and pressing them elsewhere on the page does nothing. The highlight is visible (and exposed to assistive tech) so keyboard-only use matches pointer use.

**Why this priority**: AC4 completes the keyboard-first loop (PRD §10, F8.4) but only observes the US2 result list, so it lands after it. Its scoping constraint is the safety property: a global arrow/Enter hijack would break every text field in the app.

**Independent Test**: run a query, Tab into the results panel, press ArrowDown twice + Enter and verify the third-row note opens; click back into the search input, press arrows and verify the caret moves and the highlight does not; press arrows with focus outside the panel and verify nothing happens.

**Acceptance Scenarios**:

1. **Given** results shown with focus inside the results panel, **When** the Gardener presses ArrowDown/ArrowUp, **Then** the highlight moves to the next/previous row (wrapping at the ends) and the movement is visible.
2. **Given** a highlighted row, **When** the Gardener presses Enter, **Then** the browser opens that note's view.
3. **Given** focus in the search input (or anywhere outside the results panel), **When** the Gardener presses ArrowUp/ArrowDown/Enter, **Then** the keys behave natively (caret movement / form behavior) — the results highlight never moves and no navigation happens.
4. **Given** keyboard-only operation, **When** the Gardener reaches the search view, **Then** every control (input, archive filter, result rows) is reachable by Tab alone with visible focus and screen-reader labels — zero pointer required.

---

### Edge Cases

- Query containing HTML/script markup (`<img onerror=…>`, `<script>`) → rendered as inert text everywhere (rows, snippet highlight, empty message): all dynamic strings are HTML-escaped before insertion (D6).
- Query that is only whitespace or emptied mid-typing → empty-prompt state, no search executed, no error.
- Very long query (pasted paragraph) → treated as a normal query (MiniSearch tokenizes it); must not throw or hang the page.
- Special characters (`[[`, `"`, `*`, CJK, emoji) → passed through to MiniSearch; no query-syntax crash — a query that MiniSearch cannot parse degrades to the named empty message, never a blank panel or exception.
- Vault with zero notes → `/search` loads focused with the empty-prompt state; any query yields the named empty message.
- A note file that cannot be parsed (malformed frontmatter/YAML) → skipped by the tolerant per-note read (US3 scenario 3); it stays on disk untouched and is simply not indexed.
- Trashed (deleted) notes → absent from the embedded docs and every result (F1 `listNoteSlugs` ignores dot-directories; `buildSearchDocs` maps only live notes).
- Archived notes → indexed with their `status` flag, excluded by default, includable via the archive filter (D5); their rows show the archived state so inclusion is never mistaken for live results.
- 1,000-note vault perf → keystroke-to-render < 300 ms measured per the plan's protocol (seeded vault, cold + warm runs); if a measured run cannot meet it, the follow-up is a plan/tasks decision, not a silent miss.
- Ctrl/⌘-K pressed while a modal/confirm dialog or another app has focus → browser-native behavior wins; the app never prevents default outside its own pages.
- `?q=` deep-link query param (if plan adopts one) → server never trusts it for file reads; it only pre-fills the input and the same client search runs.
- Rapid typing (debounced input) → only the latest query's results render (no out-of-order overwrite from an earlier slow search).
- Duplicate titles/bodies across notes → every matching note is a row (slug identity); rows are keyed by slug, never collapsed.
- Case differences (`SEED` vs `seed`, `AI` vs `ai`) → MiniSearch's default tokenization is case-insensitive; no custom casing logic.
- Tags with mixed case/whitespace on disk → matched through the stored `tags` array as authored; tag matching is substring per MiniSearch defaults, tuned in planning (D6).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST serve a search view at `/search` (`src/pages/search.astro` on the Base layout) that opens with the search input focused and no prior query required, reachable from any app view via Ctrl-K (⌘-K on macOS) and directly by URL (D2, D3, AC1).
- **FR-002**: The Ctrl/⌘-K shortcut MUST require the modifier (PRD §10 modifier-only rule): a bare printable key (including `k`/`K` typed into any field) MUST never navigate to search; the binding MUST NOT fire from inside editable regions except as a modified keystroke. The predicate lives in a tiny shared DOM-free client module (`src/lib/search-shortcut.ts`, F2/F3 port pattern) wired by each page's own `<script>` — `Base.astro` stays untouched (D3, D8, clarification Q2, AC1).
- **FR-003**: The search view MUST build its index client-side with MiniSearch from the `SearchDoc[]` the server embeds in the page (built via the existing `buildSearchDocs`/`refreshVaultIndex` shapes — no new server index endpoint); MiniSearch is configured with `fields: ['title', 'body', 'tags']`, `boost: { title: 2 }`, `idField: 'slug'`, `storeFields: ['title', 'slug', 'tags', 'status']`, an `extractField` that joins the `tags` array with spaces, and prefix/fuzzy at MiniSearch defaults (`prefix: true`, `fuzzy: 0.2`) as tuned in planning; stored/displayed per row are title, slug, tags + snippet (D1, clarification Q1, AC2).
- **FR-004**: Every query (non-empty input) MUST return matching notes ranked by relevance with title matches boosted above body-only matches; each row MUST show the title linking to `/note/<slug>`, a context snippet of ~160 characters around the first body match with the match highlighted via `<mark>` and all HTML escaped, and the note's tags. When no body term matched (title-only or tag-only hit), the snippet MUST fall back to the leading ~160 characters of the body (escaped, no `<mark>`) so every row keeps the same shape (D6, clarification Q3, AC2).
- **FR-005**: An empty query MUST run no search and show the empty-prompt state; a query with zero matches MUST show an empty message naming the query — never a blank panel, never an exception (US2 scenarios 4/6).
- **FR-006**: Query-to-rendered-results MUST complete within 300 ms on a 1,000-note seeded vault, measured as keystroke-to-rendered-results p95 over 5 representative queries × cold-load + warm-typed runs in the scripted Chromium against a deterministic seeded temp vault of real files (AC2, PRD §8, clarification Q4).
- **FR-007**: The search index MUST reflect edits and deletes within one save cycle: the next `/search` load after a save MUST index current vault content, via the generic `refreshVaultIndex` hook path (kept generic — index refresh, not search-specific); the client MUST additionally support an in-memory re-add/replace for the current session; a second hook MUST NOT be forked (D4, AC3).
- **FR-008**: The `/search` server read MUST be tolerant per-note (try/catch per file like the status view and dashboard): one malformed note file is skipped, never 500s the page; `refreshVaultIndex` (which throws on the first corrupt file) MUST NOT be the page's read path (D2, US3 scenario 3).
- **FR-009**: Archived notes MUST stay in the index carrying their `status` flag, MUST be excluded from default results, and MUST be includable behind an explicit archive filter showing their archived state; `visibility` MUST be carried on the doc for F10/F18 while v1 serves all notes on localhost with no hiding (D5).
- **FR-010**: ArrowUp/ArrowDown + Enter MUST navigate/open results ONLY while focus is inside the results panel (container-scoped listeners — the F3 `autocompleteKeyCommand`-returns-null-when-closed posture); document-global arrow/Enter hijack is FORBIDDEN (D7, AC4).
- **FR-011**: All search controls and rows (input, filter, result links) MUST be reachable by keyboard alone with visible focus and screen-reader labels; zero bare printable-key global bindings; all reads and client index work MUST run fully offline on the loopback interface with no non-loopback binding and no external network request (PRD §8/§10).
- **FR-012**: Validation MUST remain `npm install` + `npm run test` + `npm run build`, all green, with no new runtime or dev dependencies introduced by F5 — minisearch@7.2.0 is already installed (D8-adjacent gate, `.ainative/project.yaml` already lists all three).

### Key Entities

- **Search document**: one per live note — `{ slug, title, body, tags, status, visibility, updated }` (the existing `SearchDoc` shape in `src/lib/notes.ts`); slug is the identity; trashed notes have no document; malformed files are skipped, not documents.
- **Client index**: a MiniSearch instance constructed in the browser from the embedded `SearchDoc[]` — title boosted, body + tags indexed, title/slug/tags stored for display; rebuilt on each `/search` load (freshness via D4), patched in-memory on session edits.
- **Result row**: a ranked match — title link (`/note/<slug>`), ~160-char escaped snippet with `<mark>` highlight around the first body match, tags, and (when shown via the filter) the archived state.
- **Archive filter**: the default-exclude toggle for archived docs — the only query-scoped filter in v1; `visibility` is carried but not filtered (F10/F18 own that).
- **Results panel focus scope**: the container whose focused state gates ArrowUp/Down + Enter handling — keys outside it behave natively.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of Ctrl/⌘-K invocations from any app view land on `/search` with the input focused and empty; 0 bare-printable-key navigations to search (AC1).
- **SC-002**: 100% of non-empty queries return relevance-ranked rows (title matches above body-only matches) with title link + highlighted escaped snippet + tags; 100% of zero-match queries show the named empty message; 0 blank panels, 0 query-syntax crashes (AC2).
- **SC-003**: Keystroke-to-rendered-results completes within 300 ms on the seeded 1,000-note vault (plan protocol, cold + warm runs recorded) (AC2, PRD §8).
- **SC-004**: 100% of edits/deletes are reflected on the next `/search` load after the save (one save cycle); 0 manual reindex steps; 0 malformed-file page 500s (AC3).
- **SC-005**: Arrow/Enter navigate/open results in 100% of in-scope trials and do nothing observable in 100% of out-of-scope trials (input caret moves natively, page otherwise unaffected) (AC4).
- **SC-006**: Every search control and row is keyboard-reachable with visible focus; 0 bare printable-key global bindings introduced; 0 non-loopback network calls in the search path (PRD §8/§10).
- **SC-007**: `npm install` + `npm run test` + `npm run build` all green with zero new dependencies; the pre-existing `note.test.ts` unwritable-vault failure (root-environment artifact, recorded 2026-10-24) is unchanged-or-fixed but never worsened.

## Assumptions

- **Client-side index, server-embedded docs**: the server embeds the `SearchDoc[]` JSON in `/search`; the browser constructs MiniSearch — no search API endpoint, no server-side query path (D1/D2).
- **Title boost + MiniSearch defaults**: title matches outrank body matches via field boost; prefix/fuzzy behavior follows MiniSearch defaults as tuned in planning (D6) — exact values are a plan decision, not re-decided here.
- **Snippet shape**: ~160 characters around the first body match, HTML-escaped, `<mark>` highlight; title-only matches show the title row with a leading-body excerpt (plan pins the exact fallback).
- **One generic save hook**: `refreshVaultIndex` stays the single index-refresh hook for F5 and F6; F5 wires search freshness into it rather than forking (D4).
- **Archived-behind-filter is the v1 answer** to PRD §13's "do archived notes appear in default search results" question for search (D5 carries the notes.ts-header F1 decision); tag-listing policy stays F6's call.
- **v1 serves all on localhost**: `visibility` is carried on every doc but filters nothing in v1 (loopback-only serving is the privacy posture; F7/F10/F18 own public semantics) (D5).
- **No pagination in v1**: all matches render (single user, ≤ 5,000-note scale); SC-003 measures the budget and any follow-up is recorded, not built speculatively.
- **Entry shortcut only**: Ctrl/⌘-K navigates to `/search`; there is no command palette, no in-page overlay, no `/search?q=` contract promised here (plan may add pre-fill as an enhancement, never as a second read path).
- **Styling**: rows reuse the existing dashboard badge/table styling; page-scoped styles only — no new styling system, `Base.astro`/`global.css` untouched (D8).
- **No commits from this chain**: spec/plan/tasks artifacts only; the build card owns implementation; ship parks at the parent (D8).

## Spec Findings (gaps recorded per card directive — closed here or queued, not re-opened)

1. **Zero code behind minisearch today** (probed this checkout): `minisearch@7.2.0` is in `package.json`/`package-lock.json` and `node_modules/minisearch/dist/{cjs,es,umd}` is on disk, but no source file imports it — F5 is a greenfield consumer, not an extension.
2. **`buildSearchDocs` already carries everything D1 needs** (`slug/title/body/tags/status/visibility/updated`, `notes.ts:964-977`) and the notes.ts header already records the archived-stays-indexed decision — D1/D5 verify + consume, never re-plumb; `refreshVaultIndex` throws on the first corrupt file (own doc-comment + `readNoteWithSnapshot` path), so D2's tolerant page read must follow the dashboard/status pattern, not the index helper.
3. **No `/search` route exists** (probed `src/pages/`: `api/`, `index.astro`, `new.astro`, `note/`, `status/` only) — D2 creates exactly one file, `src/pages/search.astro`.
4. **No Ctrl/⌘-K binding exists anywhere** (probed all pages: only bare-`c` on dashboard, `Ctrl/⌘+Enter` on `/new`, `Escape` on note view) — D3 is additive; the F2/F3 printable-key discipline (capture-client `shouldOpenCapture`, `autocompleteKeyCommand` null-when-closed) is the posture D7 mirrors.
5. **The DOM-free port pattern is proven twice** (`wikilink-client.ts` 505 lines + tests, `capture-client.ts` 448 lines + tests): pure decision modules with injected side-effect ports, covered by plain vitest with no browser — D8's `src/lib/search.ts` follows it exactly.
6. **Baseline is 203/204 green** (`npm install` 0; `npm run test` 10 files, 1 pre-existing failure): `src/pages/api/note.test.ts` "500: unwritable vault fails loudly" expects 500 but gets 200 — the suite runs as root in this environment so chmod-based unwritability never bites. Unrelated to F5; recorded here so the plan/tasks gate (SC-007) cannot mistake it for an F5 regression. Build state to be measured in planning.
7. **PRD §13 open questions stay open except the search-archived one**: auto-suggested transitions (future), tag-listing archived policy (F6), global hotkey necessity, hosting choice, revisit prompts — recorded as out of scope, not silently decided. The search half of "do archived notes appear in default search results" is closed by D5 (filtered by default).

## Locked Constraints (Orchestrator Decisions D1–D8 — final, not open questions)

These decisions were made by the orchestrator (parent card t_9ae936d6) and are identical across every F5 sibling card. They bind the plan/tasks/implementation steps.

- **D1**: Index source is client-side MiniSearch built from the existing `SearchDoc[]` via `buildSearchDocs`/`refreshVaultIndex`. No new server index endpoint. Indexed fields: title (boosted), body, tags. Stored/displayed: title, slug, tags + snippet.
- **D2**: Route `/search` is `src/pages/search.astro` on the Base layout. Opens with input focused, no prior query required. Server embeds `SearchDoc` JSON via a TOLERANT per-note read (try/catch per file like the status view — never let `refreshVaultIndex`-throws-500 the page); client constructs MiniSearch in the browser.
- **D3**: Shortcut Ctrl/⌘-K from any view navigates to `/search` with input focused (PRD §10 modifier-only; no bare printable binding).
- **D4**: Save-hook — generic `refreshVaultIndex` is THE hook (one read pass). F5 wires search refresh into it (next `/search` load reflects edit/delete within one save cycle; in-memory client index re-add/replace path). Keep the hook generic (index refresh, not search-specific). NEVER fork a second hook — F6 consumes this one.
- **D5**: Archived/visibility — archived notes STAY in the index with status flag, filtered by default behind a filter (F1 decision in notes.ts header). `visibility` carried for F10/F18; v1 serves all on localhost, no hiding.
- **D6**: Snippet/ranking — context window around first body match (~160 chars, escaped HTML, `<mark>` highlight); title matches boosted; prefix/fuzzy per MiniSearch defaults tuned in planning. Perf evidence measured on seeded 1,000-note vault.
- **D7**: Keyboard scope — ArrowUp/Down + Enter navigate/open ONLY when focus is inside the results panel (container-scoped listeners, same posture as F3 `autocompleteKeyCommand` returns null when popup closed). No document-global arrow/enter hijack.
- **D8**: Ownership — this feature OWNS `src/lib/search.ts` (pure index/query/snippet helpers, vitest-covered) + `src/pages/search.astro` (+ minimal client wiring, DOM-free-port pattern). May READ `notes.ts`/`vault.ts`/`dashboard.ts` but MUST NOT change `buildSearchDocs`/`refreshVaultIndex` shapes or `Base.astro`/`global.css`. No commits (ship is parent-level).

## Dependencies & Out of Scope

**Depends on (exists today — verified on this checkout)**:

- F1 `src/lib/notes.ts`: `SearchDoc` (:180-188), `buildSearchDocs` (:964-977), `buildTagIndex` (:942-959), `refreshVaultIndex` (:982-998), `listNoteSlugs`/`readNote`, `NOTE_STATUSES` (:63) — covered by `src/lib/notes.test.ts` (incl. search-doc cases :207-228, :352-361).
- F2 `src/lib/dashboard.ts` (`selectRecentNotes` ordering discipline) + `src/pages/index.astro` (tolerant per-note read pattern :26-35, existing `keydown` wiring posture) + `src/lib/capture-client.ts` (`shouldOpenCapture` modifier/field discipline) + `src/lib/vault.ts` `resolveVaultDir()`.
- F3 `src/lib/wikilink-client.ts` (DOM-free port pattern + `autocompleteKeyCommand` null-when-closed posture) + `src/pages/note/[slug].astro` (conflict/send wiring, Esc scoping) + `src/pages/status/[state].astro` (tolerant read + param-validation + friendly-404 pattern).
- F4 `src/lib/status-list.ts` (pure selector + param-driven copy reuse surface) + `/status/archived` listing policy (archived visible as a state).
- Packages: `minisearch@7.2.0` installed (zero code behind it); `vitest` (`npm run test` → `vitest run`); gate `npm install` + `npm run test` + `npm run build` (`.ainative/project.yaml` already lists all three).
- PRD: §7 F5 AC1–AC4, §4 Journey 3, §6 `/search` app map, §8 perf (<300 ms/1,000 notes) + loopback/offline, §9 MiniSearch, §10 Ctrl/⌘-K + scoped keys + search-control labels, §13 archived-in-search question (closed for search by D5).

**Out of scope for F5** (owned by other features):

- Tag pages, `/tags`, tag index UI, browse chrome (F6 — consumes the D4 hook); full editor, autosave, themes (F8); commit-on-save/settings/push (F9); publishing and public visibility semantics, public search index (F7/F10/F18 — `visibility` carried now, filtered there); orphan report (F12); visual graph (F11); RSS/attachments/merge (F14–F19); server-side search API; search analytics/logging (local tool — no telemetry per PRD §9); query search over trashed notes; multi-filter/faceted search beyond the archive toggle; a command palette or search overlay.
