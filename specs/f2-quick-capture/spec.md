# Feature Specification: F2 Quick Capture

**Feature Branch**: `digitalgarden/t_fb2bd371-f2-quick-capture`

**Created**: 2026-10-16

**Status**: Draft

**Input**: Parent feature card t_fb2bd371 (F2 Quick Capture) — 4 acceptance criteria, grounded in PRD.md §4 Journey 1, §6 `/new`, §7 F2, §8 (<1 s capture→saved), §9 (Astro 7, simple-git), §10 (keyboard + scoped shortcuts), and the F1 persistence API in `src/lib/notes.ts`.

Locked orchestrator decisions D1–D7 are recorded in "Locked Constraints" at the end of this document and are NOT open questions.

## Clarifications

### Session 2026-10-16

Headless clarify run (card t_e72b8dce, FLOW_ID `flow_20261015_2154_f2qc9x`): 5 questions raised, each resolved by selecting the recommended option per the card's directive; choice + rationale recorded here and applied to the relevant sections. D1–D7 were not re-opened.

- **Q: After a successful capture save, where does the user land?** → **A: On the dashboard (`/`), with the new seed at the top of the recent-notes list.** Rationale: PRD Journey 1 step 5 ends with the dashboard showing the saved seed — the visible "the thought is safe" confirmation — and it makes SC-002's "reflected in dashboard" directly observable. Same destination applies after a resolved collision ("save as new"). (Resolves the hedge in US2 acceptance scenario 2; applied to FR-005.)
- **Q: "Open existing" targets `/note/<slug>`, but the reading view is F8 scope and that route does not exist in F2 — how should F2 handle it?** → **A: Navigate to `/note/<slug>` as D2 locks it, and make the F2 acceptance point the navigation target, not the rendered page; the route may 404 until F8 ships the reading view.** Rationale: D2 is locked and building any reading-view placeholder would duplicate explicitly out-of-scope F8 work; the user's choice (discarding the draft to open the existing note) is still explicit. (Applied to FR-008, US4, Edge Cases.)
- **Q: How is the slug-collision choice presented to the user?** → **A: Inline on the capture page (`/new`) as a conflict state — a notice with two keyboard-reachable controls, "Open existing note" and "Save as new" — with the typed title, body, and tags preserved until the user picks.** Rationale: keeps the zero-data-loss guarantee observable and testable, avoids native-dialog limitations (single action, no content preservation), and adds no modal focus trap. (Applied to FR-008, US4 acceptance scenario 1.)
- **Q: What counts as one "app session" for the once-per-session degraded-history warning (FR-010)?** → **A: One browser page session — a single tab's lifetime; a reload starts a new session and the warn-once flag resets.** Rationale: matches the browser-app idiom for "session", makes "exactly once per session" verifiable in tests (reload = reset), and avoids cross-tab leakage or order-dependent tests from a longer-lived flag. (Applied to FR-010, US2 acceptance scenario 3, Assumptions.)
- **Q: How are optional tags entered in the capture form?** → **A: In one tags field as comma-separated values, parsed into the note's tag list with F1's normalization (trim, case-insensitive de-dup) applied.** Rationale: Journey 1's "optionally 1–2 tags" habit is fastest with a single field; per-tag or chip editors add complexity without v1 value. (Applied to FR-003, Assumptions.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One-keystroke capture from the dashboard (Priority: P1)

The Gardener is on the dashboard and has an idea. They press the single capture shortcut key (`c`) — or click the visible Capture entry point — and land on the quick-capture page (`/new`) with the caret already in the capture input. They can start typing immediately; no mouse, no navigation menus, no waiting.

**Why this priority**: This is the top of the whole capture loop (PRD Journey 1, R2: capture friction kills the habit). Without it, nothing else in F2 matters.

**Independent Test**: Open the dashboard, press `c` (nothing focused), and verify the capture input is focused and typing lands text — with zero further keystrokes. Separately, click the visible Capture link and verify the same focused state.

**Acceptance Scenarios**:

