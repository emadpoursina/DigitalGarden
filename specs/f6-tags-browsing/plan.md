# Implementation Plan: F6 Tags & Browsing

**Branch**: `digitalgarden/t_8e4e7e60-f6-tags-browsing` (spec card t_4b8f1860, parent t_8e4e7e60) | **Date**: 2026-10-25 | **Spec**: [specs/f6-tags-browsing/spec.md](./spec.md)

**Input**: Feature specification `specs/f6-tags-browsing/spec.md` (clarified 2026-10-25, 5/5 headless questions resolved) + locked orchestrator decisions D1–D8 (parent card t_8e4e7e60).

**Step**: `/speckit.plan` (Phase 5/6). Deliverable is this plan — implementation and task breakdown land in `tasks.md`; no code in this step.

> **Artifact consolidation**: the card fixes the F6 artifact set at `specs/f6-tags-browsing/{spec,plan,tasks}.md` (F4/F5 parity), so the template's separate `research.md`, `data-model.md`, `contracts/`, and `quickstart.md` outputs are consolidated into this single file: "Research (Phase 0)" below, "Data Model" and "Interface Contracts" (Phase 1), "Validation & Quickstart" (Phase 1).
> **Extension hooks**: `.specify/extensions.yml` does not exist → `before_plan` / `after_plan` hook stages skipped silently (both pre-check and mandatory post-check performed).

---

## Summary

F6 makes the vault browsable by tag: a new pure module `src/lib/tags.ts` owns the tag selection (`getAllTags` over the `buildTagIndex` output, `getNotesForTag` case-folded match newest-first, `tagHref`/`decodeTagParam` URL contract); two new server-rendered routes `src/pages/tags/index.astro` (`/tags`: every canonical tag + count, alphabetical, tolerant read, 200 empty-state) and `src/pages/tags/[tag].astro` (`/tags/[tag]`: decoded + case-folded lookup, exact-member rows with title link + badge + `<time>`, unknown → 200 empty-state naming the tag, never 404); one landmark `<nav id="site-nav">` with `<a href="/tags" id="tags-entry">Tags</a>` above `<slot/>` in `Base.astro` (zero key handlers, existing anchors preserved); page-scoped `.badge[data-status]` copies (no `global.css` change); AC3 (tag dropped everywhere → gone next load) falls out of the live per-request rebuild posture (status/search precedent) and is regression-locked in `src/lib/tags.test.ts`. `/status/[state]` is F4-OWNED reuse (probe task, never code).

Six facts verified against THIS checkout today drive the design, none assumed:

1. **`buildTagIndex` already emits exactly what D2 needs.** `notes.ts:942-956`: trim + lowercase keys, `Set` per key, sorted keys (`.sort()` code-unit order), sorted slugs, empty keys skipped. `normalizeTags` (`:375-385`) dedupes case-insensitively within a note. D2 verify + consume — expect **zero hunks in `src/lib/notes.ts`**.
2. **`refreshVaultIndex` throws on the first corrupt file by design** (`notes.ts:982-998` + `readNoteWithSnapshot` path). Both F6 pages therefore copy the tolerant pattern verbatim (`index.astro:26-35`, `status/[state].astro` try/catch, `search.astro` embed path): `listNoteSlugs` → per-slug `readNote` in try/catch, skip broken. It is deliberately NOT the page read path (spec Finding 1).
3. **No `/tags` route exists.** Probed `src/pages/`: `api/`, `index.astro`, `new.astro`, `note/`, `search.astro`, `status/` only — D3/D4 create exactly `src/pages/tags/index.astro` + `src/pages/tags/[tag].astro`.
4. **`Base.astro` has no nav chrome.** Verified 19-line shell (`<main><slot/></main>`, zero anchors, zero scripts) — D7's one-landmark insertion is purely additive. F5 landed with NO Base change (Ctrl-K per-page wiring only).
5. **The pure-selector + param-copy discipline is proven twice.** `dashboard.ts` (`selectRecentNotes`/`selectSeedsNeedingAttention`) + `status-list.ts` (`selectByStatus` exact-match + updated-DESC/slug-ASC + `statusHeading`/`statusEmptyText`) — DOM-free, fs-free, vitest-covered. `tags.ts` follows it exactly; D2's NOT-`dashboard.ts` placement keeps F2/F4 ownership clean.
6. **The gate baseline is green-minus-one-known.** `npm install` exit 0 (audit noise only), `npm run test` 12 files / 246 of 247 green (the 1 failure is the pre-existing `note.test.ts` unwritable-vault 500-vs-200 case — suite runs as root so chmod never bites, unrelated to F6, recorded in spec Finding 8), `npm run build` exit 0 (measured this session 2026-10-25).

