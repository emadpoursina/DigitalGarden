# Feature Specification: F3 Wiki-Links & Backlinks

**Feature Branch**: `digitalgarden/t_5927eb0f-f3-build-wiki-links-backlinks-implementa` (build card t_5927eb0f)

**Created**: 2026-10-18

**Status**: Draft

**Input**: Parent decomposition card t_eea78f10 (F3 chain) — 4 acceptance criteria (AC1 `[[` autocomplete, AC2 save recomputes backlinks, AC3 pending link creates note on first click, AC4 case-insensitive + slug-equivalence resolution), grounded in PRD.md §7 F3, §6 `/note/[slug]` reading view + edit mode, §4 Journey 2 (Connect Ideas), §8 (note view < 500 ms, zero data loss, loopback only, 5,000-note scale), §10 (keyboard-first, no bare global bindings), §13 (link-resolution open question — answered by clarification Q1 below), and the F1 index hooks in `src/lib/notes.ts` (`extractWikiLinks`, `resolveWikiLink`, `buildBacklinkIndex`, `refreshVaultIndex`).

Locked orchestrator decisions D1–D9 are recorded in "Locked Constraints" at the end of this document and are NOT open questions.

## Clarifications

### Session 2026-10-18

Headless clarify run (spec card t_27ac369d, pilot single-session chain): 5 questions raised, each resolved by selecting the recommended option; choice + rationale recorded here and applied to the relevant sections. D1–D9 were not re-opened.

