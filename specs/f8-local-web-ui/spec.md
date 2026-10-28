# Feature Specification: F8 Local Web UI

**Feature Branch**: `digitalgarden/t_1e1b2dca-f8-local-web-ui` (spec card t_16ae5d38, parent t_1e1b2dca)

**Created**: 2026-10-27

**Status**: Draft

**Input**: Parent card t_1e1b2dca — F8 Local Web UI, grounded in PRD §7 F8 AC1–AC5 (PRD.md:214–224), §6 Page/Screen List (PRD.md:114–127), §8 NFRs (PRD.md:284–300), §10 Design Direction (PRD.md:325–331), and the on-disk v1 surface (`src/pages/` dashboard/new/note/search/tags/status, `src/layouts/Base.astro`, `src/styles/global.css`, `src/lib/render.ts`, `src/lib/capture-client.ts`, `src/lib/search-shortcut.ts`, `src/lib/wikilink-client.ts` + their tests, `astro.config.mjs`, `package.json`, `.ainative/project.yaml` gate).

**Provenance note**: All code facts below were re-verified by fresh probes against THIS checkout (branch `digitalgarden/t_1e1b2dca-f8-local-web-ui` @ 76d6dbd) on 2026-10-27, never carried over. F2–F7 specs (`specs/f2-quick-capture` … `specs/f7-privacy`) are shape references only. F2–F7 behavior is the start point, not the spec.

Locked orchestrator decisions D1–D8 (on the spec card) are recorded in "Locked Constraints" at the end of this document and are NOT open questions.

## Clarifications

### Session 2026-10-27

Headless clarify run (spec card t_16ae5d38, single-session chain): 5 questions raised, each resolved by selecting the recommended option grounded in locked decisions D1–D8 and fresh probes of this checkout; choice + rationale recorded here and applied to the relevant sections. D1–D8 were not re-opened.

