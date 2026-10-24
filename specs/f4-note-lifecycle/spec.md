# Feature Specification: F4 Note Lifecycle States

**Feature Branch**: `digitalgarden/t_bdceee6f-f4-note-lifecycle-states` (build card t_23323579)

**Created**: 2026-10-20

**Status**: Draft

**Input**: Parent decomposition card t_bdceee6f — 3 acceptance criteria (AC1 create without status defaults to `seed`, AC2 status change updates frontmatter on save and propagates to badge / `/status/[state]` views / dashboard lists, AC3 dashboard shows "seeds needing attention" sorted least recently updated), grounded in PRD §7 F4 (lifecycle states: four-value frontmatter metadata, settable per note, filterable; its three acceptance criteria are the parent's AC1–AC3 verbatim), §4 Journey 4 (Curate and Promote: weekly seeds review → `growing` → `evergreen` surfacing in the evergreen browse view), §6 (app map: Dashboard with "seeds needing attention"; `/status/[state]` route), §7 F6 AC2 (browse-by-status lists — F6 reuses F4's view per D4), §8 (loopback only, zero data loss, list/note views < 500 ms, 5,000-note scale), §10 (keyboard-first, no bare global bindings), §13 (lifecycle transitions are manual-only in the current spec — F4 implements exactly that), and the on-disk F1/F2/F3 surface (`NOTE_STATUSES` and the seed defaults in `src/lib/notes.ts`, the F2 dashboard, the F3 `/note/[slug]` view with its status badge and body-only `POST /api/note`).

**Provenance note**: this card (t_ff12dd62) re-runs the F4 spec chain that card t_3d7b5e84 completed on the now-removed worktree `t_0a5d0cfe`; its uncommitted `specs/f4-note-lifecycle/` artifacts were lost with that worktree, so nothing could be reused from disk. The locked decisions D1–D7 (identical on both cards) and the acceptance criteria bind this spec; every code fact cited below was re-verified by fresh probes against THIS checkout (branch `digitalgarden/t_bdceee6f-f4-note-lifecycle-states` @ f213b0d) today, not carried over.

Locked orchestrator decisions D1–D7 are recorded in "Locked Constraints" at the end of this document and are NOT open questions.

## Clarifications

### Session 2026-10-20

Headless clarify run (spec card t_ff12dd62, single-session chain): 5 questions raised, each resolved by selecting the recommended option; choice + rationale recorded here and applied to the relevant sections. D1–D7 were not re-opened.