1. **Given** the dashboard is shown and no input is focused, **When** the user presses `c`, **Then** the quick-capture page opens with the capture title input focused, ready for typing.
2. **Given** the dashboard is shown and focus is inside any text input, **When** the user presses `c`, **Then** the character `c` types into that input and the capture page does NOT open.
3. **Given** the user navigates directly to `/new` (bookmark/URL), **When** the page loads, **Then** the capture title input is focused without any keypress.

---

### User Story 2 - Save a seed in under a second (Priority: P1)

The Gardener types a title, one or two sentences of raw Markdown, optionally 1–2 tags, and submits. The note is written to disk as a `seed` / `private` note with a unique slug derived from the title, git-committed with a conventional message, and the dashboard's recent-notes list shows the new seed — all within one second of submission. The thought is safe.

**Why this priority**: This is the payoff of the loop (PRD F2.2, §8 performance target, §11 capture-latency metric). A shortcut with no fast reliable save is worthless.

**Independent Test**: Submit a title+body capture and verify (a) the Markdown file exists with `status: seed`, `visibility: private`, derived slug, (b) a git commit `docs(note): capture <slug>` exists, (c) the dashboard recent-notes list includes the new seed, (d) submit→visible elapsed time < 1 s.

**Acceptance Scenarios**:

1. **Given** the capture form is open with a title and body typed, **When** the user submits, **Then** a note is saved with `status: seed`, `visibility: private`, an auto-derived unique slug, and a git commit — all completing within 1 second of submission.
2. **Given** a capture was just saved, **When** the save completes, **Then** the app lands the user on the dashboard (`/`) and the new seed appears at the top of the recent-notes list without any manual refresh action.
3. **Given** git is unavailable or the vault is not a git repository, **When** the user submits a capture, **Then** the note is still saved to disk and the user sees exactly one degraded-history warning per browser page session (a reload starts a new session).
4. **Given** the capture form is open with a title only (empty body), **When** the user submits, **Then** the note is saved with an empty body (a title alone is a valid seed).
5. **Given** the capture form is open with an empty/whitespace-only title, **When** the user submits, **Then** nothing is saved, no commit is made, and inline validation asks for a title.

---

### User Story 3 - Capture focus discipline (Priority: P2)

While the capture is open, typing is typing. Every printable key — `c`, `/`, `s`, digits, punctuation — inserts text into the focused field and never fires an app command. Focus stays in the capture fields during normal typing. `Esc` returns to the dashboard (confirming first if unsaved text would be lost).

**Why this priority**: PRD F2.3 makes this a hard acceptance criterion; a capture surface that hijacks keys destroys trust in the tool. It is testable independently of save behavior.

**Independent Test**: Open capture, sweep every printable key (a–z, 0–9, common punctuation) and verify each inserts its character with zero app-command side effects; press `Esc` and verify dashboard navigation (with a confirm step when text is unsaved).

**Acceptance Scenarios**:

1. **Given** the capture page is open, **When** the user presses any printable key while a capture field is focused, **Then** the character is inserted as text and no application shortcut fires.
2. **Given** the capture page is open, **When** the user types continuously (including the dashboard shortcut letter `c` and search letter `s`), **Then** focus never leaves the capture fields and no navigation occurs.
3. **Given** the capture page is open with unsaved text in title or body, **When** the user presses `Esc`, **Then** the app asks the user to confirm discarding; on confirmation it returns to the dashboard without saving; on cancel it returns focus to the capture.
4. **Given** the capture page is open with all fields empty, **When** the user presses `Esc`, **Then** it returns to the dashboard immediately with no prompt.

---

### User Story 4 - Title collision offers a choice (Priority: P2)

The Gardener submits a title that already belongs to an existing note. Instead of silently overwriting or silently renaming, the app offers a clear choice: open the existing note, or save this capture as a new note under the first free unique slug (`<title>-2`, …). Nothing is ever overwritten; nothing typed is lost unless the user explicitly chooses to open the existing note.

**Why this priority**: PRD F2.4 / D2. Data-loss zero tolerance (§8) makes silent-overwrite unacceptable; the flow is only reachable on collisions, so it is P2 relative to the happy path.