- **Q: Does canonical resolution have to compare `slugify(target)` with a note's slug, or is matching raw slug/title case-insensitively enough?** → **A: It must compare — resolution is a three-tier, case-insensitive match: (1) exact slug, (2) exact title, (3) `slugify(target)` equals the slug; the first tier with any match wins, and ties inside one tier break to the lexicographically smallest slug.** Rationale: closes D3's known gap and AC4's "treat slugs derived from identical titles as equivalent". Probed against the current code: a note titled "Retrieval practice sessions" at slug `retrieval-practice` is NOT reachable today via `[[Retrieval Practice]]`, and `[[cafe society]]` does not reach "Café Society" — both produce neither a rendered link nor a backlink. Slugify-equality (lowercase, de-accent, punctuation→hyphen) is exactly AC4's equivalence, and the tier order preserves D3's locked slug → title precedence. (Applies to FR-003, US1/US4 scenarios, Edge Cases, Assumptions.)
- **Q: How does the user enter and leave edit mode on `/note/[slug]`?** → **A: An in-page toggle — the read view exposes a keyboard-reachable "Edit" control; activating it swaps in a raw-Markdown textarea prefilled with the note source plus Save and Cancel; `Esc` or Cancel returns to read mode, confirming first when the buffer is dirty. No separate edit URL in F3.** Rationale: D1 scopes a *minimal* edit surface; one route keeps F3 small (F8 ships the side-by-side/preview upgrades), the toggle is Tab/Enter reachable with no focus trap (PRD F8.4), and the dirty-exit confirm mirrors F2's proven zero-data-loss pattern. (Applies to FR-005, US2 acceptance scenarios, Edge Cases.)
- **Q: When a pending link is clicked and the note is created, what does the new note get and where does the user land?** → **A: `status: seed`, `visibility: private`, empty body, title = the link's target text, unique slug per F1 rules; the user lands on that note's read view (`/note/<slug>`), whose empty body shows the Edit affordance. If creation collides with an existing slug (defensive case), navigate to the existing note instead — nothing is ever overwritten.** Rationale: identical to F2's capture defaults (PRD Journey 1 step 3, F7.1), a click-through implies "take me to that note", and the collision branch reuses F2's 409 semantics rather than inventing a third outcome. (Applies to FR-009, US4 acceptance scenarios, Edge Cases.)
- **Q: Does saving an edit from F3's editor create a git commit?** → **A: No — F3 persists to disk only; commit-on-save is F9's acceptance criterion (`docs(note): update <slug>`, settings toggle, push), and F3 does not pre-implement it.** Rationale: none of F3's four ACs mentions commits; building it here would pre-empt F9's contract (toggle + degraded warning + push) and duplicate work. Zero data loss is not at risk — the file is written, and git history for *edits* resumes when F9 lands (F2's captures already commit today). **Known gap recorded**: between F3 and F9, edit saves do not appear in git history. (Applies to FR-006, Assumptions, Dependencies & Out of Scope.)
- **Q: How should save behave when the file changed on disk outside the app while the buffer was open (PRD F1.5)?** → **A: Use F1's snapshot conflict protection — the edit surface carries the snapshot from page load; if the disk copy moved on, save returns a conflict and the page shows an inline choice with two keyboard-reachable controls: "Reload from disk" (confirm first; discards the buffer) or "Overwrite" (explicit force). Never a silent overwrite, never a silently dropped buffer.** Rationale: PRD §8 zero data loss protects *both* sides — choosing automatically would destroy either the external edit or the typed buffer; the inline two-choice pattern is exactly F2's proven collision UX. (Applies to FR-007, US2 acceptance scenarios, Edge Cases.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read a note: rendered wiki-links + backlinks panel (Priority: P1)

The Gardener opens `/note/<slug>` and sees the note's Markdown rendered — headings, lists, code, tables — where every `[[wiki-link]]` in the prose is a link to the target note (using the alias text when written `[[target|alias]]`), and every target that does not exist yet shows a distinct "pending" marker instead. A Backlinks panel on the same page lists every note that links here: the referencing note's title (itself a link), its status, and the link text as written. Links resolve by the canonical rules, so case, slug-form, and slug-equivalent targets all land on the same note.

**Why this priority**: D1 — no reading view exists yet, and AC2/AC3/AC4 all need this surface before anything else in F3 can be observed.

**Independent Test**: Open `/note/<slug>` for a note that other notes link to; verify the rendered body shows resolved links as anchors and unknown targets as pending markers, and the panel lists each referencing note with its link text and status. Verify `[[Retrieval Practice]]`, `[[retrieval-practice]]` and `[[RETRIEVAL-PRACTICE]]` all render as the same anchor, and `[[cafe society]]` reaches "Café Society".

**Acceptance Scenarios**:

1. **Given** a note whose body contains `[[Existing Note]]`, **When** the note view loads, **Then** the target renders as a link to that note's view with the text `Existing Note`.
2. **Given** a body containing `[[Existing Note|an alias]]`, **When** the view loads, **Then** the link renders with the text `an alias` and points at `Existing Note`.
3. **Given** a body containing `[[No Such Note]]`, **When** the view loads, **Then** the target renders as a visually distinct pending marker carrying the text `No Such Note`, reachable by keyboard, and no note is created.
4. **Given** `[[Retrieval Practice]]` in a body where the note at slug `retrieval-practice` is titled "Retrieval practice sessions", **When** the view loads, **Then** the link resolves to that note (slugify-equivalence), not a pending marker.
5. **Given** a note with inbound links from a growing note and from an archived note, **When** its view loads, **Then** the Backlinks panel lists both, each with referencing title (link), status (archived flagged), and the link text; a self-link and an unresolved link never appear.
6. **Given** an unknown slug in the URL, **When** the page is requested, **Then** a 404 is returned — no crash, no stack trace.
7. **Given** `[[..]]` inside a code span or fenced code block, **When** the view loads, **Then** it renders literally as code, never as a link or marker.

---

### User Story 2 - Edit and save: backlinks recompute (Priority: P1)

The Gardener presses Edit on the note view, gets the raw Markdown source in a textarea, adds a `[[Link Target]]`, and saves. The note is written to disk, the backlink index is recomputed as part of that save, and the referenced note's Backlinks panel — on its very next view — now lists this note with the link text. If the file changed on disk in the meantime, the app offers an explicit reload-or-overwrite choice instead of destroying either version.

**Why this priority**: AC2 is the feature's core promise ("backlinks computed automatically on every save") — together with US1 it forms the MVP that delivers the whole network promise (AC2 + AC4). It depends on US1's surface existing, which is why it is listed second.

**Independent Test**: Edit a note to add `[[Other Note]]`, save, then open `Other Note` and verify its panel lists this note with that link text — with no manual rebuild step. Separately, modify the file externally during an open edit, save, and verify the conflict choice appears with the buffer intact.

**Acceptance Scenarios**:

1. **Given** the note view is open, **When** the user activates Edit, **Then** a textarea shows the note's raw Markdown source and Save/Cancel controls are keyboard-reachable.
2. **Given** an open edit containing a new `[[Link Target]]`, **When** the user saves, **Then** the note is persisted, the view returns to read mode showing the saved content, and opening `Link Target`'s view shows this note in its Backlinks panel with that link text — no manual index refresh.
3. **Given** an open edit with unsaved changes, **When** the user presses `Esc` or Cancel, **Then** the app confirms before discarding; on confirm it returns to read mode without saving, on cancel the buffer stays.
4. **Given** the file was changed by an external editor after the view loaded, **When** the user saves, **Then** an inline conflict appears with two keyboard-reachable choices — reload from disk (confirming first, discarding the buffer) or overwrite — and neither the disk content nor the buffer is changed until the user chooses.
5. **Given** an edit that only changes whitespace in the body, **When** the user saves, **Then** the save succeeds and any resulting backlink change (none) is still reflected correctly.

---

### User Story 3 - `[[` autocomplete while editing (Priority: P2)

While editing, typing `[[` opens a popup listing the vault's existing note titles, filtered live as the user keeps typing. Up/Down move the selection, Enter or Tab inserts `[[Selected Title]]` with the caret after the closing brackets, and Esc closes the popup only — the editor buffer is untouched. When the popup is closed those keys do nothing app-level: every printable character keeps typing.

**Why this priority**: AC1 / PRD Journey 2 step 2 — the accelerator that makes connecting frictionless. It can wait for the editor (US2) and degrades gracefully (raw typing still produces links), so it sits at P2, but it is acceptance-bearing for F3 and must ship before the feature closes.

**Independent Test**: Open the editor, type `[[`, verify the popup lists titles and narrows as you type; select with keyboard only and verify `[[Title]]` lands in the buffer; with the popup closed, verify Up/Down/Enter/Tab/Esc cause no popup, no insertion, no navigation.

**Acceptance Scenarios**:

1. **Given** the editor is focused, **When** the user types `[[`, **Then** a popup appears listing existing note titles (case-insensitively filterable by the text typed after `[[`), keyboard-navigable from the first keystroke.
2. **Given** the popup is open with a selection, **When** the user presses Down/Up, **Then** the selection moves within the popup only — the caret/buffer text is unchanged apart from typing.
3. **Given** the popup is open, **When** the user presses Enter or Tab, **Then** `[[Selected Title]]` replaces the in-progress `[[query` construct and the caret sits after `]]`.
4. **Given** the popup is open, **When** the user presses Esc, **Then** only the popup closes; the buffer keeps everything typed, including the `[[query`.
5. **Given** the popup is closed, **When** the user presses Up, Down, Enter, Tab or Esc, **Then** no popup opens, no text is inserted or removed by those keys beyond their native editing behavior, and no navigation occurs (Esc in a dirty buffer prompts the discard confirm instead — US2.3).
6. **Given** two notes with the same title, **When** the popup lists them, **Then** both rows are distinguishable (slug shown) and each inserts its own title text.

---

### User Story 4 - Pending link creates the note on first click (Priority: P2)

A rendered pending marker is an invitation: clicking it creates the missing note — titled with the link's target, defaults `seed`/`private` — and takes the Gardener to the new note's view. Exactly one note per click, ever; a slug that already exists navigates there instead of overwriting.

**Why this priority**: AC3 closes the loop between "I linked an idea I haven't written yet" and Journey 2's "type a new title to create it"; it depends on US1's marker rendering, so it comes last.

**Independent Test**: In a note, use `[[Future Idea]]`, save, click the pending marker on the view, and verify a note titled "Future Idea" with slug `future-idea`, `status: seed`, `visibility: private` now exists and is shown; double-click fast and verify exactly one note was created.

**Acceptance Scenarios**:

1. **Given** a pending marker for `Future Idea`, **When** the user clicks it, **Then** one note titled `Future Idea` (empty body, `seed`/`private`, unique slug) is created and the browser navigates to its view.
2. **Given** a pending-create request is in flight, **When** the user clicks the marker again, **Then** no second note is created.
3. **Given** a pending marker whose target slugifies to an existing note's slug but did not resolve (defensive collision), **When** the user clicks, **Then** the browser navigates to the existing note and nothing is overwritten.
4. **Given** the create request fails (vault unwritable), **When** the response returns, **Then** an inline error shows, the browser stays on the current note, and no partial note appears.
5. **Given** the marker for a target containing punctuation or accents (e.g. `[[Café Society!]]`), **When** the user clicks, **Then** the created note's title is the exact target text and its slug follows F1 slug rules.

---

### Edge Cases

- Empty or whitespace-only target `[[ ]]` / `[[]]` → not a link at all: rendered literally, never indexed (matches F1's extractor).
- `[[#heading]]` heading-fragment links → rendered literally and never resolved/created (F1's extractor drops them); documented divergence from full Obsidian semantics, acceptable for F3.
- `[[target]]` inside fenced code, inline code → literal, never linked, never indexed.
- Backslash-escaped `\[[target]]` → renders literally (Markdown escape wins) but the backlink index still records the link (F1's extractor does not honor backslash escapes) — accepted divergence, documented; neither side silently changes behavior.
- Raw HTML in a note body → shown as escaped text, never executed (no script injection through note content).
- Duplicate titles across notes → resolution picks deterministically (tier 1 slug, tier 2 title, tier 3 slugify; within a tier, smallest slug); the popup shows both rows with slugs.
- Multiple links from the same note → one panel row per link occurrence; a note never lists itself.
- Archived target/source → the link renders normally (target view works, status badge visible); archived sources stay in the backlink index with their status flag (D4).
- Trashed notes → excluded from resolution, rendering targets, and the backlink index (D4; F1 trash semantics).
- Unknown slug in the URL → 404 page.
- Save with an empty body → valid (a note may be reduced to a stub).
- Rapid double-save / double-click pending marker → exactly one write / exactly one created note.
- Very large vault (5,000 notes, PRD scale) → view still renders under the 500 ms target; if a fresh index read cannot hold that, the plan documents the follow-up rather than silently missing the target (see Assumptions).
- `Esc` in the editor with a dirty buffer prompts discard confirm; with a clean buffer returns to read mode immediately.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST serve a reading view at `/note/<slug>` that renders the note's Markdown (headings, emphasis, lists, links, code blocks and spans, tables) in a readable typographic layout, shows the note's title, status badge and last-updated metadata, and shows a Backlinks panel; an unknown slug MUST return 404 without crashing.
- **FR-002**: In rendered prose, `[[target]]` and `[[target|alias]]` MUST render as links to the resolved note's view with text = alias when present else target; an unresolved target MUST render as a visually distinct pending marker carrying the link text and reachable by keyboard; `[[..]]` inside code spans/fences and `[[#…]]` fragments MUST render literally; note-body raw HTML MUST render as escaped text.
- **FR-003**: Link resolution MUST be case-insensitive and follow the canonical three-tier order — exact slug, then exact title, then `slugify(target)` equal to the slug — with the first matching tier winning and ties inside a tier broken to the lexicographically smallest slug; the SAME rule MUST drive rendering, the backlink index, and any link insertion, so the three can never disagree.
- **FR-004**: The Backlinks panel MUST list one row per inbound link occurrence: referencing note title (a link to its view), the referencing note's status (archived visibly flagged), and the link text as written; it MUST include archived sources (D4), exclude self-links, exclude unresolved/pending links, and exclude trashed notes (D4).
- **FR-005**: The note view MUST expose a keyboard-reachable Edit control that swaps in a raw-Markdown textarea prefilled with the note's source, plus Save and Cancel; editing is BODY-ONLY in F3 (title/status/tags editing is out of scope); `Esc`/Cancel with unsaved changes MUST confirm before discarding.
- **FR-006**: Saving MUST write the note to disk and MUST re-read the vault into the backlink index as part of the save path, so that the saved link state is reflected on the next view with no manual rebuild (AC2); saving is explicit (no autosave) and creates NO git commit (clarification Q4).
- **FR-007**: Saving MUST NOT silently overwrite an external on-disk change made since the view loaded: on conflict the system MUST present an inline choice with two keyboard-reachable controls — reload from disk (confirming first; discards the buffer) or overwrite (explicit force) — changing neither side until the user chooses (clarification Q5, PRD F1.5/§8).
- **FR-008**: While editing, typing `[[` MUST open an autocomplete popup of existing note titles filtered case-insensitively by the text typed after `[[`; Up/Down MUST move the selection, Enter/Tab MUST insert `[[Selected Title]]` with the caret after `]]`, and Esc MUST dismiss only the popup — all five keys scoped strictly to the open popup, with zero bare global key bindings (PRD F8.4, D5).
- **FR-009**: Clicking a pending marker MUST create exactly one note — title = the link's target text, `status: seed`, `visibility: private`, empty body, F1 unique-slug rules — then navigate to its view; a create in flight MUST reject further clicks; a slug collision MUST navigate to the existing note instead of overwriting; a failed create MUST show an inline error and change nothing (AC3, clarification Q3).
- **FR-010**: Reading, editing, autocomplete, and pending-create MUST work fully offline on the loopback interface; no non-loopback binding and no external network request at any step of the feature (PRD §8).
- **FR-011**: Validation MUST be `npm install` + `npm run test` + `npm run build`, and `.ainative/project.yaml`'s `validation_commands` MUST be updated to include `npm run test` alongside the existing install/build entries (D8).

### Key Entities

- **Wiki-link**: `target` (raw text inside `[[…]]`), `linkText` (alias when present else target) — F1's extractor already defines it; F3 consumes it everywhere.
- **Rendered link**: resolved → href to `/note/<slug>` + display text; pending → marker carrying the target text; produced by the same resolver as the index (FR-003).
- **Backlink entry**: `fromSlug`, `linkText`, referencing note's `status` — one row per inbound link occurrence, sourced from F1's backlink index.
- **Edit buffer**: the note's raw body + the load-time snapshot + a dirty flag; lives only while Edit is open; discarded on Esc/navigation after confirm.
- **Autocomplete session**: open flag, current query (text between `[[` and the caret), candidate titles (+ slugs), selection index; ephemeral, popup-scoped.
- **Pending-create request**: target text → new note (seed/private/unique slug) or existing slug on collision; at most one in flight per marker.
- **Note / Vault index**: F1's entities unchanged — F3 only consumes `refreshVaultIndex()` output (`notes`, `backlinks`, …).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A note view (rendered body + backlinks panel) loads and is interactive in under 500 ms locally (PRD §8 note-view target).
- **SC-002**: 100% of successful saves reflect in the backlinks panels on the very next view with no manual index rebuild, and panel contents always equal ground truth computed from the vault for the same link set.
- **SC-003**: 100% of canonical-rule resolution cases (case variants, exact slug, exact title, slugify-equivalent including accent/punctuation forms) resolve identically across rendering, index, and panel; unresolved means all three tiers genuinely miss.
- **SC-004**: Autocomplete: popup visible within 200 ms of the `[[` keystroke, and a title can be inserted with at most 2 navigation keystrokes (direction + accept) beyond typing; 0 app-command side effects from Up/Down/Enter/Tab/Esc while the popup is closed.
- **SC-005**: 100% of pending-marker clicks create exactly one note titled the target (or navigate to the existing slug on collision); 0% overwrite or duplicate.
- **SC-006**: Every F3 control (Edit/Save/Cancel, popup rows, conflict choices, pending markers, backlink rows) is reachable by keyboard alone; 0 bare printable-key global bindings (PRD F8.4).
- **SC-007**: Read/edit/link flows make zero non-loopback network calls (PRD §8 security).
- **SC-008**: External-edit conflicts: 0 silent overwrites and 0 silently discarded buffers — both outcomes require an explicit user choice (PRD §8 zero data loss).

## Assumptions

- **Body-only editing**: F3 edits the Markdown body; title/status/tag editing belongs to F4 (status) and F8 (full editor).
- **Explicit save, no commit**: saves write to disk only; no autosave (F8), no git commit (clarification Q4 — F9 owns commit-on-save; gap between F3 and F9 recorded).
- **Backlink row content**: title + status + link text; surrounding-sentence context is F15 (P2).
- **Fresh index per view**: the reading view computes its index per request (correctness over caching — external edits stay visible immediately, matching F2's per-request dashboard reads). At PRD scale (5,000 notes) a fresh full-vault read may press the 500 ms target; if measured so, the follow-up (frontmatter-only read or mtime-keyed cache) is a plan/tasks decision, not a spec change.
- **Markdown surface**: PRD F8.2's readable set (headings, code, lists, tables, links, emphasis); raw HTML in notes is escaped, never executed.
- **Autocomplete candidates**: existing titles only — typing a title that doesn't exist and accepting nothing produces a pending link, created on click (AC3), not inline.
- **Duplicate titles**: allowed by F1 (unique slugs only); resolution tie-break and popup slug disambiguation make the ambiguity deterministic.
- **Dashboard unchanged**: F2's recent-notes rows stay non-links for F3 (the route now exists, but the dashboard is F4/F8 scope — tracked as a follow-up, not silently changed here).
- **Direct URL access**: `/note/<slug>` is bookmarkable and works when reached directly.
- **Archived notes**: readable and linkable in every view; their status is shown, never hidden (D4).
- **Heading fragments**: `[[#…]]` links are not implemented in F3 (rendered literally) — consistent with F1's extractor, which drops them.

## Spec Findings (gaps recorded per card directive — closed here, not re-opened)

1. **D3 slugify gap (the card's known gap)** — CLOSED by clarification Q1: resolution adds the third `slugify(target)` tier with deterministic tie-break. Probe evidence: current code returns `null` for `[[Retrieval Practice]]` vs slug `retrieval-practice` (title "Retrieval practice sessions") and for `[[cafe society]]` vs "Café Society" — today those produce neither link nor backlink.
2. **Validation gap** — `.ainative/project.yaml` lists only `npm install` + `npm run build` although the repo ships `npm run test` (108 tests green); D8/FR-011 prescribe adding it.
3. **Heading-fragment + backslash-escape divergences** — recorded as Edge Cases/Assumptions: F1's extractor is the single source of truth for "what counts as a link"; rendering follows it (literal `[[#…]]`), except backslash escapes where rendering honors Markdown but the index does not (accepted, documented).
4. **Edit-save commit gap** — recorded by clarification Q4: no commits until F9; explicit, not silent.
5. **External-edit conflict had no owner before F3** — F1.5's warning promise could not fire while no editor existed; clarification Q5 assigns it to F3's save path using F1's snapshot machinery.

## Locked Constraints (Orchestrator Decisions — final, not open questions)

These decisions were made by the orchestrator (parent card t_eea78f10) and are identical across every F3 sibling card. They bind the plan/tasks/implementation steps.

- **D1**: F3 builds a MINIMAL `/note/[slug]` reading view + edit surface: rendered note incl. wiki-link rendering, backlinks panel, raw-Markdown textarea editor with `[[` autocomplete, save path. F8 later upgrades to full side-by-side/preview/themes. Rationale: no reading view or editor surface exists yet; AC2/AC3 need a surface.
- **D2**: Reuse `src/lib/notes.ts` hooks (`extractWikiLinks`, `resolveWikiLink`, `buildBacklinkIndex`, `refreshVaultIndex`) — extend only on proven gap (the proven gap is D3's, closed by Q1 above).
- **D3**: Canonical resolution: case-insensitive; match order slug → title; the known slugify gap is closed per clarification Q1 (third tier + smallest-slug tie-break).
- **D4**: Archived notes STAY in the backlink index with their `status` flag (F1 decision); trash (`<vault>/.trash/`, dot-dirs) is excluded.
- **D5**: Autocomplete pattern: mirror F2's `capture-client.ts` — DOM-free pure decision functions in a new `src/lib/wikilink-client.ts` (+ vitest, no browser) plus thin page-script wiring. Keys (Up/Down, Enter/Tab, Esc) are scoped to the open popup only (PRD F8.4: no bare global bindings).
- **D6**: Backlinks recompute on the save path (server/API re-reads vault via `refreshVaultIndex`); the note page renders the panel from the index.
- **D7**: Pending links render with a pending marker; first click POSTs to a create-note API (title = target text) then navigates.
- **D8**: Validation is `npm install` + `npm run test` + `npm run build`; the spec prescribes adding `npm run test` to `.ainative/project.yaml` validation_commands (currently install+build only) — see FR-011.
- **D9**: Ship parks for operator approval before any merge/push/PR.

## Dependencies & Out of Scope

**Depends on (exists today)**:

- F1 index hooks in `src/lib/notes.ts`: `extractWikiLinks`, `resolveWikiLink`, `buildBacklinkIndex`, `refreshVaultIndex` (+ `VaultIndex.backlinks`), `readNote`, `saveNote` (snapshot/`force` conflict machinery, `ExternalEditConflictError`), `createNote`, `slugify` — covered by `src/lib/notes.test.ts`.
- F2 surfaces: SSR app (`astro.config.mjs` `output:'server'` + `@astrojs/node`), `src/lib/vault.ts` `resolveVaultDir()`, `POST /api/capture` (201/409/400/500 contract, reusable for pending-create per plan), layout `src/layouts/Base.astro`, dashboard `src/pages/index.astro` (untouched by F3).
- `markdown-it ^15.0.2` (declared, currently unused), `vitest ^5` with `npm run test`.

**Out of scope for F3** (owned by other features):

- Side-by-side editor, live preview, autosave, themes, command palette (F8); commit-on-save/settings/push (F9); status & lifecycle editing (F4); search (F5); tags/status browse pages (F6); dashboard link-rows and dashboard sections (F4/F8); orphan report (F12); backlink context sentences (F15); publishing (F10); graph (F11).
- Vault configuration UI (F8 `/settings`); multi-vault; concurrent-writer coordination beyond snapshot-conflict protection.