## Technical Context

**Language/Version**: TypeScript on Node.js ≥ 20 (repo runs Node 26.x); `astro check` not wired — `npm run build` catches syntax/import errors, types are advisory (F2/F3/F4/F5 precedent; `npx tsc --noEmit` stays available as a voluntary gate).

**Primary Dependencies**: `astro ^7.3.8`, `@astrojs/node ^11.1.8`, `markdown-it ^15.0.2` (untouched), `simple-git ^4.0.2` (untouched — F6 never commits), `minisearch ^7.2.0` (untouched — F6 does not search), `vitest ^5`, `@playwright/test ^1.64.1` (verification only, no config/spec files added). **Added by this plan: nothing** — zero runtime and zero dev-dependency changes (locked into tasks' Done-when).

**Storage**: plain Markdown + YAML frontmatter via F1 `src/lib/notes.ts` — tag browsing reads existing files; no new persisted state, no schema migration, no new files in the vault.

**Testing**: `npm run test` → `vitest run` (node env, `*.test.ts` only); `npm run build` → `astro build`. Browser-only facts are covered by one-off scripted checks against `astro dev` (temp vault) using the installed Chromium — no `*.spec.ts`, no `playwright.config.ts`, therefore no vitest include-collision (F2/F3/F4/F5's R8 lesson kept).

**Target Platform**: local-first web app, loopback only (`astro dev`/`astro preview` default to localhost; never `server.host: true`, never `--host`).

**Performance Goals**: both tag views render + interactive < 500 ms locally (PRD §8 view budget applied to the new surfaces, spec SC-007); `/tags` alphabetical contract holds to 5,000-note scale.

**Constraints**: offline / zero non-loopback access (FR-011); zero data loss — tag browsing writes nothing to the vault, malformed files are skipped, never mutated (SC-004); no git commits from tag browsing (FR-010/D8); `npm install` + `npm run test` + `npm run build` must stay green (FR-012); `notes.ts`/`dashboard.ts`/`status-list.ts`/`status/*`/`search.*`/`index.astro`/`note/[slug].astro`/`api/*`/`global.css`/`package.json`/lockfile/`project.yaml` read-only (D1/D5/D7/D8).

**Scale/Scope**: single-user, ≤ 5,000 notes (PRD §8); per-request tolerant read + `buildTagIndex` rebuild is the v1 shape (see Research R7 for the scaling note).

**No NEEDS CLARIFICATION items remain** — all 5 spec clarifications are resolved in `spec.md`; the implementation-level questions they deferred (exact `tags.ts` export surface, the URL-codec edge matrix, the per-page read/selection split, the README shape) are decided in this plan.

## Constitution Check

*GATE: `.specify/memory/constitution.md` is still the unfilled `[PROJECT_NAME]` template — it defines **no gates**, so no constitution gate can pass or fail (same finding as F2's/F3's/F4's/F5's plans; re-checked this session). Complexity Tracking is therefore empty of violations (see bottom).*

In place of constitution gates, the plan is checked against the binding PRD §8 non-functional requirements:

| PRD §8 requirement | How this plan satisfies it | Re-check after design |
|---|---|---|
| List views < 500 ms (local) | Both tag routes = one tolerant read pass + `buildTagIndex` rebuild + pure selection (dashboard/status-proven shape); SC-007 measures on the seeded vault | ✓ |
| Data loss: zero tolerance | Tag browsing writes nothing to the vault; malformed files are skipped, never mutated; no save path touched | ✓ |
| Network exposure: loopback only | No config change; no fetch in the tag path (reads are server-side vault files); never `--host` | ✓ |
| Vault format: plain Markdown + YAML | Unchanged — F1 serialization only; F6 adds no frontmatter keys | ✓ |
| Offline / no network service | No outbound calls anywhere in the tag path; all tag decisions are local pure functions | ✓ |
| Accessibility: keyboard-only | Nav entry + tag rows + note rows are native links (inherently Tab-reachable); landmark `<nav aria-label>` + labels; zero key handlers of any kind | ✓ |
| Scalability: 5,000 notes | Per-request rebuild is the v1 shape; R7 records the trigger point and follow-up instead of building caching speculatively | ✓ |

## Project Structure

### Documentation (this feature)

```text
specs/f6-tags-browsing/
├── spec.md                   # clarified spec (input, unchanged by this step)
├── plan.md                   # THIS FILE (/speckit.plan output; research/data-model/contracts/quickstart consolidated)
├── checklists/requirements.md # 16/16 (specify/clarify steps; untouched here)
└── tasks.md                  # Phase 2 output (/speckit.tasks — NOT created by this step)
```

### Source Code (repository root) — proposed end state

```text
src/
├── lib/
│   ├── notes.ts                # UNCHANGED — ZERO hunks (D1/D6: buildTagIndex/refreshVaultIndex verify-only)
│   ├── notes.test.ts           # UNCHANGED — zero edits (D6)
│   ├── vault.ts                # UNCHANGED — read-only (resolveVaultDir)
│   ├── dashboard.ts            # UNCHANGED — read-only (ordering discipline reference ONLY)
│   ├── status-list.ts          # UNCHANGED — read-only (F4 reuse pattern reference)
│   ├── search.ts               # UNCHANGED — read-only (freshness posture reference)
│   ├── search-shortcut.ts      # UNCHANGED — read-only
│   ├── tags.ts                 # NEW — F6 OWNS (pure: getAllTags, getNotesForTag, tagHref, decodeTagParam)
│   ├── tags.test.ts            # NEW — vitest for tags.ts (DOM-free, no browser)
│   ├── wikilink-client.ts      # UNCHANGED — read-only
│   └── capture-client.ts       # UNCHANGED — read-only
├── pages/
│   ├── tags/
│   │   ├── index.astro         # NEW — F6 OWNS (/tags: tolerant read + getAllTags + tagHref rows + empty state)
│   │   └── [tag].astro        # NEW — F6 OWNS (/tags/[tag]: decode + case-fold + getNotesForTag + empty state, NO 404)
│   ├── status/[state].astro    # UNCHANGED — F4-OWNED (probe only, D5)
│   ├── search.astro            # UNCHANGED — read-only (posture reference)
│   ├── index.astro             # UNCHANGED — read-only (dashboard table pattern reference)
│   ├── new.astro               # UNCHANGED — read-only
│   └── note/[slug].astro       # UNCHANGED — read-only (row-link target, badge idiom source)
├── layouts/
│   └── Base.astro              # ADDITIVE — ONE landmark nav + Tags anchor above <slot/> (D7)
└── styles/
    └── global.css              # UNCHANGED — read-only (D7; page-scoped badge copies only)
```

**Structure Decision**: single-project web app — one new pure lib module beside the existing decision modules, two new pages under a new `tags/` route dir, one minimal additive insertion in the layout. No new directories beyond `tags/`, no new endpoints, no new dependencies.

---

## Research (Phase 0)

### R1 — `tags.ts` export surface (D2 implementation)

*Decision*: `src/lib/tags.ts` exports `TaggableNote { slug, title, tags?, status, updated }` (structural — `Note` satisfies it), `TagEntry { tag, count }`, `getAllTags(tagIndex: Record<string,string[]>): TagEntry[]` (entries `[{tag: key, count: slugs.length}]` in `Object.keys(index)` order — already code-unit-sorted by `buildTagIndex`'s `.sort()`; the function MUST NOT re-sort, only project), `getNotesForTag(notes: readonly T[], tag: string): T[]` (case-fold input via `.toLowerCase()` once, match `note.tags ?? []` case-folded, sort `updated` DESC string-compare + `slug` ASC tie-break, input never mutated), `tagHref(tag: string): string` (`'/tags/' + encodeURIComponent(tag)`), `decodeTagParam(param: string): string` (`try decodeURIComponent(param) catch URIError → param`, then `.toLowerCase()`).

*Rationale*: D2 pins every signature behavior; projecting without re-sorting keeps the single-sort authority in `buildTagIndex` (two sorts could diverge on locale vs code-unit). Case-folding once at the boundary (not per-note per-key) keeps `getNotesForTag` O(n·m) with minimal garbage. `TaggableNote.tags?` optional mirrors `buildTagIndex`'s `NoteFields` (`note.tags ?? []`).

*Alternatives considered*: re-sorting inside `getAllTags` — rejected: duplicate sort authority risks locale/code-unit divergence from the index. Returning slugs instead of notes from `getNotesForTag` — rejected: pages would need a second lookup; returning the notes keeps the page a pure render over one call.

### R2 — Page read/selection split (D3/D4/D6 implementation)

*Decision*: both pages copy the tolerant pattern verbatim: `listNoteSlugs(vaultDir)` → per-slug `readNote` in try/catch → `notes: Note[]` → `buildTagIndex(notes)` (fresh per request) → pure `tags.ts` selection (`getAllTags` on `/tags`; `decodeTagParam(Astro.params.tag)` + `getNotesForTag` on `/tags/[tag]`). NO `.sort()`/`.filter()` inline in either page — the only page-level transforms are `.map()` to row display shapes. No 404 branch in `[tag].astro`; unknown/empty → the named empty-state paragraph.

*Rationale*: D3/D6 pin "no `.sort()`/`.filter()` in page — all selection via `tags.ts`" so the ordering/matching discipline stays unit-tested without a browser. The per-request rebuild is the status/search posture that makes AC3 structural.

*Alternatives considered*: `refreshVaultIndex` as the page read — rejected: throws on first corrupt file (Finding 1), would 500 the view. A shared server helper for the tolerant read — rejected: two call sites copying 8 lines keeps F6 dependency-free; a helper would be a third-owned module for no test gain.

### R3 — URL codec edge matrix (D4 implementation)

*Decision*: `tagHref` uses `encodeURIComponent` (encodes `+`→`%2B`, `/`→`%2F`, `%`→`%25`, space→`%20`, unicode→UTF-8 `%XX`); `decodeTagParam` wraps `decodeURIComponent` in try/catch (`URIError` → raw input), then `.toLowerCase()`. Lookup is exact-equality against the lowercase index keys. Matrix: `C++`→`/tags/C%2B%2B`→`c++` hit; `a/b`→`/tags/a%2Fb`→`a/b` hit (Astro params arrive `decodeURI`d: `c%2B%2B` and `a%2Fb` stay percent-encoded, and `decodeTagParam` finishes the job); `50%`→`/tags/50%25`→`50%` hit; `café`→`/tags/caf%C3%A9`→`café` hit; `%E0%A4%A` (malformed) → raw → lowercase → miss → empty-state, never throw — **at the unit level, for requests that reach the route**. Malformed escapes at the HTTP layer never reach the route: Astro 7 rejects them upstream (`astro dev` 500, built server 400) before any F6 code runs — spec FR-007 as amended 2026-10-25; the unit no-throw property is necessary but not sufficient end-to-end, and the end-to-end gap is the framework's, not F6's.

*Rationale*: D4 pins the exact contract; `encodeURIComponent` (not `encodeURI`) is required because tag text lives in ONE path segment (`encodeURI` leaves `/` unencoded, which would split the route). The `URIError` catch is the only try/catch in `tags.ts` and the reason decoding can never 500.

*Alternatives considered*: decoding in the page instead of `tags.ts` — rejected: the codec is unit-testable DOM-free logic and belongs with the other pure tag decisions. Case-preserving lookup with folded fallback — rejected: D2 canonical is lowercase everywhere; two lookup paths double the miss semantics.

### R4 — Row/badge/empty-state copy (D4/D7 implementation)

*Decision*: `/tags` rows: tag link (`tagHref`) + `<span class="count">` (e.g. `3 notes` / `1 note`); heading `Tags`; empty `No tags yet — add a tag to a note to grow this index.` Per-tag rows copy the F4 table shape: Title (link `/note/<slug>`) + Status (`.badge[data-status]` page-scoped copy of the status-page CSS, four-value colors) + Updated (`<time datetime>`); heading `Notes tagged “<raw>”` (raw param escaped, NOT the folded key — the user sees what they asked); empty `No notes tagged “<raw>” yet.` Both pages: `<header>` with Dashboard link (status-page precedent), page-scoped `<style>` only.

*Rationale*: D4 pins "reuse F4 row/badge pattern"; D7 pins "`.badge[data-status]` page-scoped copy, no `global.css` change, no third idiom". Showing the RAW tag in heading/empty copy (not the folded key) keeps the open-vocabulary promise honest (`/tags/AI` says `AI`, lists the `ai` members).

*Alternatives considered*: showing the folded key in the heading — rejected: user typed `AI`, page answering `ai` reads as a correction. A shared badge stylesheet import — rejected: D7 forbids `global.css` churn; the status-page precedent is per-page `<style>`.

### R5 — Base insertion shape (D7 implementation)

*Decision*: in `Base.astro`, directly above `<slot/>`: `<nav id="site-nav" aria-label="Sections"><a href="/tags" id="tags-entry">Tags</a></nav>` — no wrapper div, no script, no style block in Base (pages already set their own widths; nav inherits). Preserve any existing anchors by appending (currently none — verified). No `aria-current` (static layout has no route knowledge in v1).

*Rationale*: D7 pins the exact landmark + ids; placing it in Base (not per-page headers) gives every view the same entry point with one hunk, and `id="tags-entry"` gives the browser checklist a stable hook. Zero key handlers keeps the F2/F3/F5 printable-key sweeps green by construction.

*Alternatives considered*: per-page header links — rejected: four owners, four chances to drift; Base owns chrome. A fuller nav (Home/Search/Status) — rejected: D7 pins exactly one anchor; F6 does not redesign navigation.

### R6 — AC3 regression shape (D6 implementation)

*Decision*: `tags.test.ts` case: build notes with tag `garden` on two notes → `buildTagIndex` has `garden`; remove `garden` from every note → rebuilt index lacks the key; `getAllTags` result has no `garden` entry. Plus: `getAllTags` alphabetical + counts; `getNotesForTag` case-fold + DESC + tie-break + mutation-free; `tagHref`/`decodeTagParam` round-trips incl. malformed → no-throw miss.

*Rationale*: D6 pins "regression test in NEW `tags.test.ts`: remove tag from every note → next refresh drops key". Testing through the real `buildTagIndex` (not a mock index) proves the construction path, not just the projection.

*Alternatives considered*: asserting AC3 via a browser reload test only — rejected: unit-level proof runs in `npm run test` (the gate); the browser checklist confirms it live as well (belt + suspenders, plan Validation step 3).

### R7 — Scale note (5,000 notes; plan-level, not built)

Per-request tolerant read + `buildTagIndex` rebuild is the v1 shape (dashboard/status/search precedent). If the SC-007 measurement (seeded vault timing in Validation step 3) shows headroom, 5,000 notes need no work. If `/tags` load or index-build time grows superlinearly, the recorded follow-up is: memoize `buildTagIndex` per request (already once per page) or paginate `/tags` alphabetically — NOT built now. The trigger is a measured miss, never speculation (same pattern as F3/F4/F5 scale notes).

### R8 — Verification posture (F2/F3/F4/F5 precedent, re-checked)

`npm install` + `npm run test` (vitest, `*.test.ts`) + `npm run build` stay the gate (FR-012). Browser-only facts (nav entry reachability, row links, per-tag casing/encoding matrix, `/status/*` unchanged, AC3 live drop, 500 ms timings, loopback check) are covered by one-off scripted checks against `astro dev` on a hermetic temp vault (`GARDEN_VAULT_DIR=$(mktemp -d)`, seeded generator, `git init` + seed commit where the save path is exercised), launching Chromium at `/opt/hermes/tools/chromium-1208/chrome-linux/chrome` (F4's re-checked host fact — verify presence at build time, record if moved). No `*.spec.ts`, no `playwright.config.ts`, no repo files from scripts (run from the scratch dir).

---

## Data Model

No new persisted entities. F6 consumes the existing `buildTagIndex` output unchanged:

```text
TagIndex = Record<lowercase-tag, sorted slug[]>
TagEntry { tag: string (lowercase canonical), count: number (= slugs.length) }
TagRow   { slug, title, status, updated }  (per-tag list row; links /note/<slug>)
```

Derived runtime shapes (in-memory only, owned by `tags.ts`):

```text
TaggableNote { slug, title, tags?, status, updated }  (Note satisfies structurally)
```

Validation rules: canonical key is `tag.trim().toLowerCase()` non-empty (index construction); page lookup is exact-equality on the folded key; `archived` included identically (no filter); `visibility` carried on notes, never filtered in v1 (D2).

## Interface Contracts

### §1 — `tags.ts` export surface (THE F6 contract; tasks implement verbatim)

```text
TaggableNote { slug: string; title: string; tags?: string[]; status: string; updated: string }
TagEntry { tag: string; count: number }
getAllTags(tagIndex: Record<string, string[]>): TagEntry[]
  // [{tag: key, count: slugs.length}] in Object.keys order (index pre-sorted); no re-sort; no mutation
getNotesForTag<T extends TaggableNote>(notes: readonly T[], tag: string): T[]
  // case-fold tag once; match (note.tags ?? []) case-folded; sort updated DESC + slug ASC; input never mutated
tagHref(tag: string): string
  // '/tags/' + encodeURIComponent(tag)
decodeTagParam(param: string): string
  // try decodeURIComponent(param) catch URIError → param; then .toLowerCase()
```

### §2 — `/tags` page contract (tasks implement verbatim)

```text
Route: src/pages/tags/index.astro → GET /tags → 200 always (never 404)
Read: tolerant per-note (listNoteSlugs → readNote try/catch, skip broken) + buildTagIndex(notes) + getAllTags
Markup: <h1>Tags</h1>; rows = <a href={tagHref(tag)}>tag</a> + count text; empty → <p class="empty">No tags yet — …</p>
Copy: heading 'Tags'; empty 'No tags yet — add a tag to a note to grow this index.'
Styles: page-scoped <style> only; header + table reuse index/status page discipline
```

### §3 — `/tags/[tag]` page contract (tasks implement verbatim)

```text
Route: src/pages/tags/[tag].astro → GET /tags/:tag → 200 always (NO 404 branch in this file)
Param: raw = Astro.params.tag ?? ''; key = decodeTagParam(raw); rows = getNotesForTag(notes, key)
Read: same tolerant read + buildTagIndex(notes) (index documents membership; selection is case-folded note scan)
Rows: title <a href=/note/<slug>> + <span class="badge" data-status> + <time datetime>; updated DESC + slug ASC
Copy: heading 'Notes tagged “<raw>”' (raw, escaped); empty 'No notes tagged “<raw>” yet.'
```

### §4 — Base insertion contract (tasks implement verbatim)

```text
File: src/layouts/Base.astro — insert directly above <slot/>:
  <nav id="site-nav" aria-label="Sections"><a href="/tags" id="tags-entry">Tags</a></nav>
Preserve existing anchors (none today); zero <script>; zero <style> in Base.
```

## File-by-file changes

| File | A/M | What changes | Done when |
|---|---|---|---|
| `src/lib/tags.ts` | A | pure selectors + URL codec per contract §1 (R1/R3) | `tags.test.ts` green; `npm run build` green |
| `src/lib/tags.test.ts` | A | AC3 regression + selection/codec suites per R6 | suite green incl. remove-everywhere → key dropped |
| `src/pages/tags/index.astro` | A | tolerant read + `getAllTags` + `tagHref` rows + empty state (§2) | build green; served `/tags` matches US1 |
| `src/pages/tags/[tag].astro` | A | decode + case-fold + `getNotesForTag` rows + empty state, NO 404 (§3) | build green; casing/encoding matrix matches US2 |
| `src/layouts/Base.astro` | M | ONE landmark nav insertion above `<slot/>` (§4) | build green; every view carries `#tags-entry`; prior shell bytes otherwise identical |
| `README.md` | M | tag index + per-tag lists + nav entry + AC3 note + `index`-tag limitation | docs match shipped behavior; build still green |
| `src/lib/notes.ts` (+test), `dashboard.ts`, `status-list.ts`, `status/[state].astro`, `search.ts` (+test), `search-shortcut.ts` (+test), `search.astro`, `index.astro`, `note/[slug].astro`, `api/*`, `global.css`, `package.json`/lockfile, `.ainative/project.yaml` | — | **unchanged** | `git status` + `git diff --stat` show them untouched; `notes.ts` diff empty |

## AC verification matrix (the parent card's 3 acceptance criteria)

| # | Acceptance criterion | Automated evidence (`npm run test`) | Live evidence (quickstart) |
|---|---|---|---|
| **AC1** | `/tags` lists all tags with counts, alphabetical | `tags.test.ts`: `getAllTags` alphabetical + counts + no-duplicate-casing over a real `buildTagIndex` | Seeded vault → `/tags` shows one row per canonical tag, counts correct, alphabetical, every row links via `tagHref` |
| **AC2** | `/tags/[tag]` + `/status/[state]` list title + badge + updated | `tags.test.ts`: `getNotesForTag` exact-membership + DESC + tie-break; status half = probe task (no new tests — F4 suite is the net) | Per-tag casing/encoding matrix + unknown-tag empty-state; each `/status/<state>` + `/status/nonsense`→404 unchanged |
| **AC3** | Tag removed everywhere drops from index next refresh | `tags.test.ts`: remove-tag-everywhere → rebuilt index lacks key (through real `buildTagIndex`) | Remove tag from every note → reload `/tags` → key gone; malformed file still skipped, never 500 |

Supporting SCs: **SC-005/006** = `tags.test.ts` codec/mutation suites + full `npm run test` (zero-hunk proofs) + live keyboard/loopback sweep; **SC-007** = live 500 ms timings on the seeded vault.

## Validation & Quickstart (Phase 1 run guide)

Prerequisites: Node ≥ 20, no network after install, `GARDEN_VAULT_DIR` for hermetic runs. Run from the build worktree (`/opt/data/mnt/workspace/digitalGarden/.worktrees/t_8e4e7e60` — shared worktree per the card; `node_modules/` is already installed from this session's baseline run).

```bash
npm install                 # no-op expected: zero dependency changes
npm run test                # expect: all suites green except the 1 pre-existing note.test.ts unwritable-vault case (root artifact, unchanged-or-fixed never worsened)
npm run build               # expect: exit 0
```

Browser checklist (scripted, `executablePath: '/opt/hermes/tools/chromium-1208/chrome-linux/chrome'`, R8; run from the scratch dir — no files added to the repo):

1. Fixture vault (mixed-case tags, `C++`/`a/b`/`50%`/unicode, archived-tagged notes, untagged note, >ties on `updated`, one malformed file) → `/tags`: one row per canonical tag, counts correct, alphabetical; every row links and round-trips.
2. `/tags/<tag>` in three casings → identical newest-first rows (title link + badge + `<time>`); unknown tag → 200 empty-state naming it; any *decodable* segment that misses the index → 200 empty-state; malformed `%` URLs are rejected upstream by Astro 7 before any F6 code runs (`astro dev` 500 / built server 400 — documented boundary, spec FR-007, not an F6 500); `/tags/index` serves the index page (recorded limitation).
3. AC3 live: remove a tag from every note → reload `/tags` → key gone; `/tags/<old>` → empty-state. Malformed file still skipped on both routes.
4. Nav: from `/`, `/note/<slug>`, `/search`, `/status/seed` — Tab reaches `#tags-entry`, activates → `/tags`. Zero key handlers anywhere (F2/F3/F5 sweeps stay green).
5. `/status/seed|growing|evergreen|archived` unchanged; `/status/nonsense` → 404. View timings < 500 ms recorded.
6. Loopback: no non-loopback listener for the app port (`awk '$4=="0A"{print $2}' /proc/net/tcp{,6}`), no `--host` anywhere.

Cleanup: stop dev; temp vaults under `mktemp`/`TMPDIR`. Verification as written creates **zero** commits on the build branch (D1/D8; the only git activity is the throwaway vault's seed commit). The repo's own `vault/` is never written.

---

## Risks & spec-internal tension (resolved here, not re-opened)

- **`index`-named tag shadowed**: a tag literally named `index` loses its per-tag URL to the static index route — accepted D3/D4 limitation, documented in README + spec Edge Cases, not fixed with route surgery.
- **Raw-vs-folded copy**: heading/empty show the RAW param while matching folds — deliberate (open-vocabulary honesty); reviewers seeing `AI` head a list of `ai` members should not "fix" it to the folded key.
- **`getAllTags` does not sort**: alphabetical authority lives in `buildTagIndex`'s `.sort()` — a reviewer adding a sort here would fork the authority; the no-re-sort is asserted by test (shuffled input object key order is NOT re-sorted — insertion order preserved).
- **Second read of the same vault per request**: each tag page does its own tolerant pass + `buildTagIndex` — no shared cache by design (D6); the 500 ms budget (SC-007) is the guardrail, not speculative memoization.
- **Badge duplication**: per-page `.badge[data-status]` CSS copies the status-page rules — a third visual idiom is a D7 violation, not a cleanup opportunity.
- **Status-half has no code**: AC2's `/status` evidence is a probe task (T-task) — an empty `git diff src/pages/status/` at the end is EXPECTED, not a gap.
- **Pre-existing test failure**: `note.test.ts` unwritable-vault 500-vs-200 (root bypasses chmod) must be unchanged-or-fixed, never worsened — recorded so the gate cannot mistake it for an F6 regression.
- **Same-millisecond `updated` flakiness**: tests seed distinct/old fixture timestamps or assert `>=`/ordering with tie-break — never strict wall-clock inequality.

## Complexity Tracking

> Fill only if the Constitution Check has violations to justify — it has none (unfilled template, no gates). Additions beyond D1–D8 are recorded under Research R1–R8 and the Interface Contracts instead.

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| `tags.ts` pure module | D2 pins selection + codec unit-testable without a browser; pages stay render-only | in-page `.sort()`/`.filter()` is untestable under vitest and invisible to the AC3 regression |
| Two page files (not one dynamic) | Astro file routing: static index + param route are distinct URL shapes with distinct copy (200-always vs F4's 404) | a single route with a branch would fork empty-state semantics and complicate the no-404 contract |
| Base landmark insertion | D7's single entry point from every view with zero key surface | per-page header links scatter chrome across four owners |
| `tags.test.ts` through real `buildTagIndex` | AC3 is about the construction path dropping keys, not just projection | mock-index tests would pass while the real path regressed |

## ANALYZE verdict

**ANALYZE: yes — a read-only cross-artifact consistency pass is warranted before implementation.**

Reason: the plan necessarily fixes cross-feature surfaces that D1–D8 pin only by reference — (1) the `tags.ts` export surface as the F6 contract (`getAllTags` no-re-sort authority, `getNotesForTag` fold-once discipline, `URIError`-safe codec), (2) the two page contracts (§2/§3: tolerant-read + no-inline-selection + RAW-param copy + no-404-file), (3) the Base insertion bytes (§4: landmark + ids, zero script/style, anchor preservation), (4) the AC3 regression shape through the real `buildTagIndex` (R6). A read-only pass should bless these four; nothing in the plan re-opens D1–D8 or the 5 recorded clarifications.

## Out of scope for this step

No code, no `tasks.md`, no commits/push/PRs, no board-status changes, no writes outside this worktree's `specs/f6-tags-browsing/`. Follow-on: `/speckit.tasks` (Phase 2), then the analyze-equivalent cross-artifact report, then the orchestrator's build → critic → tester chain with `ANALYZE: yes` feeding the review pass.