**Independent Test**: Create a note titled "Retrieval Practice", then capture the same title again and verify the conflict choice appears; verify "open existing" navigates to that note and "save as new" creates a second note with slug `retrieval-practice-2` containing the captured text.

**Acceptance Scenarios**:

1. **Given** an existing note with title "Retrieval Practice", **When** the user submits a capture with the same title, **Then** the capture page shows an inline conflict state (HTTP 409 semantics) with two keyboard-reachable choices — "open the existing note" or "save as a new note with a unique slug" — and the typed title, body, and tags are preserved.
2. **Given** the collision choice is shown, **When** the user chooses "open existing", **Then** the app navigates to `/note/<existing-slug>` and the capture draft is discarded (an explicit user choice). The navigation target is the F2 acceptance point; the reading view at that URL ships with F8 and may 404 until then.
3. **Given** the collision choice is shown, **When** the user chooses "save as new", **Then** the note is saved under the first free slug (`title-2`, `title-3`, …) with the typed body and tags intact, then committed like any capture.
4. **Given** two different titles that normalize to the same slug (e.g. "Café Society" and "Cafe Society"), **When** the second is captured, **Then** the same collision choice is offered.
5. **Given** a capture title whose slug matches a note in the trash, **When** the user submits, **Then** no collision is reported (trash freed the slug) and the capture saves normally.

---

### Edge Cases

