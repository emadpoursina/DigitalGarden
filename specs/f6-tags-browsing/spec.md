# Feature Specification: F6 Tags & Browsing

**Feature Branch**: `digitalgarden/t_8e4e7e60-f6-tags-browsing` (spec card t_4b8f1860, parent t_8e4e7e60)

**Created**: 2026-10-25

**Status**: Draft

**Input**: Parent card t_8e4e7e60 — 3 acceptance criteria (AC1 `/tags` lists all tags with counts alphabetical, AC2 `/tags/[tag]` + `/status/[state]` list matching notes with title + status badge + last-updated, AC3 removing a tag from every note drops it on next refresh), grounded in PRD §7 F6 (tag index, per-tag lists, browse-by-status; its three acceptance criteria are the parent's AC1–AC3 verbatim), §4 Journey 4 (Curate and Promote: weekly seeds review → growing → evergreen surfacing in browse views), §6 app map (`/tags`, `/tags/[tag]`, `/status/[state]`), §8 (list/note views < 500 ms local, loopback only, zero data loss, 5,000-note scale), §10 (keyboard-first, modifier-only or command-mode shortcuts — bare printable keys never bound globally; screen-reader labels; WCAG 2.1 AA), and the on-disk F1/F4/F5 surface (`buildTagIndex` + `refreshVaultIndex` + `normalizeTags` + `SearchDoc`/`buildSearchDocs` in `src/lib/notes.ts`, `selectByStatus` + `statusHeading`/`statusEmptyText` in `src/lib/status-list.ts`, the tolerant per-note read in `src/pages/status/[state].astro` and `src/pages/search.astro`, the dashboard table pattern in `src/pages/index.astro`, the 19-line nav-less `src/layouts/Base.astro`).

**Provenance note**: prior F6 spec attempt t_4e7e4edb (archived, base f213b0d) is reference ONLY — nothing reused from disk. F4 (`status/[state].astro` + `status-list.ts`) and F5 (`search.astro` + tolerant-read + JSON-island posture) have since landed, so D5/D7 findings from that attempt are stale. The locked decisions D1–D8 (on this card's body) and the acceptance criteria bind this spec; every code fact cited below was re-verified by fresh probes against THIS checkout (branch `digitalgarden/t_8e4e7e60-f6-tags-browsing` @ 4cb3077) today, not carried over.

Locked orchestrator decisions D1–D8 are recorded in "Locked Constraints" at the end of this document and are NOT open questions.

## Clarifications

### Session 2026-10-25

Headless clarify run (spec card t_4b8f1860, single-session chain): 5 questions raised, each resolved by selecting the recommended option grounded in locked decisions D1–D8 and fresh probes of this checkout; choice + rationale recorded here and applied to the relevant sections. D1–D8 were not re-opened.

- **Q: What is the display label for a tag — first-seen casing, title-case, or the lowercase canonical key?** → **A: Lowercase canonical key for `/tags` rows, counts, ordering, and index lookup; the `/tags/[tag]` heading and empty-state copy show the RAW requested segment.** Rationale: D2 pins "display label = lowercase canonical key" and `buildTagIndex` keys are already lowercased + sorted; first-seen casing would fork a second canonical form and break the alphabetical contract. The per-tag heading keeps the raw param (open-vocabulary honesty: `/tags/AI` says "AI" while listing the `ai` members — plan R4, tasks T020 as shipped). (Applies to FR-003/FR-004, US1 scenario 2, US2 scenario 1, Edge Cases.)
- **Q: Unknown tag on `/tags/[tag]` — 404 like F4's unknown state, or 200 empty-state?** → **A: 200 empty-state naming the requested tag, never 404.** Rationale: D4 pins open-vocabulary (tags are user-created, unbounded) vs F4's closed 4-value enum that 404s; a 404 would punish every typo and every just-removed tag with a dead end. (Applies to FR-005, US2 scenarios 3–4, Edge Cases.)
- **Q: Do archived notes appear in `/tags` counts and `/tags/[tag]` rows, or behind a filter like F5's archive filter?** → **A: INCLUDED with their status flag visible — no filter in v1.** Rationale: D2 pins "archived stays INCLUDED with status flag" (notes.ts header + F5 D5 precedent for indexing); F5 filters by default because search ranks relevance, while tag browsing is an exact-membership list where hiding members would lie about the tag. (Applies to FR-006, US1 scenario 4, US2 scenario 5, Edge Cases.)
- **Q: How are tag URL segments encoded/decoded (`C++`, `a/b`, `50%`, unicode, malformed `%`)?** → **A: `tagHref = '/tags/' + encodeURIComponent(tag)`; `decodeTagParam = try decodeURIComponent (URIError → raw) then .toLowerCase() + index lookup; miss → empty-state, never 500 *once the request reaches the route*.** Rationale: D4 pins the exact URL contract; `encodeURIComponent` handles `+`, `/`, `%`, unicode deterministically; a malformed escape that reaches the route degrades to a lookup miss (empty-state), never a thrown 500. Requests whose escapes are malformed at the HTTP layer never reach the route: Astro 7 rejects them upstream — `astro dev` answers 500 (`devTrailingSlash`, `decodeURI` → `next(e)`) and the built node server answers 400 ("Bad request.") — before any F6 code runs. F6 adds no new 500 of its own. (Applies to FR-007, US1 scenario 3, US2 scenario 4, Edge Cases.)
- **Q: What reaches `/tags` from the rest of the app — is there any nav chrome today, and where does the entry link live?** → **A: One landmark `<nav id="site-nav" aria-label="Sections">` above `<slot/>` in `Base.astro` carrying `<a href="/tags" id="tags-entry">Tags</a>`; zero key handlers; per-page headers untouched.** Rationale: D7 pins the minimal Base insertion (currently zero anchors — verified 19-line shell); per-page header links would scatter browsing chrome across four owners, while one landmark gives every view the same entry point with no key-binding surface. (Applies to FR-008, US3, Edge Cases.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse the tag index (Priority: P1)

The Gardener opens `/tags` (via the new site nav) and sees every tag in the vault — each row naming the tag (lowercase canonical) with its note count, sorted alphabetically, each linking to that tag's note list. A vault with no tags at all gets an honest empty sentence, never a 404 and never a blank panel. Tags with special characters (`C++`, `a/b`, `50%`, unicode) link and resolve correctly.

**Why this priority**: AC1 is the entry point to the whole feature — without a reachable, complete tag index, per-tag lists have no observable surface. Journey 4's "explore a topic from several entry points" starts here.

**Independent Test**: seed a vault with mixed-case tags (`AI`, `ai`, ` Retrieval-Practice `), special tags (`C++`, `a/b`, `50%`, unicode), and an untagged note; open `/tags` and verify one row per canonical tag, counts correct, alphabetical, every row links to `/tags/<encoded>`; empty the vault of tags and verify the empty-state message with a 200.

**Acceptance Scenarios**:

1. **Given** a vault with tags across notes, **When** the Gardener opens `/tags`, **Then** the page lists every canonical tag with its note count, sorted alphabetically (code-unit order on the lowercase key), each linking to `/tags/<tag>` via `tagHref`.
2. **Given** tags authored with mixed case or surrounding whitespace, **When** `/tags` loads, **Then** each canonical lowercase key appears exactly once with the merged count — no `AI` / `ai` duplicates.
3. **Given** tags needing URL encoding, **When** the Gardener follows a `/tags` row link, **Then** the browser lands on that tag's list (round-trip `tagHref` → `decodeTagParam` preserves identity).
4. **Given** archived notes carrying tags, **When** `/tags` loads, **Then** their tags are counted identically to live notes and no filter control hides them.
5. **Given** a vault with zero tags (or zero notes), **When** `/tags` loads, **Then** it returns 200 with an empty-state message — never 404, never a blank panel.
6. **Given** a note file that cannot be parsed, **When** `/tags` loads, **Then** the page still renders over every healthy note — one malformed file never 500s the view.

---

### User Story 2 - List notes by tag (Priority: P1)

The Gardener follows a tag to `/tags/<tag>` (or types it directly) and sees every note carrying that tag — title (linking to its view), status badge, last-updated — most recently updated first, under a heading naming the requested tag. An unknown or just-removed tag gets an honest empty sentence naming the tag, not a 404. Matching is case-folded, so `/tags/AI` and `/tags/ai` show the same list.

**Why this priority**: AC2's tag half is the feature's core promise ("explore a topic from any entry point", F6 user story) and Journey 3 step 4 ("refine by tag"). US1 without US2 is an index with nowhere to go.

**Independent Test**: seed notes sharing a tag with mixed-case authorship and varied timestamps/statuses (including archived); open `/tags/<tag>` in several casings and verify identical newest-first rows with title links + badges + `<time>`; open an unknown tag and verify the 200 empty-state naming it.

**Acceptance Scenarios**:

1. **Given** notes carrying a tag (authored in mixed case), **When** the Gardener opens `/tags/<tag>` in any casing, **Then** it lists exactly those notes — title (link `/note/<slug>`), status badge, last-updated `<time>` — sorted `updated` DESC with `slug` ASC tie-break.
2. **Given** a per-tag list, **When** the Gardener reads a row, **Then** the badge reuses the `.badge[data-status]` idiom (page-scoped copy) and the timestamp is a `<time datetime>` — the F4 row discipline.
3. **Given** an unknown tag (never used, or removed from every note), **When** the page is requested, **Then** it returns 200 with an empty-state message naming the requested tag — no 404, no stack, no partially rendered list.
4. **Given** a tag URL with special characters or a decodable escape sequence, **When** the page loads, **Then** decoding never throws: valid encodings resolve, any decodable segment that simply misses the index degrades to the empty-state — never a 500 from F6 code. (Malformed escapes at the HTTP layer — e.g. `/tags/%E0%A4%A`, `/tags/50%`, `/tags/%zz` — are rejected upstream by Astro 7 before the route runs: `astro dev` answers 500, the built server answers 400. That rejection is outside F6's file set and outside this requirement.)
5. **Given** archived notes carrying the tag, **When** the list loads, **Then** they appear as ordinary rows with their archived badge — archived is a status, not a deletion.
6. **Given** a malformed note file on disk, **When** a per-tag list loads, **Then** the page still renders for every healthy note — one bad file never takes the browse view down.

---

### User Story 3 - Reach tags from anywhere; status browsing keeps working (Priority: P2)

The Gardener reaches `/tags` from any app view through the single site-nav entry — no new key bindings, no per-page header churn. The pre-existing `/status/[state]` views keep serving exactly as F4 shipped them (param-validated, 404 on unknown state, badge + `<time>` rows): AC2's status half is a probe task, not code. Removing a tag from every note drops it from `/tags` on the very next load — no manual reindex, no second hook.

**Why this priority**: AC2's status half and AC3's freshness fall out by construction (D5 reuse + D6 live-read posture) — they observe US1/US2 surfaces, so they land after them. The nav entry makes the whole feature reachable by click and keyboard Tab.

**Independent Test**: from dashboard, note view, `/search`, and a status page, Tab to the nav and activate `Tags`; verify `/tags` loads. Open each `/status/<state>` and `/status/nonsense` and verify F4 behavior unchanged. Remove a tag from every note, reload `/tags`, verify the key is gone.

**Acceptance Scenarios**:

1. **Given** any app view (dashboard, note view, `/search`, status browse), **When** the Gardener tabs to the site nav and activates `Tags`, **Then** the browser lands on `/tags` — zero key handlers involved.
2. **Given** the existing `/status/<state>` routes, **When** each valid state is opened, **Then** F4 behavior is unchanged (exact-state rows newest-first, param-driven heading/empty text); `/status/<unknown>` still 404s.
3. **Given** a tag removed from every note, **When** `/tags` next loads, **Then** the tag key is absent — freshness within one load cycle, no manual step.
4. **Given** keyboard-only operation, **When** the Gardener reaches `/tags` or a per-tag list, **Then** every link (nav entry, tag rows, note rows) is reachable by Tab alone with visible focus — zero bare printable-key bindings introduced.

---

### Edge Cases

- Mixed-case / padded tags (`AI` vs `ai` vs ` ai `) → one canonical lowercase key, merged count, one `/tags` row; per-tag URLs case-fold to the same list.
- Tags with `+`, `/`, `%`, spaces, unicode (`C++`, `a/b`, `50%`, `café`, emoji) → `tagHref` encodes, `decodeTagParam` decodes; round-trip preserves identity; a decodable segment that misses the index degrades to the empty-state, never a 500. Malformed `%` sequences at the HTTP layer (`/tags/%E0%A4%A`, `/tags/50%`, `/tags/%zz`) are rejected upstream by Astro 7 (`astro dev` 500 via `devTrailingSlash` `decodeURI`; built server 400 "Bad request." via the node-standalone guard) before any F6 code runs — explicitly out of scope for the F6 no-500 promise.
- Tag literally named `index` → collides with static `tags/index.astro` (Astro file routing): D3 path wins, recorded limitation — the tag's list is unreachable by URL while the index page owns `/tags/index`.
- Unknown / just-removed tag → 200 empty-state naming the requested tag (open vocabulary), NOT 404 (F4's closed-enum 404 discipline does not apply).
- Empty vault / vault with zero tags → `/tags` 200 empty-state; every `/tags/<tag>` 200 empty-state; no 404 anywhere in the tag path.
- Malformed note file (bad frontmatter/YAML) → skipped by the tolerant per-note read at both tag routes; stays on disk untouched; never 500s either view (`refreshVaultIndex` throws by design and is NOT the page read path).
- Trashed (deleted) notes → absent from both tag views (F1 `listNoteSlugs` ignores dot-directories; index rebuilt from live notes only).
- Archived notes → counted in `/tags`, listed in `/tags/<tag>` with archived badge; no filter, no hiding (D2).
- Tag removed from every note → key vanishes on next load (AC3; `buildTagIndex` drops empty keys by construction; regression-locked in `tags.test.ts`).
- Same-millisecond `updated` ties → `slug` ASC tie-break keeps both lists deterministic across loads.
- Duplicate titles across notes → every matching note is a row (slug identity); rows keyed by slug, never collapsed.
- Bare printable keys → nothing in F6 binds keys at all (D7: zero key handlers); the F2/F3/F5 printable-key sweeps stay green.
- Non-loopback / offline → both tag routes read local vault files only; no fetch, no external request; never `--host`.
- 5,000-note vault (PRD scale) → per-request tolerant read + `buildTagIndex` rebuild is the v1 shape; if a measured run misses the 500 ms view budget, the follow-up is a plan/tasks decision, not speculative caching.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST serve a tag index at `/tags` (`src/pages/tags/index.astro` on the Base layout) listing every canonical tag with its note count, alphabetical (code-unit order on the lowercase key), each linking to `/tags/<tag>` via `tagHref` (D3, AC1).
- **FR-002**: The system MUST serve per-tag lists at `/tags/[tag]` (`src/pages/tags/[tag].astro` on the Base layout) decoding the param via `decodeTagParam`, case-folding against the index, and listing exactly the notes carrying that tag — title (link `/note/<slug>`), status badge (`.badge[data-status]` page-scoped copy), last-updated `<time datetime>` — sorted `updated` DESC + `slug` ASC (D4, AC2-tag-half).
- **FR-003**: Tag selection MUST live in a new pure module `src/lib/tags.ts` (NOT `dashboard.ts`): `getAllTags(tagIndex) → [{tag,count}]` alphabetical on the lowercase key (`count = slugs.length`), `getNotesForTag(notes,tag)` case-folded match sorted `updated` DESC + `slug` ASC; pages MUST NOT `.sort()`/`.filter()` inline — all selection via `tags.ts` (D2).
- **FR-004**: The tag canonical form MUST be the lowercase key (`buildTagIndex` output); display labels, alphabetical order, and URL lookup all use it; `Note` satisfies the `TaggableNote {slug,title,tags?,status,updated}` constraint structurally (D2).
- **FR-005**: An unknown tag MUST return 200 with an empty-state message naming the requested tag; NO 404 branch exists in `/tags/[tag]` (open vocabulary vs F4's closed enum) (D4, US2 scenario 3).
- **FR-006**: Archived notes MUST stay included in `/tags` counts and `/tags/<tag>` rows carrying their status flag; NO archive filter is added in v1 (D2, US1 scenario 4, US2 scenario 5).
- **FR-007**: The URL contract MUST be `tagHref = '/tags/' + encodeURIComponent(tag)` and `decodeTagParam = try decodeURIComponent (URIError → raw) then .toLowerCase()` + index lookup; decoding MUST never throw to a 500 *for any request that reaches the route* (D4, Edge Cases). Malformed escapes at the HTTP layer are rejected upstream by Astro 7 before F6 code runs (`astro dev` 500, built server 400) and are explicitly outside this requirement; F6 MUST add no new 500 of its own.
- **FR-008**: The system MUST gain ONE landmark `<nav id="site-nav" aria-label="Sections">` above `<slot/>` in `src/layouts/Base.astro` carrying `<a href="/tags" id="tags-entry">Tags</a>`; existing anchors (currently none) MUST be preserved; ZERO key handlers are added anywhere in F6; per-page headers stay untouched (D7, US3 scenario 1).
- **FR-009**: Both tag routes MUST read live per request via the TOLERANT per-note pattern (`listNoteSlugs` → per-slug `readNote` in try/catch, skipped when broken — status/search posture); raw `refreshVaultIndex` (throws on first corrupt file) MUST NOT be the page read path; NO second hook and NO server-side tag cache are added (D6, US1 scenario 6, US2 scenario 6).
- **FR-010**: AC3 MUST fall out by construction (per-request rebuild: tag removed everywhere → key absent next load) and MUST be regression-locked in NEW `src/lib/tags.test.ts` (remove-tag-everywhere → next refresh drops key); ZERO edits to `notes.ts`/`notes.test.ts` (D6).
- **FR-011**: All F6 links and rows (nav entry, tag rows, note rows, badges) MUST be reachable by keyboard Tab alone with visible focus and screen-reader labels; ZERO bare printable-key global bindings; all F6 reads MUST run fully offline on loopback with no non-loopback binding and no external network request (PRD §8/§10).
- **FR-012**: Validation MUST remain `npm install` + `npm run test` + `npm run build`, all green in order, with no new runtime or dev dependencies introduced by F6 (D8, `.ainative/project.yaml` already lists all three).

### Key Entities

- **Tag index**: `buildTagIndex` output — lowercase tag → sorted slugs; sorted keys; empty keys dropped; the only tag source F6 consumes (verify-only, zero hunks).
- **Tag list entry**: one per canonical tag — `{tag, count}` from `getAllTags`; `count = slugs.length`; alphabetical on the lowercase key.
- **Tag-note row**: one per note carrying the tag — title link (`/note/<slug>`), status badge (`.badge[data-status]`), `<time datetime>`; `updated` DESC + `slug` ASC.
- **Tag param**: the raw `/tags/[tag]` URL segment; decoded via `decodeTagParam`, case-folded, looked up in the index; miss → empty-state naming the raw request.
- **Site-nav entry**: the single `<a href="/tags" id="tags-entry">Tags</a>` inside the Base landmark nav — the click/Tab entry point to tag browsing from every view.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of vault tags appear as exactly one `/tags` row with the correct count, alphabetical; 100% of rows link to the correct per-tag list (round-trip preserved for special tags); 0 duplicate-casing rows (AC1).
- **SC-002**: 100% of `/tags/<tag>` requests that reach the route (any casing, valid encodings) list exactly the notes carrying that tag with title link + badge + `<time>`, newest-first; 100% of unknown/removed tags show the named 200 empty-state; 0 tag-path 404s, 0 tag-path 500s from F6 code (AC2-tag-half). Malformed-`%` URLs never reach the route (Astro 7 upstream rejection: dev 500 / built 400) and are excluded from this measure.
- **SC-003**: 100% of `/status/<state>` probes match F4 behavior (exact-state rows newest-first, param-driven copy, unknown → 404); 0 regressions from F6's Base insertion (AC2-status-half).
- **SC-004**: Removing a tag from every note drops it from `/tags` on the very next load in 100% of trials; 0 manual reindex steps; 0 malformed-file page 500s across both tag routes (AC3).
- **SC-005**: Every F6 link/row is keyboard-Tab-reachable with visible focus in 100% of trials; 0 new key bindings of any kind; 0 non-loopback network calls in the tag path (PRD §8/§10).
- **SC-006**: `npm install` + `npm run test` + `npm run build` all green in order with zero new dependencies; `src/lib/notes.ts` diff is empty (D1/D6 verify-only).
- **SC-007**: Both tag views render and are interactive in under 500 ms locally on the seeded vault (PRD §8 view budget applied to the new surfaces).

## Assumptions

- **Live per-request rebuild**: both tag routes rebuild the tag index on every request from the tolerant read (status/search posture) — no cache, no hook, no background job (D6); AC3 is structural, not scheduled.
- **Lowercase canonical everywhere**: display, ordering, and lookup use the `buildTagIndex` lowercase key; original author casing is not preserved anywhere in F6 (D2).
- **Open-vocabulary 200, closed-vocabulary 404**: unknown tags are 200 empty-states; unknown states stay F4 404s — the two disciplines coexist deliberately (D4/D5).
- **v1 serves all on localhost**: `visibility` is carried on notes but filters nothing in tag browsing (F7/F10 own public semantics); archived-included is the v1 answer to PRD §13's tag-listing half.
- **No pagination in v1**: both lists render every entry uncapped (single user, ≤ 5,000-note scale); SC-007 measures the budget and any follow-up is recorded, not built speculatively.
- **Page-scoped badge copy**: `.badge[data-status]` styles are duplicated per tag page (status-page precedent) — no `global.css` change, no third badge idiom (D7).
- **`index`-named tag limitation**: a tag literally named `index` is shadowed by the static `tags/index.astro` route — accepted and recorded (D3/D4).
- **No commits from this chain**: spec/plan/tasks artifacts only; the build card owns implementation; ship parks at the parent (D8).

## Spec Findings (gaps recorded per card directive — closed here or queued, not re-opened)

1. **`buildTagIndex` already emits exactly what D2 needs** (`notes.ts:942-956`: trim + lowercase keys, `Set` per key, sorted keys, sorted slugs, empty keys dropped) — D2 verify + consume, never re-plumb; `refreshVaultIndex` throws on the first corrupt file (`notes.ts:982-998` + `readNoteWithSnapshot` path), so D3/D6's tolerant page read must follow the dashboard/status/search pattern, not the index helper.
2. **`normalizeTags` dedupes case-insensitively within a note** (`notes.ts:375-385`: trim, `toLowerCase` seen-set, original-casing output) while `buildTagIndex` lowercases across notes — the two compose into the D2 canonical key without new code.
3. **No `/tags` route exists** (probed `src/pages/`: `api/`, `index.astro`, `new.astro`, `note/`, `search.astro`, `status/` only) — D3/D4 create exactly two files, `src/pages/tags/index.astro` + `src/pages/tags/[tag].astro`.
4. **`Base.astro` has no nav chrome** (verified 19-line shell: `<main><slot/></main>`, zero anchors, zero scripts) — D7's one-landmark insertion is purely additive; F5 landed with NO Base change (Ctrl-K per-page wiring only).
5. **The tolerant read is proven three times** (`index.astro:26-35`, `status/[state].astro` try/catch, `search.astro` embed path): per-slug `readNote` in try/catch, skip broken — both F6 pages copy it verbatim.
6. **The pure-selector + param-copy discipline is proven twice** (`dashboard.ts` `selectRecentNotes`/`selectSeedsNeedingAttention`, `status-list.ts` `selectByStatus` + `statusHeading`/`statusEmptyText`): DOM-free, fs-free, vitest-covered — `tags.ts` follows it exactly (D2's NOT-dashboard.ts placement keeps F2/F4 ownership clean).
7. **Prior-attempt D5/D7 findings are stale**: `/status/[state]` + `status-list.ts` have since landed (verified on this checkout) and F5 added per-page Ctrl-K wiring — the archived attempt's "missing status surface" and "Base owns shortcut" notes no longer apply.
8. **Baseline gate to be measured in planning**: `npm install` + `npm run test` + `npm run build` state on THIS worktree @ 4cb3077; any pre-existing failure is recorded in the plan so the tasks gate cannot mistake it for an F6 regression.

## Locked Constraints (Orchestrator Decisions D1–D8 — final, not open questions)

These decisions were made by the orchestrator (parent card t_8e4e7e60) and bind the plan/tasks/implementation steps.

- **D1**: Consume F4/F5 pieces, don't rebuild. No new persistence layer, no commits/push/PR (ship parks for operator). Reuse `buildTagIndex` + `refreshVaultIndex` shapes as-is (zero hunks in notes.ts); reuse F4 `/status/[state]` route as-is; reuse F4 row/badge/404/ordering pattern for F6 rows; reuse F5 tolerant-read posture.
- **D2**: Tag model: consume `buildTagIndex` + `refreshVaultIndex` as-is (verify-only). New pure selector module `src/lib/tags.ts` (NOT `dashboard.ts` — owned by F2/F4): `getAllTags(tagIndex)` → `[{tag,count}]` alphabetical code-unit order on lowercase key (matches index `.sort()`; `count=slugs.length`); `getNotesForTag(notes,tag)` case-folded match, sorted updated DESC + slug ASC tiebreak. Display label = lowercase canonical key. Archived notes stay INCLUDED with status flag (notes.ts header + F5 D5 precedent). Constraint: `TaggableNote {slug,title,tags?,status,updated}` — Note satisfies structurally.
- **D3**: `/tags` route: new `src/pages/tags/index.astro` lists every tag with counts, alphabetical, each linking `/tags/<tag>` via `tagHref`; empty vault → 200 empty-state message (never 404). No `.sort()`/`.filter()` in page — all selection via `tags.ts`. Tolerant per-note read (`listNoteSlugs` + `readNote` try/catch, like status/search — NEVER raw `refreshVaultIndex` which throws).
- **D4**: `/tags/[tag]`: new `src/pages/tags/[tag].astro`; param decoded via `decodeTagParam` then case-folded against index; unknown tag → 200 empty-state, NOT 404 (open vocabulary vs F4 closed enum which 404s). Rows: title (link `/note/<slug>`) + status badge + updated `<time>`, `updated`-DESC + `slug`-ASC. No 404 branch in this file. URL contract: `tagHref='/tags/'+encodeURIComponent(tag)`; `decodeTagParam=try decodeURIComponent (URIError→raw) then .toLowerCase()` + lookup (handles C++, a/b, 50%, unicode; malformed→miss→empty state, never 500, for requests reaching the route — malformed escapes at the HTTP layer are rejected upstream by Astro 7, spec FR-007 as amended 2026-10-25). Tag literally named 'index' collides with static `tags/index.astro` — recorded limitation, D3 path wins.
- **D5**: `/status/[state]` is F4-OWNED: REUSE, do not rebuild. Now landed (`status/[state].astro` + `status-list.ts` verified). Never create/edit `src/pages/status/*` nor `status-list.ts`. AC2 status half = probe existing route (T-task), not code.
- **D6**: Refresh wiring: NO second hook, NO server-side tag cache. Pages read live per request (tolerant read + `buildTagIndex` rebuild each request, status/search posture). AC3 falls out by construction + regression test in NEW `src/lib/tags.test.ts`: remove tag from every note → next refresh drops key. Zero edits to `notes.ts`/`notes.test.ts`.
- **D7**: Navigation: `Base.astro` gains ONE landmark `<nav id="site-nav" aria-label="Sections">` above `<slot/>` carrying `<a href="/tags" id="tags-entry">Tags</a>`; preserve any existing anchors (currently none); zero key handlers; per-page headers untouched. Badge reuse: `.badge[data-status]` page-scoped copy, no `global.css` change, no third idiom. `/tags` + per-tag rows link `/note/<slug>`.
- **D8**: Gate: `npm install` + `npm run test` + `npm run build` green in order (`.ainative/project.yaml`). Loopback only, offline/no endpoints, zero writes outside vault.

## Dependencies & Out of Scope

**Depends on (exists today — verified on this checkout)**:

- F1 `src/lib/notes.ts`: `buildTagIndex` (:942-956), `refreshVaultIndex` (:982-998), `normalizeTags` (:375-385), `SearchDoc`/`buildSearchDocs` (:180-188/:964-977), `listNoteSlugs`/`readNote`, `NOTE_STATUSES` — covered by `src/lib/notes.test.ts`.
- F2 `src/lib/dashboard.ts` (ordering discipline reference ONLY — never extended) + `src/pages/index.astro` (dashboard table pattern: tolerant read :26-35, `.badge[data-status]`, `<time datetime>`, linked rows/badges) + `src/lib/vault.ts` `resolveVaultDir()`.
- F3 `src/pages/note/[slug].astro` (read-only row-link target `/note/<slug>`, badge idiom source).
- F4 `src/lib/status-list.ts` (`selectByStatus` exact-match + updated-DESC/slug-ASC + `statusHeading`/`statusEmptyText` param-driven copy — the reuse pattern) + `src/pages/status/[state].astro` (tolerant read + friendly-404 + badge + `<time>` rows — the page shape F6 copies).
- F5 `src/pages/search.astro` (tolerant read + freshness posture precedent: live per-request rebuild, no cache, no second hook).
- Packages: `vitest` (`npm run test` → `vitest run`); gate `npm install` + `npm run test` + `npm run build` (`.ainative/project.yaml` already lists all three).
- PRD: §7 F6 AC1–AC3, §4 Journey 4, §6 `/tags` + `/tags/[tag]` + `/status/[state]` app map, §8 perf (<500 ms views / 5,000-note scale) + loopback/offline/zero-data-loss, §10 keyboard-first + scoped keys + labels, §13 archived-in-listings question (closed for tags by D2).

**Out of scope for F6** (owned by other features):

- Status-browse rebuild, status counts, `/status` index page (F4 owns `/status/*` — D5 reuses, never edits); full-text search ranking/snippets/filters (F5 — D1 consumes posture only); commit-on-save/settings/push (F9); side-by-side editor, autosave, themes, bulk tag actions, tag rename/merge (F8/F19 candidates); publishing and public visibility semantics, public tag pages (F7/F10 — `visibility` carried now, filtered there); orphan report (F12); visual graph (F11); RSS/attachments (F14–F19); server-side search/tag API; tag analytics/logging (local tool — no telemetry per PRD §9); multi-filter/faceted browsing beyond one-tag lists; a command palette or tag overlay.