- **Q: How must the extended save request be shaped so a status change can never clobber fields it did not carry, and what happens to a status outside the four lifecycle values?** → **A: The request carries `{ slug, baseHash, force?, body?, status? }` with at least one of `body`/`status`; an omitted field keeps its disk value; a status outside the enum is rejected as an invalid payload before anything is written.** Rationale: closes D3's two probed gaps — today a `status` key is silently ignored (a save answers success while the status never changes: the worst possible client contract) and a status-only post is rejected outright because the body is mandatory. "Omitted keeps disk truth" + "at least one field" makes a forced status overwrite *physically unable* to claim a body it didn't send, which is exactly AC2's zero-data-loss posture applied to the new field. (Applies to FR-003/FR-004, US1 scenarios 6–7, Edge Cases, Spec Findings 1.)
- **Q: Where does the status control live on the note view, and when does it save?** → **A: A `<select>` in the note header beside the badge, preselected to the current state; it saves when the selection changes, through the same load-time-snapshot conflict check and the same inline reload-or-overwrite choice as the body save; it is disabled while body edit mode is open and while any save is in flight, and re-selecting the current state sends nothing.** Rationale: D6 pins the dropdown + shared-conflict-UX shape; post-on-change keeps the control to one gesture with no separate button; the disable-while-editing rule closes the self-inflicted-conflict hole (a status post would stale the page's own snapshot, and "Reload" would then discard a dirty body buffer — PRD §8 forbids exactly that); one conflict region serving both flows keeps the UX honest instead of forking. (Applies to FR-003, US1 scenarios 2–4, Edge Cases, Assumptions.)
- **Q: How does the Gardener reach `/status/<state>` given there is no nav bar or `/status` index?** → **A: Entry points only — the note view's status badge links to its own state page, the dashboard's Recent-notes badges link to theirs, and the "Seeds needing attention" heading links to `/status/seed`; no nav chrome, no status counts, no index page (F6 owns browsing chrome).** Rationale: the browse view (US2) must be reachable by click for AC2's propagation to be *observable*, and badges are already rendered everywhere F4 touches; a global nav/count system is precisely the scope D1 compresses away and F6 re-lands generically. (Applies to FR-007, US2, Assumptions, Spec Findings 6.)
- **Q: Now that `/note/<slug>` exists (F3), do the dashboard's Recent-notes rows become links — the follow-up F3 explicitly deferred to "F4/F8 scope"?** → **A: Yes — all dashboard note rows (Recent notes and Seeds needing attention) link to `/note/<slug>`.** Rationale: F3 recorded this deferral on purpose so F4 could close it; leaving one table linked and the other not on the same page would be a visible inconsistency for the cost of one anchor wrap, and the seeds rows are already linking per D5. (Applies to FR-010, US3 scenario 5, Assumptions, Spec Findings 4.)
- **Q: Does a status-only save bump the note's `updated` timestamp?** → **A: Yes — exactly like a body save; there is no second save path and no timestamp-preservation mode at the API boundary.** Rationale: `updated` means "last tended", and a status change *is* tending; special-casing would fork the write semantics and make the "Updated …" line lie. Consequences accepted and recorded: a note just demoted back to `seed` appears at the recent end of the attention list until it ages again, and an unchanged re-selection posts nothing so idle browsing never mutates timestamps. (Applies to FR-003, US1 scenario 3, Edge Cases, Assumptions.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Change a note's status from its view (Priority: P1)

The Gardener opens a note at `/note/<slug>` and sees its current lifecycle state as the familiar badge — and, right beside it, a status dropdown preselected to that state. They pick a different state; the change is saved to the note's frontmatter through the same protected save path the body editor uses, and the badge updates. If the file changed on disk behind the app's back, the app offers the explicit reload-or-overwrite choice instead of destroying either version. Notes created without ever touching this control are `seed` from the moment they exist.

**Why this priority**: AC2's mutation half is the feature's core promise ("settable per note", PRD F5 table) and everything else in F4 observes its result; the read-side surfaces (US2/US3) are meaningless until a status can actually change. D1 scopes this as the MINIMAL mutation surface — a header control, not F8's full editor.

**Independent Test**: open a `seed` note, select `growing`, and verify the note's frontmatter now says `status: growing` on disk, the badge shows `growing`, and the note has moved between the `/status/seed` and `/status/growing` lists and out of the dashboard's seeds section — with no manual refresh anywhere. Separately, modify the file externally after the view loaded, change the status, and verify the conflict choice appears with nothing lost until chosen.

**Acceptance Scenarios**:

1. **Given** a note view, **When** the Gardener selects a different state in the status control, **Then** the status is persisted to the note's frontmatter, the view reflects the new badge, and no git commit is created by the save.
2. **Given** a note whose file was changed by an external editor after the view loaded, **When** the Gardener changes the status, **Then** an inline conflict appears with two keyboard-reachable choices — reload from disk (confirming first) or overwrite — and neither the disk content nor the pending change is applied until the user chooses.
3. **Given** the status control showing the note's current state, **When** the Gardener re-selects that same state, **Then** no save request is made and the note's `updated` timestamp is unchanged.
4. **Given** body edit mode is open (especially with unsaved changes), **When** the Gardener looks at the status control, **Then** it is disabled until edit mode is closed — a status save can never discard or bypass a dirty body buffer.
5. **Given** a note created through any existing path (capture, pending-link create, API) without an explicit status, **When** the note is read back, **Then** its status is `seed` — the default applies with no status ever supplied.
6. **Given** a save request carrying a status value outside the four lifecycle states, **When** it reaches the app, **Then** it is rejected as an invalid payload and nothing on disk changes.
7. **Given** a status-only save (the body untouched), **When** it succeeds, **Then** the on-disk body, title and tags are exactly what was on disk before the save — a status change can only ever claim the status.

---

### User Story 2 - Browse notes by lifecycle state (Priority: P1)

The Gardener opens `/status/growing` (typically by clicking a status badge) and sees every `growing` note listed — title, status badge, last-updated — most recently updated first, under a heading that names the state they asked for. `/status/archived` shows archived notes; nothing is ever hidden by being archived. A state with no notes gets an honest empty sentence about that state, not seed-shaped copy. A URL that names no real state is simply not found.

**Why this priority**: AC2's propagation half ("browse views", PRD F4 AC2 / F6 AC2) — without this surface a status change has nowhere visible to ripple to, and Journey 4 step 3 ("surfaces in the evergreen browse view") is this story. It is also the shared pattern D4 pins for F6 to reuse.

**Independent Test**: with a vault holding notes in all four states, open each of `/status/seed`, `/status/growing`, `/status/evergreen`, `/status/archived` and verify each lists exactly that state's notes newest-updated first; open `/status/nonsense` and verify a 404; empty a state and verify its page shows a state-appropriate empty message.

**Acceptance Scenarios**:

1. **Given** `/status/<state>` for a valid state, **When** the page loads, **Then** it lists every note whose status is that state — title (linking to its view), status badge, last-updated — sorted most recently updated first.
2. **Given** a valid state with no notes, **When** the page loads, **Then** it shows an empty-state message naming the requested state, not a message written for a different state.
3. **Given** an unknown state in the URL (e.g. `/status/draft`, `/status/SEED`), **When** the page is requested, **Then** a 404 is returned — no crash, no stack trace, no partially rendered list.
4. **Given** a note with a status that its on-disk frontmatter cannot justify (malformed file), **When** a state list loads, **Then** the page still renders for every healthy note — one malformed file never takes the browse view down.
5. **Given** archived notes, **When** `/status/archived` is opened, **Then** they are listed exactly like any other state — archived is a state, not a deletion.

---

### User Story 3 - Dashboard "seeds needing attention" (Priority: P2)

Once a week the Gardener opens the dashboard (PRD Journey 4 step 1) and finds, beside Recent notes, a "Seeds needing attention" list: the `seed` notes that have gone least recently updated — the ones quietly rotting — each row linking straight to its note so they can tend it and mark it `growing`.

**Why this priority**: AC3 completes the journey loop (capture → neglect → weekly tending), but it only observes statuses that US1 mutates and US2 displays, so it lands after them. It is still acceptance-bearing and must ship before F4 closes.

**Independent Test**: seed a vault with several notes of mixed states and ages, open the dashboard, and verify the seeds section lists only `seed` notes, oldest-`updated` first, capped at five rows, each row a working link to its note; tend a seed (status → `growing`) and verify it leaves the list on the next dashboard load.

**Acceptance Scenarios**:

1. **Given** a vault with more than five `seed` notes of varying `updated` times, **When** the dashboard loads, **Then** a "Seeds needing attention" section lists the five least-recently-updated seeds, oldest first.
2. **Given** notes whose status is `growing`, `evergreen` or `archived`, **When** the dashboard loads, **Then** none of them appear in the seeds section — it is exactly the `seed` set, capped.
3. **Given** two seeds sharing an `updated` timestamp, **When** the dashboard loads, **Then** their relative order is deterministic (slug order), so the list never reshuffles between loads.
4. **Given** a vault with no `seed` notes, **When** the dashboard loads, **Then** the seeds section shows an explicit empty message and the Recent notes section is unaffected.
5. **Given** a row in the seeds section, **When** the Gardener activates it (click or keyboard), **Then** they land on that note's view.

---

### Edge Cases

- Save request with an out-of-enum status (`"growing up"`, `"SEED"`, `42`, `null`) → rejected as invalid payload, nothing written, previous status intact (D2).
- Status change attempted while body edit mode is open → control disabled; the dirty buffer is never touched, bypassed, or discarded by a status save.
- Status change racing an external on-disk edit → snapshot conflict (same machinery as body save): inline reload-or-overwrite choice, neither side changed until chosen; an Overwrite applies only the fields the request claims — a forced status save can never clobber a newer disk body (the body is disk-truth when not sent).
- Re-selecting the current status → no request, no `updated` bump, no phantom write.
- A status-only save bumps `updated` exactly like a body save (single save semantics — no second code path). Consequence accepted: a note just demoted back to `seed` lands at the recent end of the attention list until it ages again; a note tended to `growing` shows a fresh `updated` everywhere.
- `/status/SEED`, `/status/Seed/`, `/status/growing/` (trailing slash) → 404: the state must match a lifecycle value exactly (lowercase, no decoration).
- A note file whose frontmatter status is invalid on disk → that note is skipped in state lists and dashboard sections (tolerant per-note read, dashboard precedent); it still 500s/loud-fails only where it already does today (direct view of that note) — F4 changes no read path.
- Empty state for a valid-but-empty state → param-driven message naming that state; the same component never hard-codes seed wording (D4's F6-reuse constraint).
- Vault with zero notes → dashboard shows both empty states; each `/status/<valid>` page shows its empty message; `/status/<invalid>` still 404s.
- Two tabs open on the same note → the second tab's status change carries a stale snapshot → 409 flow; the first tab's write is never silently lost.
- Archived notes stay fully readable, linkable and listed (backlinks, resolution, search inclusion are F1/F3/F5 policies — F4 neither changes nor re-decides them).
- Very large vault (5,000 notes, PRD scale) → list views must still render within the local view budget; if a measured run cannot, the follow-up is a plan/tasks decision, not a silent miss (same pattern as F3's recorded scale note).
- Status value strings are matched exactly at the API boundary (no trimming there — trimming belongs to the frontmatter parser for disk files); the dropdown can only ever send valid values.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST recognize exactly four lifecycle states — `seed`, `growing`, `evergreen`, `archived` — as the note's status, stored in its frontmatter; a save request carrying any other status value MUST be rejected as an invalid payload with nothing written (D2).
- **FR-002**: A note created without an explicit status MUST be created as `seed`, and a note file whose frontmatter omits the status key MUST read as `seed`; this default already exists and MUST be regression-locked by tests, never re-plumbed (D2, AC1).
- **FR-003**: The note view MUST expose a keyboard-reachable status control (the four states, current state preselected) that saves a changed status through the same protected save path as body edits — the same load-time snapshot conflict detection and the same explicit inline reload-or-overwrite choice on conflict, with neither side changed until the user chooses; the control MUST be disabled while body edit mode is open or a save is in flight, and re-selecting the current state MUST send no request (D6, clarification Q2 below).
- **FR-004**: A status value sent with a save request MUST be validated before anything is written, MUST change only the status (title, tags and — when the request does not carry a body — the body remain disk truth), and MUST follow the same conflict/force semantics as a body save (D3, clarification Q1 below).
- **FR-005**: Every successful status change MUST be visible on the very next view with no manual refresh step — in the note's badge, in the `/status/[state]` lists, and in the dashboard's lists (AC2).
- **FR-006**: Status saves MUST create no git commit (F9 owns commit-on-save; F3's proven precedent applies unchanged — D3).
- **FR-007**: The system MUST serve a browse view at `/status/<state>` that validates the state against the four lifecycle values — an unknown state returns 404 without crashing — and lists the notes of that state, most recently updated first, showing each note's title (linking to its view), status badge and last-updated (D4, PRD F6 AC2).
- **FR-008**: The status-browse view's heading and empty-state text MUST be driven by the requested state so the view is generic for all four states and reusable for other groupings later; it MUST NOT be hard-coded to any one state's wording (D4).
- **FR-009**: Archived notes MUST be listed at `/status/archived` exactly like every other state; setting a status (including `archived`) MUST NOT delete, hide or alter a note's content or links (D4).
- **FR-010**: The dashboard MUST gain a "Seeds needing attention" section listing `seed` notes sorted least recently updated first (deterministic tie-break), capped at five rows, each row linking to that note's view, with an explicit empty state when there are no seeds (D5, AC3).
- **FR-011**: All F4 controls and links (status control, conflict choices, list rows, badges) MUST be reachable by keyboard alone with zero bare global key bindings; all F4 reads and writes MUST work fully offline on the loopback interface with no non-loopback binding and no external network request (PRD §8/§10).
- **FR-012**: Validation MUST remain `npm install` + `npm run test` + `npm run build`, all green, with no new runtime or dev dependencies introduced by F4 (D7).

### Key Entities

- **Note status**: one of the four lifecycle values, frontmatter metadata on every note; defaults to `seed`; changed only through the protected save path; never a free-form string.
- **Status-save request**: the note's identity + the load-time snapshot + the new status (and optionally a body) — rejected unless the status is a lifecycle value; claims only the fields it carries.
- **State-browse list**: one per lifecycle state; state-param-driven heading/empty text; rows = notes of that state, newest-updated first.
- **Seeds-attention selection**: the ≤ 5 least-recently-updated `seed` notes, oldest first, deterministic tie-break — a pure selection over the vault's notes, consumed by the dashboard.
- **Conflict choice**: the existing explicit reload-or-overwrite decision, now shared by body saves and status saves (one conflict UX, not two).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of successful status saves are reflected on the very next view of the badge, the `/status/[state]` lists, and the dashboard lists, with zero manual refresh steps and zero divergence between the three (AC2).
- **SC-002**: External-edit conflicts during a status change: 0 silent overwrites and 0 silently discarded buffers — both the disk content and the pending change survive until an explicit choice (PRD §8 zero data loss).
- **SC-003**: 100% of notes created without an explicit status are `seed` on read-back; 0 notes are ever written with a status outside the four lifecycle values (AC1).
- **SC-004**: Each `/status/<state>` page lists exactly the notes whose status matches, ordered most recently updated first; 100% of unknown states return 404; 0 crashes from any state URL or vault content.
- **SC-005**: The seeds-attention section equals ground truth computed from the vault — exactly the ≤ 5 least-recently-updated `seed` notes, oldest first, deterministic under timestamp ties; 0 non-seed notes ever appear (AC3).
- **SC-006**: Every F4 control (status save, conflict choices, list rows, badge links) is reachable by keyboard alone; 0 bare printable-key global bindings introduced (PRD F8.4/§10).
- **SC-007**: The dashboard and each `/status/[state]` view render and are interactive in under 500 ms locally (PRD §8 view budget applied to the new surfaces).
- **SC-008**: Every F4 read and write makes zero non-loopback network calls (PRD §8 security).
- **SC-009**: Status saves create zero git commits — `git log` is byte-identical before and after any number of status changes (D3, F3 Q4 precedent) — and body-save behavior is unchanged by the extension.

## Assumptions

- **Manual-only transitions**: PRD §13's "auto-suggest `seed → growing` when a note gains ≥ 2 links?" is explicitly future work validated after real use; F4 implements manual selection only.
- **Minimal mutation surface**: F4 changes status from the note view's header control; F8's full editor will later absorb lifecycle editing. No second edit surface, no bulk actions, no status history/audit trail.
- **One save semantics**: a status-only save bumps `updated` exactly like a body save (clarification Q5); no `keepTimestamps` special-casing at the API boundary.
- **Post-on-change control**: the status control saves when the selection changes (clarification Q2); there is no separate "save status" button, and an unchanged selection posts nothing.
- **Entry points, not navigation**: state browsing is reached through the note-view badge and the dashboard's badges/heading (clarification Q3); global nav chrome, status counts and a `/status` index page belong to F6's browsing work.
- **Dashboard row links**: note rows on the dashboard link to `/note/<slug>` (clarification Q4), closing the follow-up F3 explicitly deferred ("the dashboard is F4/F8 scope").
- **Tolerant list reads**: `/status/[state]` and the dashboard skip a note file that cannot be parsed (one bad file must not take a list view down — dashboard precedent); direct-view loud-fail behavior is unchanged.
- **Archived-in-results policy**: whether archived notes appear in search results and tag listings is F5/F6 policy (PRD §13's second open question); F4 only guarantees `/status/archived` visibility (D4).
- **No pagination**: list views show every matching note uncapped for v1 (single user, ≤ 5,000 notes); SC-007 measures the budget and the follow-up is recorded rather than built speculatively.
- **Exact status matching at the API**: the save endpoint matches status values exactly (no trimming); the dropdown can only send valid values, and disk-file trimming remains the frontmatter parser's job.
- **Styling**: badges and lists reuse the existing badge/table styling; no new styling system (D6).

## Spec Findings (gaps recorded per card directive — closed here or queued, not re-opened)

1. **D3 verdict — EXTEND the existing save endpoint, no new endpoint** (probed on this checkout today): today a `status` key in the save payload is *silently ignored* (a body save with `status: 'growing'` answers 200 and leaves the on-disk status untouched — the client would believe a change that never happened), and a status-only payload is *rejected* because the body is required. Both are exactly the gaps D3's extension must turn into explicit contract: at least one of body/status per request, omitted fields keep disk truth, out-of-enum status → invalid-payload 400. The extension reuses the endpoint's existing snapshot/conflict machinery unchanged.
2. **D2 verified on disk, no re-plumb**: the `seed` default exists at both ends of the pipeline — frontmatter parse (`src/lib/notes.ts:449`) and create (`:638`) — and the four-value enum plus its validation exist at `:63`, `:450`, `:677`. AC1 needs regression tests, not new plumbing.
3. **The write path already exists**: `saveNote` validates status, bumps `updated`, and carries the snapshot/409 conflict machinery; `archiveNote` is a status save in disguise. A status change is therefore a *payload extension* of the existing save contract — no new persistence layer (D1), no second write path.
4. **Dashboard rows are still non-links** (F2 shipped them non-linked; F3 explicitly deferred linking to "F4/F8 scope") — closed here by clarification Q4: all dashboard note rows link to their note views.
5. **The full-vault index helper throws on the first malformed note file** (`refreshVaultIndex`), while the dashboard deliberately reads notes one by one and skips the broken ones — the new `/status/[state]` view must follow the dashboard's tolerant pattern, not the index helper's loud one. Recorded so the plan cannot pick the wrong read.
6. **Status browsing has no entry point in the current UI** (no nav bar, no `/status` index) — closed by clarification Q3: badges and the seeds heading are the entry points; nav chrome and counts are F6's scope, keeping F4 minimal (D1).
7. **PRD §13 open questions stay open**: auto-suggested transitions (future, after real-use validation) and archived-notes-in-search/tag-listings (F5/F6 policy) are recorded as out of scope here, not silently decided.

## Locked Constraints (Orchestrator Decisions — final, not open questions)

These decisions were made by the orchestrator (parent card t_bdceee6f) and are identical across every F4 sibling card. They bind the plan/tasks/implementation steps.

- **D1**: Compressed path — read-side plus minimal status-mutation only; no new persistence layer; ship parks for operator approval (no commits/push/PR from this chain).
- **D2**: Status enum = `NOTE_STATUSES` `['seed','growing','evergreen','archived']` (`src/lib/notes.ts:63`). Invalid status → 400 invalid-payload. Missing on create/parse → `'seed'` (already at `notes.ts:449,638` — verify + regression-test, do not re-plumb).
- **D3**: Status mutation reuses F1's `saveNote` via an EXTENDED `POST /api/note` accepting an optional `status` field (same baseHash/force → 409 `ExternalEditConflictError` flow as body save; disk truth for title/tags preserved). No new endpoint. Status saves never git-commit (F9 owns commits; F3's Q4 precedent).
- **D4**: `/status/[state]` is the SHARED status-browse view: `src/pages/status/[state].astro` validates the param against `NOTE_STATUSES` (unknown → 404), lists that state sorted most-recently-updated first, with param-driven heading + empty text (NOT seed-shaped) so F6 reuses the pattern. Archived visible at `/status/archived`.
- **D5**: Dashboard — new `selectSeedsNeedingAttention(notes, limit)` in `src/lib/dashboard.ts`: filter `status==='seed'`, sort `updated` ASC (least recently updated first = needs attention), slug ASC tie-break — `SEEDS_ATTENTION_LIMIT=5`. `index.astro` adds a "Seeds needing attention" section; rows link to `/note/<slug>` (the F3 view exists on this base).
- **D6**: Note view — the badge stays (existing badge/status classes reused, no new styling system); add a status `<select>` dropdown posting via the extended `/api/note` with the same snapshot/409 inline-conflict UX as the body save.
- **D7**: Validation gate is `npm install` + `npm run test` + `npm run build` (`.ainative/project.yaml` already lists all three — verified today).

## Dependencies & Out of Scope

**Depends on (exists today — verified on this checkout)**:

- F1 `src/lib/notes.ts`: `NOTE_STATUSES`/`NoteStatus` (:63), status parse + seed default (:449), `createNote` seed default (:638), `saveNote` (status validation :677, `updated` bump, snapshot/`baseSnapshot`/`force` → `ExternalEditConflictError` machinery), `archiveNote` (:718), `readNote`/`listNoteSlugs` — covered by `src/lib/notes.test.ts`.
- F2 `src/lib/dashboard.ts` (`selectRecentNotes`, `RECENT_NOTES_LIMIT`) + `src/pages/index.astro` (Recent notes table, badge classes, tolerant per-note reads) + `src/layouts/Base.astro` + `src/lib/vault.ts` `resolveVaultDir()`.
- F3 `src/pages/note/[slug].astro` (status badge in the header, body-only edit surface, `#note-conflict` reload/overwrite region, save wiring) + `src/pages/api/note.ts` (`POST /api/note` with the snapshot→409 contract — the file D3 extends) + `src/lib/wikilink-client.ts` (save decisions/ports + tests) + `src/pages/api/note.test.ts` (the contract suite the extension must keep green).
- Gate: `npm install` + `npm run test` (9 files / 171 tests green at f213b0d, re-measured today) + `npm run build` green.

**Out of scope for F4** (owned by other features):

- Tag pages, `/tags`, browse chrome, status counts and any `/status` index page (F6 — which reuses F4's state-list pattern per D4); full-text search and archived-in-search policy (F5); commit-on-save/settings/push (F9); side-by-side editor, autosave, themes, bulk status actions (F8); publishing and public visibility semantics (F7/F10); orphan report (F12); auto-suggested lifecycle transitions (PRD §13 future work); custom statuses, status history/audit, multi-select.