- Empty or whitespace-only title → blocked with inline validation; nothing saved, no commit.
- Extremely long title → title stored in full; the derived slug is capped in length per F1 rules (96 chars) and stays unique.
- Title containing Markdown syntax, emoji, or accented characters → slug is de-accented/normalized per F1 slug rules; title renders verbatim.
- Titles that differ but slugify identically ("AI 101" / "ai-101") → treated as a collision (same derived slug), same open-vs-save choice.
- Rapid double-submit (Enter pressed twice fast, or double-click Save) → exactly ONE note is created; the second submit is ignored while the first is in flight.
- Two captures submitted from two tabs at the same moment → both save successfully under distinct unique slugs; no data loss.
- Git commit fails after the file is written (repo missing, git binary absent, hooks error) → the note remains saved on disk; the user gets one session-level warning; capture never blocks on git.
- Body containing multi-line Markdown, code fences, or pasted text → stored verbatim as the note body.
- Capture page reloaded mid-typing (browser refresh) → typed-but-unsaved text is lost (no draft persistence in v1; documented assumption).
- Special/modifier keys (Shift, arrows, Ctrl/⌘) → behave natively; they are not "printable keys" and are exempt from the bare-key rule.
- Vault unreachable / disk write error → capture fails loudly with an error message; nothing is reported as saved.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST expose quick capture reachable in exactly ONE keystroke — pressing `c` with no input focused opens `/new` — AND via a visible, keyboard-reachable Capture entry point for discoverability and accessibility.
- **FR-002**: The `c` shortcut MUST be scoped to the dashboard and MUST be inert while focus is inside any input, textarea, or editable region (it types the letter instead).
- **FR-003**: The quick-capture page (`/new`) MUST present a minimal capture form: a title field (focused automatically on load), a body field accepting raw Markdown, and optional tags entered in ONE field as comma-separated values (normalized per F1: trim, case-insensitive de-dup) — with no further chrome required before typing.
- **FR-004**: On submission, the system MUST save the capture as a note with `status: seed`, `visibility: private`, a unique slug auto-derived from the title, and MUST git-commit it with the message `docs(note): capture <slug>` — the whole save+commit completing within 1 second of submission.
- **FR-005**: After a successful save — including a resolved collision via "save as new" — the system MUST land the user on the dashboard (`/`), where the recent-notes list MUST show the new seed at the top (most-recently-updated first) with no manual refresh step.
- **FR-006**: WHILE the capture page is open, every printable key MUST insert text into the focused field and MUST NEVER trigger an application command or navigation (PRD F2.3 focus discipline).
- **FR-007**: Pressing `Esc` on the capture page MUST return to the dashboard; if any field holds unsaved text, the system MUST confirm before discarding; with empty fields it returns immediately.
- **FR-008**: IF a submitted title derives a slug already used by an existing live note, THEN the system MUST respond with a conflict (HTTP 409 semantics) and offer a choice: open the existing note at `/note/<slug>`, or save as a new note under the first free unique slug. The conflict MUST be presented inline on the capture page with two keyboard-reachable controls, preserving the typed title, body, and tags until the user chooses. It MUST never overwrite the existing note and MUST never silently discard the typed capture. The reading view at `/note/<slug>` ships with F8; in F2 the acceptance point for "open existing" is the navigation to that URL.
- **FR-009**: Choosing "save as new" MUST preserve the typed title, body, and tags, saving under the first free slug (`<title>-2`, `<title-3>`, …) and committing normally.
- **FR-010**: IF git is unavailable or the commit fails, THEN the note MUST still be saved to disk and the user MUST see a degraded-history warning exactly once per browser page session (a single tab's lifetime; a reload starts a new session); capture MUST NOT block or fail because of git.
- **FR-011**: The system MUST create at most one note per capture submission regardless of duplicate submits (double-Enter, double-click) while a save is in flight.
- **FR-012**: Capture MUST operate fully offline on the loopback interface; no network service may be required or contacted for any capture step, and the app MUST never bind a non-loopback address.
- **FR-013**: An empty or whitespace-only title MUST block submission with inline validation; no file write and no commit may occur.

### Key Entities

- **Capture Draft**: The in-progress capture — title, body (raw Markdown), optional tags, and a dirty flag. Ephemeral: lives only in the open capture page; discarded on `Esc`/navigation (no persistence in v1).
- **Note (seed)**: The persisted result. F1 already defines the entity (title, slug, tags, status, visibility, created, updated, body); F2 pins its creation defaults (`status: seed`, `visibility: private`), its identity (slug auto-derived and unique), and its history entry (git commit `docs(note): capture <slug>`).
- **Slug Collision**: The state where a capture's title-derived slug equals a live note's slug. Carries the existing note's slug and the two user choices (open existing / save as new). Never resolved silently.
- **Recent-Notes Entry**: Dashboard row for a saved note — title, slug, status, last-updated time — ordered most-recently-updated first; the capture loop's visible confirmation.
- **Git Commit (capture)**: The history/backup record for a capture, message `docs(note): capture <slug>`. Failure degrades to "saved without history + one warning" rather than blocking.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the dashboard, ONE keystroke puts the caret in the capture input; the user can begin typing within 200 ms of the keypress (PRD Journey 1 step 2).
- **SC-002**: Submit → note saved, committed, and reflected in dashboard recent-notes within 1 second, at the 95th percentile over 20 consecutive captures (PRD §8).
- **SC-003**: The full capture flow (open dashboard → shortcut → type title + one sentence → save) completes in under 30 seconds median (PRD §11 capture-latency metric).
- **SC-004**: While the capture page is open, 100% of printable keys (a–z, A–Z, 0–9, punctuation) insert text and 0% trigger app commands, verified by a full key sweep.
- **SC-005**: 100% of title collisions present the open-existing vs save-as-new choice; 0% of captures overwrite, merge into, or silently drop an existing note (zero data loss, PRD §8).
- **SC-006**: With git unavailable, 100% of captures still save to disk and the user sees exactly one degraded-history warning per session.
- **SC-007**: The capture loop performs all steps with zero non-loopback network access (PRD §7 F7.2, §8 security).
- **SC-008**: Duplicate submits of one capture (double-Enter/double-click) create exactly one note 100% of the time.

## Assumptions

- **Recent-notes size**: The dashboard recent-notes list shows the 5 most-recently-updated notes (reasonable default; full dashboard polish is F8 scope).
- **Submit mechanics**: Submitting is possible via the visible Save control or `Ctrl/⌘+Enter` anywhere in the capture form; `Enter` in the title field advances focus to the body (fast typing without accidental submit). Keyboard-reachable controls satisfy PRD F8.4.
- **Esc + discard confirm**: Confirm-before-discard when fields are non-empty follows the PRD §8 zero-data-loss rule; empty fields skip the prompt to keep exit frictionless.
- **Collision definition**: "Title collision" = the title-derived slug is already used by a live note (identical titles always collide; different titles that normalize to the same slug also collide). Trashed notes do not collide — F1 frees their slugs.
- **Open-existing discards the draft**: Choosing "open the existing note" is an explicit user decision; the draft is discarded without a second prompt. "Save as new" preserves everything typed.
- **Warn-once scope**: "Warn once" means once per browser page session (the first git failure in a tab; a reload starts a new session), not once per capture — per PRD F9.2.
- **Tags optional**: Capture supports 0–N tags with 1–2 as the expected habit (Journey 1 step 3), entered in one comma-separated field; F1's normalization (trim, case-insensitive de-dup) applies.
- **No draft persistence**: A browser reload or navigation away from `/new` loses unsaved text (v1 scope; no localStorage drafts).
- **Commit identity**: Capture commits use the environment's configured git author identity; capture only sets the message.
- **Vault**: Capture writes to the same configured vault directory F1 uses; vault configuration itself is settings/F1 scope.
- **Direct `/new` access**: The capture page works when reached directly by URL, not only via the dashboard shortcut.

## Locked Constraints (Orchestrator Decisions — final, not open questions)

These decisions were made by the orchestrator (card t_fb2bd371) and are identical across every F2 sibling card. They bind the plan/tasks/implementation steps.

- **D1**: `/new` is the quick-capture page (PRD §6); the dashboard `/` gets the capture shortcut + recent-notes entry.
- **D2**: Save via the F1 API `src/lib/notes.ts` `createNote` (`status:'seed'`, `visibility:'private'`); slugify + `resolveUniqueSlug`; `SlugConflictError` → HTTP 409 → open `/note/<slug>` or save-as-new-unique-slug.
- **D3**: Capture git-commits via simple-git with message `docs(note): capture <slug>`; save+commit < 1 s; no git → save + warn once.
- **D4**: Keyboard: dashboard-scoped `c` (ignored in inputs); `/new` autofocuses; capture-open → bare keys type only; `Esc` → dashboard.
- **D5**: Validation is `npm run test` + `npm run build`; loopback bind only, never `host:true`.
- **D6**: Artifacts at `specs/f2-quick-capture/{spec,plan,tasks}.md`; prompts at `.opencode/commands/speckit.<step>.md`.
- **D7**: F1 base: `src/lib/notes.ts`, `src/lib/notes.test.ts`; dashboard `src/pages/index.astro`; layout `src/layouts/Base.astro`.

## Dependencies & Out of Scope

**Depends on (exists today)**:

- F1 persistence API in `src/lib/notes.ts`: `createNote`, `slugify`, `resolveUniqueSlug`, `SlugConflictError` (code `SLUG_CONFLICT`), `CreateInput` — explicit `slug` throws on a taken slug (never auto-uniquified); omitted slug auto-uniquifies via `resolveUniqueSlug` (`title`, `title-2`, …). Covered by `src/lib/notes.test.ts`.
- Dashboard page `src/pages/index.astro` (currently scaffold placeholder) and layout `src/layouts/Base.astro`.
- `simple-git ^4.0.2` already declared in `package.json`; validation commands `npm run test` / `npm run build`.

**Out of scope for F2** (owned by other features):

- Reading view, editor, live preview, autosave (F8) — including the `/note/<slug>` route itself: F2's "open existing" action navigates to that URL and the navigation target is the F2 acceptance point (the page may 404 until F8 ships); dashboard sections beyond recent-notes (F4/F8: seeds-needing-attention, quick stats).
- Search (F5), tag index pages (F6), wiki-link autocomplete (F3), lifecycle status changes (F4), publishing (F10), OS-level global hotkey (F16).
- Draft persistence across reloads; multi-user or concurrent-writer coordination beyond unique-slug safety.