- **Q: What form does the AC1 cold-start proof take — committed test or measured one-off evidence?** → **A: Measured one-off evidence (scripted cold-start probe, recorded in spec/plan/tasks), NOT a committed timing test.** Rationale: cold-start time is environment-dependent (FUSE host, first-build vs cached, port contention); a committed timing assertion would be flaky by construction. F7 precedent (loopback probe R4/T021) covers runtime-only facts with scripted checks and no repo files. The gate (`npm run build` exit 0 + `astro preview` ready timing) stays committed; the <2 s number is measured per run. (Applies to FR-001, US1 scenarios, SC-001.)
- **Q: What exactly does AC3 "autosaving on idle (default 2 s)" mean, and where does `/new` stand?** → **A: Idle = 2 s with no keystroke in the edit buffer; on expiry the buffer POSTs to the existing save path; explicit Save posts immediately; autosave writes are commit-free (D3). `/new` capture is F2-owned — reuse its submit path, never rebuild it.** Rationale: "idle (default 2 s)" needs an operational definition or it is untestable; 2 s matches the PRD parenthetical and gives a single debounce constant the build measures (not asserts). D3 forbids git commits on edit-save, so autosave writes stay commit-free until F9. `/new` already has submit/conflict/keys (F2) — F8 touches only the note edit surface. (Applies to FR-005/FR-006, US3, SC-003.)
- **Q: How is the dashboard bare-`c` binding dispositioned under AC4's "no bare printable SHALL be bound globally"?** → **A: Retained as a scoped command (dashboard-only, field-guarded) with an explicit spec finding + mandatory critic sign-off — NOT silent grandfathering.** Rationale: `shouldOpenCapture` (capture-client.ts:66–82) fires only for bare `c` with no modifier AND focus outside `input/textarea/select/[contenteditable]`, wired by exactly one document listener on the dashboard page only (index.astro:163–181). That is command-mode-scoped in effect (normal mode vs typing mode), but it IS a bare printable at document level, so AC4's letter requires a finding and critic sign-off per D2. Remediation (modifier-only) would break F2's shipped loop; silent retention would violate D2. (Applies to FR-007/FR-008, US4 scenario 1, Edge Cases.)
- **Q: Does AC2 "code blocks with highlighting" require a new highlighting dependency, or is mono rendering sufficient?** → **A: Highlighting is REQUIRED — a gap fix; the plan selects the minimal mechanism, the build wires it, no new heavy dependency without justification.** Rationale: AC2 names highlighting explicitly; today `render.ts:39–44` builds markdown-it with safe defaults and NO highlight plugin (probed: no hljs/prism/shiki anywhere under `src/`), and `package.json` carries `codemirror ^6.0.2` unused in `src/` (probed: zero imports). Mono code blocks therefore fail AC2 as written. The plan must pick the smallest fix (markdown-it highlight callback vs existing CodeMirror dep vs tiny highlighter) with bundle justification. (Applies to FR-003/FR-004, US2 scenario 2, SC-002.)
- **Q: What does AC5 "support light and dark themes" mean mechanically — media-only or an explicit toggle?** → **A: Explicit themes with a user-visible toggle (persisted choice, `prefers-color-scheme` default) AND measured contrast ratios in BOTH themes.** Rationale: today `global.css:1–30` is media-only (`prefers-color-scheme`, no toggle, comment defers "full WCAG AA pass" to F8) with unmeasured tokens. D2 requires explicit themes + MEASURED ratios in both. Media-only cannot satisfy "support" for a user who needs the non-default theme in their OS setting. Toggle placement (Base layout, not a new `/settings` route — no settings route exists on disk; PRD page list names `/settings` but F9 owns the settings-toggle per D3) is a plan decision. (Applies to FR-009/FR-010, US5, SC-005.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The app is ready before I notice (Priority: P1)

The Gardener starts the local app and the UI answers on `http://localhost:[port]` within 2 seconds — cold start, not warm reload. The dashboard (`/`) renders recent notes, seeds needing attention, and the Capture entry without waiting on any network service.

**Why this priority**: AC1 is the gate to every other story — if the app is not ready in 2 s, nothing else can be exercised. It is also the only timing property in F8, so it needs its own measured proof.

**Independent Test**: Boot the built server on a probe port, time to first 200 on `/`, record the number; stop the server and confirm the port is free. No committed timing test — one-off scripted evidence per Q1.

**Acceptance Scenarios**:

1. **Given** the built app, **When** the server boots on a probe port, **Then** `GET /` answers 200 and the measured time from process spawn to first 200 is < 2 s (recorded, not asserted in a committed test).
2. **Given** the running app, **When** the dashboard renders, **Then** recent notes, seeds needing attention, and the Capture link are all present with no client-side fetch spinner for list content (server-rendered per request).
3. **Given** the probe above, **When** the server stops, **Then** no listener remains for the probe port (same stop discipline as F7 R4).

---

### User Story 2 - Notes read like notes (Priority: P1)

The Gardener opens a note and the Markdown reads as a calm typographic page: headings with clear hierarchy, code blocks with syntax highlighting, lists, tables, and `[[wiki-links]]` that resolve to notes or show as pending markers — all inside the readable single-column shell (wider on the note view for the backlinks panel).

**Why this priority**: AC2 is the reading half of the PRD promise ("editing feels like writing" starts with reading that respects the source). It also pins the only render contract in the repo.

**Independent Test**: Render a fixture covering headings, highlighted code, nested lists, a table, and resolved/pending/alias wiki-links; assert each shape in the HTML; open `/note/<slug>` in a browser and screenshot the typographic layout.

**Acceptance Scenarios**:

1. **Given** a note body with headings, **When** rendered, **Then** heading levels map to `h1–h6` in order with no skipped-level styling break.
2. **Given** a fenced code block with a language tag, **When** rendered, **Then** the output carries syntax-highlighting markup (gap fix per Q4 — mono `<pre><code>` today fails this).
3. **Given** nested lists and a table, **When** rendered, **Then** list nesting and table rows/columns survive with readable spacing.
4. **Given** `[[Existing]]`, `[[Existing|alias]]`, and `[[Missing]]`, **When** rendered through `renderNoteBody` + the note view, **Then** resolved links anchor to `/note/<slug>`, aliases show alias text, and missing targets render as focusable pending markers (current behavior, locked by render tests).
5. **Given** raw HTML in a note body, **When** rendered, **Then** it is escaped, never executed (`html:false`, locked).

---

### User Story 3 - Editing feels like writing (Priority: P1)

The Gardener opens edit mode on a note and gets a side-by-side editor (source on one side, live preview on the other) that tracks the buffer as they type. Pausing for 2 s autosaves the buffer to disk; pressing Save saves immediately. A dirty-buffer Esc/Cancel confirms before discarding; a 409 conflict offers Reload-from-disk vs Overwrite with focus on the content-preserving choice. Autosave writes never create git commits (D3 — README known-gap stands until F9).

**Why this priority**: AC3 is the largest gap in the tree (raw single textarea today, no preview, no autosave) and the core of the F8 user story. It reuses the existing save/conflict contract — it does not invent a new endpoint.

**Independent Test**: Open edit mode, type, watch the preview update; idle 2 s and confirm the disk write + status message without a git commit; press Save and confirm immediate write; exercise Esc-dirty and both 409 choices by script.

**Acceptance Scenarios**:

1. **Given** read mode, **When** the user opens edit mode, **Then** a source pane and a live preview pane appear side by side (responsive collapse on narrow widths), the source is prefilled with the raw Markdown, and focus lands in the source.
2. **Given** an open editor with typed changes, **When** the preview renders, **Then** it tracks the buffer through the same renderer as read mode (headings/code/lists/tables/wiki-links identical).
3. **Given** typing stops for 2 s (idle default), **When** the debounce expires, **Then** the buffer POSTs through the existing save path, the status line confirms, and no git commit is created (D3).
4. **Given** the user presses Save (or Ctrl/⌘-Enter if the plan wires it), **When** the save posts, **Then** the write lands immediately without waiting for the idle timer, with the same no-commit rule.
5. **Given** a dirty buffer, **When** the user presses Esc or Cancel, **Then** a confirm appears; OK discards to read mode, Cancel keeps the buffer exactly as typed with focus back in the source.
6. **Given** a 409 external-edit conflict, **When** it arrives, **Then** neither side is touched until the user picks Reload (confirm, discards buffer) or Overwrite (re-POSTs with `force:true`, the only source of force); focus moves to the content-preserving control.

---

### User Story 4 - Hands stay on the keyboard (Priority: P1)

The Gardener reaches every interactive control without a mouse: dashboard Capture entry, search entry + results, note edit/save/cancel/conflict choices, `[[` popup, capture-form submit/Esc/conflict choices, and the theme toggle. Every global binding is modifier-scoped (Ctrl/⌘-K) or command-mode-scoped (popup-open-only, panel-focused-only, field-guarded dashboard `c` per Q3); no bare printable is bound globally without a finding + critic sign-off.

**Why this priority**: AC4 is the keyboard contract — a single unscoped bare-key binding breaks typing anywhere. The audit must cover EVERY binding, not just the new ones.

**Independent Test**: Walk every binding in the audit table with keyboard only (Tab order + shortcut), assert each global is modifier- or command-mode-scoped, and record the traversal; any bare-global remainders fail unless covered by a spec finding + critic sign-off.

**Acceptance Scenarios**:

1. **Given** the dashboard, **When** the user presses bare `c` outside a field, **Then** `/new` opens (scoped command per Q3 — finding + critic sign-off required); **When** `c` is typed inside any field, **Then** it types the letter (field guard).
2. **Given** any page, **When** the user presses Ctrl/⌘-K, **Then** `/search` opens (or the search input focuses if already there); **When** a bare `k` is typed anywhere, **Then** it types the letter, never navigates.
3. **Given** the `[[` popup open in the editor, **When** the user presses Up/Down/Enter/Tab/Esc, **Then** the popup navigates/completes/cancels; **When** the popup is closed, **Then** those same keys do nothing through this router (null path).
4. **Given** search results focused, **When** the user presses Up/Down/Enter, **Then** selection moves / the note opens; **When** focus is outside the panel, **Then** those keys do nothing through this router.
5. **Given** the capture form, **When** the user presses Ctrl/⌘-Enter, **Then** the capture submits; Enter in the title advances to the body; Esc confirms-if-dirty then navigates or refocuses; every other printable key types.
6. **Given** the theme toggle, **When** reached by Tab, **Then** it toggles with keyboard alone (Enter/Space) and announces the change.

---

### User Story 5 - Light and dark, both readable (Priority: P2)

The Gardener picks light or dark explicitly (toggle, persisted; OS `prefers-color-scheme` is the default, not the whole mechanism) and every surface — dashboard, capture, note read + edit, search, tags, status lists — meets WCAG 2.1 AA contrast in BOTH themes, with measured ratios recorded.

**Why this priority**: AC5 is the accessibility half of the calm-UI promise. It is P2 only because reading/editing/keyboard come first; it is still required with numbers, not adjectives.

**Independent Test**: Toggle each theme, screenshot the six surfaces per theme, compute contrast ratios for body text (+ muted/secondary text) against its background in both themes, and record the numbers (≥ 4.5:1 normal text, ≥ 3:1 large/UI per AA).

**Acceptance Scenarios**:

1. **Given** either OS theme, **When** the app loads, **Then** the initial theme follows the OS setting until the user picks explicitly.
2. **Given** the toggle, **When** the user switches theme, **Then** all six surfaces repaint without reload, the choice persists across reloads, and a screen-reader label announces the current theme.
3. **Given** both themes, **When** contrast is measured, **Then** body text meets AA in both (recorded ratios), with no surface regressing below AA.

---

### Edge Cases

- Cold start on a warm build cache vs first build: the measured <2 s applies to process-spawn-to-200 on the built server, not `npm run build` time; record which build state was measured.
- Probe-port collision: if the default probe port is taken, the build picks a free port, records it, and converts hex the same way (F7 R6 precedent).
- Empty note body: a stub note (empty body) still renders, previews, and autosaves — empty is valid, never ignored (wikilink-client `saveDecision` precedent).
- `[[#heading]]`, `[[]]`, whitespace-only targets: stay literal text in preview exactly as in read mode (renderer/extractor lockstep, render.ts:69–70).
- `[[..]]` inside code spans/fences: never becomes a link in preview (tokenizer order, render.ts:20–21).
- Preview XSS: raw HTML in the buffer previews escaped, never executed (`html:false` carries into the preview renderer).
- Autosave while a save is in flight: the second save is ignored/queued, never double-POSTed (saveDecision in-flight precedent); the disable matrix (edit-open OR save-in-flight) is honored.
- Autosave with no changes: no POST (dirty check first) — idle with a clean buffer is silent.
- External edit during autosave: the 409 box appears with both choices; autosave does not force-overwrite on its own (only explicit Overwrite carries `force:true`).
- Bare-`c` on the dashboard with `[contenteditable]` focused: types, never navigates (explicit flag precedent, index.astro:174–176).
- Ctrl/⌘-K on `/search` itself: stays put and focuses the input (existing self-guard), never self-navigates.
- Theme toggle with JS disabled: server still renders a readable default (OS-media initial); toggle is progressive enhancement.
- 5,000-note vault: cold-start and render measurements are on the operator's real vault size; scale benchmarking stays an F6/R6 posture (no new perf rig in F8).
- `/settings` absent: no settings route exists on disk (probed) despite the PRD page list naming one — F8 adds NO full settings page; the theme toggle lives in the shared shell and autosave-commit settings belong to F9 (D3).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST serve the UI on `http://localhost:[port]` and be ready (first 200 on `/`) within 2 s of process spawn, proved by measured one-off evidence per probe (Q1 decision), NOT a committed timing test. Evidence: boot log + `curl` timing + `/proc/net`-style listener check on the probe port.
- **FR-002**: The note view MUST render headings, lists, tables, and wiki-links (resolved anchors, alias text, pending markers, literal `[[#…]]`/`[[]]` rules) through the existing `renderNoteBody` contract (`src/lib/render.ts:39–106`, markdown-it safe defaults `html:false`), verified by the locked render tests.
- **FR-003**: Fenced code blocks MUST render with syntax highlighting (gap fix per Q4). Today there is NO highlight plugin (probed: no hljs/prism/shiki under `src/`); mono `<pre><code>` fails this FR. The plan selects the minimal mechanism with bundle justification.
- **FR-004**: The edit-mode live preview MUST render through the same renderer as read mode (identical headings/code/lists/tables/wiki-link output for the same source), so preview and read can never disagree.
- **FR-005**: Edit mode MUST be side-by-side source + live preview (gap fix — today `note/[slug].astro:166–175` is a single raw textarea, NO preview pane), responsive-collapsing on narrow widths, with focus landing in the source on open.
- **FR-006**: The editor MUST autosave on 2 s idle (no keystroke for 2 s → POST through the existing `/api/note` save path) AND on explicit save (immediate POST, no timer wait); clean-buffer idle MUST NOT post; in-flight saves MUST NOT double-post. Idle constant is exactly 2000 ms unless the plan justifies otherwise with the build measuring what shipped.
- **FR-007**: Autosave and explicit edit-saves MUST write to disk WITHOUT creating git commits (D3 boundary). Commit-on-save + push + settings-toggle belong to F9; the F8 build MUST NOT add commit calls to the edit-save path.
- **FR-008**: Every document-level key binding MUST be modifier-scoped or command-mode-scoped. Concretely: Ctrl/⌘-K (search-shortcut.ts:37–44) stays modifier-only; `[[` popup router (wikilink-client.ts:392–411) stays popup-open-only; results keys (search.ts:332–348) stay panel-focused-only; capture keys (capture-client.ts:351–362) stay form-scoped with no printable-to-command mapping.
- **FR-009**: The dashboard bare-`c` binding (capture-client.ts:66–82, wired index.astro:163–181) is RETAINED as a scoped command (dashboard-page-only + field/contenteditable-guarded)CONDITIONAL on an explicit spec finding (this FR + Q3) AND critic sign-off per D2. If the critic rejects, the build remediates (modifier or removal) under the same FR number.
- **FR-010**: The app MUST offer explicit light AND dark themes with a keyboard-reachable persisted toggle defaulting to `prefers-color-scheme` (gap fix — today global.css:1–30 is media-only, no toggle). Both themes MUST meet WCAG 2.1 AA with RECORDED ratios (body text ≥ 4.5:1; large/UI accents ≥ 3:1) on all six surfaces.
- **FR-011**: `/new` capture stays F2-owned: F8 MUST reuse its submit/conflict/keys paths and MUST NOT rebuild or restyle the capture form beyond what the theme toggle gives it for free.
- **FR-012**: Validation MUST remain `npm install` + `TMPDIR=/tmp npm run test` + `npm run build`, green in order with no dependency changes except spec-named gap files (D6, `.ainative/project.yaml` unchanged). Baseline measured 2026-10-27: install exit 0, test 274/274, build exit 0.
- **FR-013**: F8 MUST NOT regress F7: `astro.config.mjs` keeps no `server.host` / no `--host` (READ-ONLY), `privacy.test.ts` stays exactly 8 its unless the spec names a gap with rationale (it names none), and visibility default/validation paths stay untouched (D4).

### Key Entities

- **Note view**: read rendering + edit buffer + preview + save/conflict states; the surface AC2/AC3 land on.
- **Edit buffer**: dirty flag + value + in-flight flag; the unit autosave, explicit save, Esc, and conflict all read.
- **Theme**: `light | dark` persisted choice with OS default; the unit AC5 measures twice.
- **Keyboard binding**: key + modifiers + focus scope + outcome; the unit AC4 audits (one row per binding).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Cold start measured < 2 s (spawn-to-first-200) on the probe run, with port, build state, and timing recorded; no committed timing test added.
- **SC-002**: Render fixture passes: headings/list/table/wikilink shapes locked in tests + highlighting markup present for fenced code + read/preview parity (same source → identical HTML) + raw-HTML-escaped.
- **SC-003**: Autosave measured: type → 2 s idle → disk write confirmed + status message + `git log` shows NO new commit; explicit Save writes immediately; Esc-dirty and both 409 choices exercised.
- **SC-004**: Keyboard audit complete: every binding in the audit table ends modifier-scoped or command-mode-scoped, or carries a spec finding + critic sign-off (the ONLY permitted exception is bare-`c` under FR-009); bare printables otherwise type, never command.
- **SC-005**: Both themes measured AA: recorded contrast ratios for body text in light AND dark (≥ 4.5:1), toggle persists across reload, all six surfaces screenshotted per theme.
- **SC-006**: Gate holds: install exit 0 → test (expect 274+ new-behavior tests added by the build, never fewer) → build exit 0, in order, with `TMPDIR=/tmp` for the suite (FUSE host quirk).
- **SC-007**: Zero boundary regress: `git diff --stat` at converge shows ONLY `specs/f8-local-web-ui/*` plus spec-named gap files; no `PRD.md` / `specs/f2..f7` / `project.yaml` / F7-owned-file hunks; `privacy.test.ts` still 8 its.

## Findings (fresh probes @76d6dbd, 2026-10-27)

- **F1** `src/pages/index.astro` (367 lines): dashboard with header Capture link, recent-notes + seeds tables, ONE document `keydown` for bare-`c` (163–181, field/contenteditable-guarded via `shouldOpenCapture`), plus `wireSearchShortcut` (158, modifier-only). The bare-`c` is the AC4 gap dispositioned by Q3/FR-009.
- **F2** `src/pages/new.astro` (340 lines): F2-owned capture form; keys (291–328) route through `captureKeyCommand` (351–362: Esc / Ctrl-Enter-submit / title-Enter-advance / null otherwise) with NO document printable handler; `wireSearchShortcut` (200) coexists modifier-only. F8 reuses, never rebuilds (FR-011).
- **F3** `src/pages/note/[slug].astro` (1123 lines): read + raw-textarea edit (`:166–175` single `#note-editor`, NO preview pane, NO side-by-side), shared 409 box (`:182–188`), `[[` popup shell (`:216`), page-data island (`:218`); script wires edit/save/Esc/conflict (`:750–890`) through `wikilink-client.ts` decisions with the disable matrix (edit-open OR save-in-flight). AC3 gap: no preview, no autosave timer anywhere on this page.
- **F4** `src/lib/render.ts` (106 lines): markdown-it safe defaults (`:39–44` `html:false/linkify:false/typographer:false/breaks:false`) + ONE pre-`link` wikilink rule (`:49–83`) + renderer (`:85–97`); NO highlight plugin anywhere under `src/` (probed). AC2 gap per Q4.
- **F5** `src/lib/search-shortcut.ts` (104 lines): `shouldOpenSearch` (`:37–44` Ctrl/⌘-K only, no Alt/Shift) + `wireSearchShortcut` (`:78–104`) called per-page (dashboard, capture; search page self-guards to focus). Modifier-scoped, no AC4 issue.
- **F6** `src/lib/capture-client.ts` (448 lines): `shouldOpenCapture` (`:66–82` bare-`c` + guards), `captureKeyCommand` (`:351–362`), `handleEscape` (`:396–408`), conflict pair (`:423–447`). `src/lib/wikilink-client.ts` (505 lines): edit/save/Esc/conflict decisions (`:84–207`), `autocompleteKeyCommand` (`:392–411` popup-open-only), pending-create (`:422–504`). `src/lib/search.ts:332–348` `resultsKeyCommand` (panel-focused-only). Audit base for FR-008.
- **F7** `src/pages/search.astro` (484 lines): input autofocused + explicit focus, ~100 ms debounce (`:245–247`), session refresh on visibility/pageshow (`:293–325`), ONE container-scoped results `keydown` (`:329–344`), self-guard for Ctrl-K (`:102–118`). No global arrows/Enter. No AC4 issue.
- **F8** `src/styles/global.css` (30 lines): two tokens (`--ink/--paper`) + `prefers-color-scheme` media only; comment defers "full WCAG AA pass" to F8; NO toggle, contrast UNMEASURED (probed). AC5 gap per Q5. `src/layouts/Base.astro` (23 lines): Tags-nav-only shell, zero script/keys — toggle home TBD by plan.
- **F9** Deps/config: `package.json` carries `codemirror ^6.0.2` with ZERO imports under `src/` (probed) — editor-dep gap for the plan to resolve; `astro.config.mjs` 13 lines, no `server` key (F7-owned, READ-ONLY); `specs/` has f2…f7, no `specs/f8-*` (expected); `.gitignore` has no evidence lines (expected, D7 rides with build).
- **F10** Gate measured this session: `npm install` exit 0 → `TMPDIR=/tmp npm run test` 14 files / 274 passed → `npm run build` exit 0 (run-79 order). Expectation for build: 274+ (never fewer).
- **F11** `/settings` absent: no route file despite PRD §6 listing `/settings` (vault path, theme, autosave/commit behavior). Disposition: F8 adds NO settings page (Edge Cases); theme toggle lives in the shared shell; autosave-commit settings belong to F9 (D3).

## Out of Scope (binding)

- F9 (git commit-on-save, push, settings-toggle for autosave-commit): F8 autosave writes stay commit-free (D3). Any commit call on the edit-save path is a scope violation, even if "one line".
- F7 posture (loopback config, privacy tests, visibility paths): READ-ONLY per D4/FR-013. No `--host`, no `server.host`, no visibility-path edits.
- v1.1 surfaces (`/graph`, `/unlinked`, `/maps/[slug]`, publishing, public search): no routes, no index changes, no feed work.
- `/new` rebuild: F2-owned (FR-011). Theme inheritance is free; form/behavior edits are out of scope.
- Committed timing/socket tests: cold-start and contrast are measured evidence (Q1), not flaky committed assertions — F7 R8 precedent.

## Gap Files (build may touch — D5)

Outside `specs/f8-local-web-ui/*`, the build may touch ONLY these (each tied to its FR; any other hunk is a scope violation):

- `src/lib/render.ts` + extend `src/lib/render.test.ts` — FR-003 code highlighting (highlight callback + parity assertions; no other renderer changes).
- `src/pages/note/[slug].astro` — FR-005/FR-006 side-by-side panes + preview wiring + autosave timer/status (page-scoped styles + script only; no new routes, no save-path redesign).
- `src/lib/wikilink-client.ts` + extend `src/lib/wikilink-client.test.ts` — FR-006 autosave decisions (pure predicates; the page only wires DOM).
- `src/pages/api/note.ts` — FR-006 ONLY to echo `hash` in the 200 body so an autosave can refresh its `baseHash` without a reload (no other contract change; validation order untouched).
- `src/styles/global.css` — FR-010 explicit theme tokens for both themes (the media query stays as the default source).
- `src/layouts/Base.astro` — FR-010 toggle home (button + tiny wiring script; nav stays).
- `src/lib/theme.ts` + `src/lib/theme.test.ts` (NEW, only if the plan keeps theme decisions DOM-free-testable) — FR-010.
- `package.json` + lockfile (CONDITIONAL, only if the plan's R2 highlight decision requires a dependency — the diff must be exactly the highlight dep, nothing else) — FR-003.
- `.gitignore` (append ONLY the two D7 evidence lines) — D7.

READ-ONLY everything else, in particular: `PRD.md`, `specs/f2..f7`, `.ainative/project.yaml`, `astro.config.mjs`, `package.json` scripts, `privacy.test.ts` (8 its), `notes.ts`/`capture.ts` visibility paths, `src/pages/new.astro` + `src/lib/capture-client.ts` (F2-owned), and all search/tags/status pages + libs except as named above.

## Locked Constraints (D1–D8, orchestrator-binding)

- D1 Feature dir `specs/f8-local-web-ui/` with Spec Kit basename `f8-local-web-ui` (tester manifest = `specs/f8-local-web-ui/evidence.md`, captures under `specs/f8-local-web-ui/evidence/`). Plan test flows declare exactly ONE proof type each (UI = Playwright trace/video/screenshots with Playwright commands only; API; CLI/job; logic).
- D2 Spec maps F8 AC1–AC5 onto surfaces with per-AC evidence; every gap becomes a task. AC1 cold start (measured ready <2s). AC2 render (headings/code-with-highlighting/lists/tables/wiki-links via render.ts + note view). AC3 side-by-side editor + live preview + idle-autosave ~2s + explicit save (measured, not asserted; `/new` capture is F2-owned — reuse, never rebuild). AC4 keyboard audit of EVERY binding (each ends modifier-scoped or command-mode-scoped, or is remediated; no grandfathering without a spec finding + critic sign-off). AC5 explicit light/dark themes with MEASURED contrast ratios in BOTH themes.
- D3 F9 boundary: F8 owns autosave-to-disk + save timing; commit-on-save + push + settings-toggle belong to F9. F8 build MUST NOT implement git commits on edit-save; autosave writes stay commit-free (README known-gap stands until F9).
- D4 F7 boundary (READ-ONLY): loopback posture (astro.config.mjs no server.host, no --host), privacy.test.ts (stays 8 its unless the spec names a gap with rationale — it names none), visibility default/validation paths in notes.ts/capture.ts. F8 must not regress them.
- D5 File boundaries: OWN = specs/f8-local-web-ui/* (+ ONLY gap-fix files the spec names; .gitignore evidence lines per D7 ride with build). READ-ONLY: PRD.md, specs/f2..f7 (reference/shape only), project.yaml validation_commands (unchanged), all F7-owned files per D4.
- D6 Gate in order: `npm install` + `TMPDIR=/tmp npm run test` + `npm run build` exit 0. Base 76d6dbd clean; no specs/f8-* yet (pre-chain state).
- D7 Evidence hygiene (tester-enforced): captures are command-produced files under specs/f8-local-web-ui/evidence/; manifest is one table with the 6 fixed columns (Acceptance criterion | Flow name | Command | Exit code | Artifact path(s) | Commit SHA, full 40-char HEAD, replaced each run; FAIL still records executed flows; API captures redacted). Build adds `specs/*/evidence/` + `specs/*/evidence.md` to .gitignore (verified absent today).
- D8 Chain: spec (this card, reasoning, HOST) → build (worker, SDK) → critic (validation, HOST) → tester (validation, HOST) → parent ship → pr-reviewer (validation, HOST, created post-ship with the PR URL). Critic+tester sharing the validation assignee is the design (fresh session per card keeps the gates separate); a non-independence note is required ONLY if the validation model ever equals reasoning's or worker's.

## Assumptions

- Single vault per install; operator has git + Node ≥ 20; no mobile authoring in v1 (PRD §9/§13 carry over).
- Playwright is available for UI proof (`@playwright/test` already a devDependency); browser/runtime facts are proved by scripted checks from the scratch dir (`/tmp`), never repo files (F7 R7 precedent).
- The 2 s idle constant and the highlight mechanism are the only aesthetic-adjacent choices the plan may tune, with measurements proving what shipped.
