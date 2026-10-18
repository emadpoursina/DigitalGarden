# Implementation Plan: F3 Wiki-Links & Backlinks

**Branch**: `digitalgarden/t_5927eb0f-f3-build-wiki-links-backlinks-implementa` (build card t_5927eb0f) | **Date**: 2026-10-18 | **Spec**: [specs/f3-wiki-links/spec.md](./spec.md)

**Input**: Feature specification `specs/f3-wiki-links/spec.md` (clarified 2026-10-18, 5/5 questions resolved) + locked orchestrator decisions D1–D9 (parent card t_eea78f10).

**Step**: `/speckit.plan` (Phase 5/6). Deliverable is this plan — implementation and task breakdown land in `tasks.md`; no code in this step.

> **Artifact consolidation**: the card fixes the F3 artifact set at `specs/f3-wiki-links/{spec,plan,tasks}.md` (F2 parity), so the template's separate `research.md`, `data-model.md`, `contracts/`, and `quickstart.md` outputs are consolidated into this single file: "Research (Phase 0)" below, "Data Model" and "Interface Contracts" (Phase 1), "Validation & Quickstart" (Phase 1).
> **Extension hooks**: `.specify/extensions.yml` does not exist → `before_plan` / `after_plan` hook stages skipped silently (both pre-check and mandatory post-check performed).

---

## Summary

F3 puts a minimal reading + editing surface over the vault at `/note/[slug]` and makes wiki-links real end to end: a server-rendered note view where `[[target]]`/`[[target|alias]]` prose renders as links (unresolved targets render as pending markers) with a Backlinks panel beside it; a raw-Markdown textarea editor whose save path re-reads the vault into the backlink index (`refreshVaultIndex`, D6) before answering; a DOM-free `[[` autocomplete state machine wired from F2's `capture-client.ts` pattern (D5); and pending-marker clicks that create the missing note through the existing `POST /api/capture` contract and navigate to it (D7).

Three facts verified against this checkout drive the design, none assumed:

1. **The D3 gap is real and it silently kills backlinks.** Probed current `resolveWikiLink`: a note at slug `retrieval-practice` titled "Retrieval practice sessions" is NOT reachable via `[[Retrieval Practice]]`, and `[[cafe society]]` misses "Café Society" — both return `null`, so today those bodies produce neither a rendered link nor a backlink entry. Fix: a third, case-insensitive tier `slugify(target) === slug` with deterministic smallest-slug tie-breaks, added inside `src/lib/notes.ts` (D2's proven gap), consumed by renderer, index, and panel alike so they can never disagree (spec FR-003).
2. **Rendering needs a tokenizer-positioned rule, not a regex.** `markdown-it@15.0.2` (already declared, currently unused) renders `[[…]]` as literal text, escapes raw HTML by default (`html:false`), and — because inline code spans and fences are tokenized before inline rules run — a tiny `md.inline.ruler.before('link', 'wikilink', …)` plugin gets code protection for free. A working prototype was run against the real renderer: resolved anchors, pending markers with `data-target`, `[[#heading]]` left literal (matching F1's extractor, which drops `#` targets), and zero `[[..]]` links emitted from inside code.
3. **On-demand dynamic routes build clean.** A temporary `src/pages/__probe/[slug].astro` (no `getStaticPaths`) built with exit 0 on this exact `output:'server'` + `@astrojs/node` config, and the worktree was clean after cleanup — so `/note/[slug].astro` needs no route plumbing beyond the file itself.

Also verified today on this worktree: `npm install` exit 0, `npm run test` 6 files/108 tests exit 0, `npm run build` exit 0 (F2's shipped state is green), and a real browser check is possible — `@playwright/test@1.64.1` launches the Chromium at `PLAYWRIGHT_BROWSERS_PATH=/opt/hermes/tools/chromium-1208/chrome-linux/chrome` via explicit `executablePath` (default revision `1248` headless shell is absent, so the path must be passed).

## Technical Context

**Language/Version**: TypeScript on Node.js ≥ 20 (repo runs Node 26.7.0); `astro check` not wired — `npm run build` catches syntax/import errors, types are advisory (F2 precedent; `npx tsc --noEmit` stays available as a voluntary gate).

**Primary Dependencies**: `astro ^7.3.8` (locked 7.3.8), `@astrojs/node ^11.1.8` (already present — F2), `markdown-it ^15.0.2` (locked 15.0.2, declared since onboarding, **first consumer in F3**), `simple-git ^4.0.2` (untouched by F3 — no commits, Q4), `vitest ^5`, `@playwright/test ^1.64.1` (verification only, no config/spec files added). **Added by this plan**: devDependency `@types/markdown-it@^14.2.0` (`markdown-it` ships no `index.d.ts` — checked on disk; `@types/markdown-it`'s newest published line is 14.2.0, verified via `npm view` — type-advisory drift against runtime 15 is accepted, the build does not typecheck) so `npx tsc --noEmit` stays usable as a voluntary gate.

**Storage**: plain Markdown + YAML frontmatter via F1 `src/lib/notes.ts` (single, surgical extension — see Research R2); no database; no new persisted state.

**Testing**: `npm run test` → `vitest run` (node env, `*.test.ts` only); `npm run build` → `astro build`. Browser-only facts are covered by one-off scripted checks against `astro dev` (temp vault) using the installed Chromium — no `*.spec.ts`, no `playwright.config.ts`, therefore no vitest include-collision (F2's R8 lesson kept).

**Target Platform**: local-first web app, loopback only (`astro dev` / `astro preview` default to localhost; never `server.host: true`, never `--host`).

**Performance Goals**: note view (render + panel) interactive < 500 ms (PRD §8); popup appears < 200 ms after `[[` (SC-004) — both are thin SSR + one bundled page script; save round-trip is one small file write + one full-vault index read.

**Constraints**: offline / zero non-loopback access (FR-010); zero data loss — no silent overwrite of external edits, no silent buffer loss (FR-007, SC-008); no git commits from F3 (Q4) and no commits/push from this plan card (D9); `npm install` + `npm run test` + `npm run build` must stay green (D8).

**Scale/Scope**: single-user, ≤ 5,000 notes (PRD §8); fresh index read per view today (see Research R7).

**No NEEDS CLARIFICATION items remain** — all 5 spec clarifications are resolved in `spec.md`; the implementation-level questions they deferred (page-data transport, save response shape, pending-create endpoint reuse, browser verification mechanics) are decided in this plan.

## Constitution Check

*GATE: `.specify/memory/constitution.md` is still the unfilled `[PROJECT_NAME]` template — it defines **no gates**, so no constitution gate can pass or fail (same finding as F2's plan and the clarify step; re-checked 2026-10-18). Complexity Tracking is therefore empty of violations (see bottom).*

In place of constitution gates, the plan is checked against the binding PRD §8 non-functional requirements:

| PRD §8 requirement | How this plan satisfies it | Re-check after design |
|---|---|---|
| Note view render < 500 ms (local) | One SSR page: one `readNote` + one `refreshVaultIndex` pass + one markdown-it render; no client round-trips; measured in quickstart step 6 | ✓ |
| Data loss: zero tolerance | `saveNote` runs with the page-load snapshot → F1's `ExternalEditConflictError` → explicit inline reload/overwrite choice (FR-007); Esc-discard confirms; pending-create never overwrites (409 → navigate to existing) | ✓ |
| Network exposure: loopback only | No config change; autocomplete candidates are embedded in the page (no extra endpoint, no fetch besides same-origin POSTs); never `--host` | ✓ |
| Vault format: plain Markdown + YAML | Unchanged — F1 serialization only; renderer outputs HTML at view time, never rewrites bodies | ✓ |
| Offline / no network service | No outbound calls anywhere in the feature; markdown-it and the resolver are local modules | ✓ |
| Accessibility: keyboard-only | Real `<button>` controls (Edit/Save/Cancel, conflict pair, pending markers are focusable), popup keys scoped to the open popup, zero bare global bindings (FR-008/SC-006) | ✓ |
| Scalability: 5,000 notes | Fresh index read per view is the F2-dashboard precedent; R7 records the trigger point and the follow-up (frontmatter-only read or mtime cache) instead of building it speculatively | ✓ |

## Project Structure

### Documentation (this feature)

```text
specs/f3-wiki-links/
├── spec.md                 # clarified spec (input, unchanged by this step)
├── plan.md                 # THIS FILE (/speckit.plan output; research/data-model/contracts/quickstart consolidated)
├── checklists/requirements.md   # 16/16 (specify/clarify step; untouched here)
└── tasks.md                # Phase 2 output (/speckit.tasks — NOT created by this step)
```

### Source Code (repository root) — proposed end state

```text
src/
├── lib/
│   ├── notes.ts                  # MODIFY (surgical): resolveWikiLink gains tier-3 slugify match + tie-break (D2 proven gap)
│   ├── notes.test.ts             # MODIFY: additive resolution cases (slugify-equivalence, tie-break, case matrix)
│   ├── render.ts                 # NEW  renderNoteBody(body, resolve) → HTML (markdown-it + wikilink inline rule)
│   ├── render.test.ts            # NEW  parity with extractWikiLinks, code protection, HTML escaping, alias, pending markup
│   ├── wikilink-client.ts        # NEW  DOM-free decisions: autocomplete state machine, edit/save/escape, conflict, pending-create
│   ├── wikilink-client.test.ts   # NEW  key scoping sweep, filter/select/insert, save branches, conflict branches, click guard
│   ├── capture.ts                # UNCHANGED (F2) — consumed via POST /api/capture for pending-create only
│   ├── capture-client.ts         # UNCHANGED (F2)
│   ├── vault.ts                  # UNCHANGED (F2) — resolveVaultDir() reused everywhere
│   └── dashboard.ts              # UNCHANGED (F2)
├── pages/
│   ├── index.astro               # UNCHANGED (F2 dashboard; rows stay non-links for F3 — spec Assumption)
│   ├── new.astro                 # UNCHANGED (F2)
│   ├── note/[slug].astro         # NEW  read view + backlinks panel + edit mode + embedded page data + page script
│   └── api/
│       ├── capture.ts            # UNCHANGED (F2) — reused as the pending-create contract
│       ├── capture.test.ts       # UNCHANGED (F2)
│       ├── note.ts               # NEW  POST save endpoint (200/400/404/409/500/405)
│       └── note.test.ts          # NEW  endpoint contract tests (direct handler invocation, temp vault)
├── layouts/Base.astro            # UNCHANGED
└── styles/global.css             # UNCHANGED (page-scoped <style> only — keeps this diff off shared files)

ainative: .ainative/project.yaml  # MODIFY: validation_commands += `npm run test` (D8/FR-011)
package.json / package-lock.json  # MODIFY: devDependency @types/markdown-it only (no runtime additions)
astro.config.mjs                  # UNCHANGED (server output + node adapter already configured by F2)
```

**Structure Decision**: single-project layout, no new directories beyond `src/pages/note/`. The F2 rule carries over unchanged: **every behavior lives in `src/lib/*.ts` as pure functions with injected side-effect ports, and the `.astro` page only wires DOM to them** — this is what makes AC1/AC3/AC4 testable under plain vitest without a browser. `notes.ts` is NOT a read-only base in F3 (unlike F2's D7): D2 explicitly sanctions extension on proven gap, and the D3 gap is that proven gap — but the change is confined to `resolveWikiLink`'s matching logic.

---

## Research (Phase 0) — resolved unknowns, with evidence

Every entry: Decision → Rationale → Alternatives considered. Findings come from probes run in this session against this checkout (scratch files under the Hermes scratch dir; the repo worktree was left clean — `git status --porcelain` empty after the temporary probe route was removed).

**R1 — Wiki-link rendering: a `markdown-it` inline rule, not a regex pre-pass.**
*Evidence*: stock `markdown-it@15.0.2` renders `See [[Artificial Intelligence|AI]] now.` as literal text, escapes `<script>` to `&lt;script&gt;` (safe default `html:false`), and protects `[[..]]` inside backticks and fences. A prototype `md.inline.ruler.before('link', 'wikilink', …)` rule, run against the real renderer, produced `<a href="/note/artificial-intelligence" class="wikilink">AI</a>`, `<a class="wikilink pending" data-target="Missing Note" …>Missing Note</a>`, left `[[#heading]]` literal (the rule bails on `#`-prefixed targets — exactly F1's extractor, which drops them: probed `extractWikiLinks` returns no entry for `[[#heading]]`), and emitted nothing from code spans/fences.
*Decision*: `src/lib/render.ts` = `renderNoteBody(body, resolve)` using markdown-it with `html:false` (default kept) plus one inline rule; resolved → `a.wikilink[href=/note/<slug>]`, unresolved → focusable `a.wikilink.pending[data-target]` (markup emitted by a custom renderer rule, attributes escaped); `#`-targets and empty targets make the rule bail so they stay literal text.
*Alternatives*: (a) regex-replace `[[..]]` before markdown-it with `html:true` — rejected: breaks escaping, must re-implement code-protection, diverges from `extractWikiLinks`; (b) remark/rehype pipeline — rejected: new dependency family for one syntax; (c) resolve-and-bake links at save time — rejected: stale on external edits and on target creation (pending markers must resolve live).

**R2 — The D3 resolution gap: extend `resolveWikiLink` in place, three tiers + deterministic tie-break.**
*Evidence*: probe table against the current code — `retrieval-practice`→hit (slug), `Retrieval practice sessions`→hit (title), `Retrieval Practice`→**null**, `cafe society`→**null** (vs "Café Society"), `AI 101`→hit (title), `ai-101`→hit (slug), `ARTIFICIAL-INTELLIGENCE`→hit, `No Such Note`→null; `slugify('Retrieval Practice')==='retrieval-practice'` and `slugify('cafe society')==='cafe-society'` both true. Existing F1 tests pin `resolveWikiLink('artificial intelligence'|'ARTIFICIAL-INTELLIGENCE')` and the null case — all three stay green because the change is purely additive (a tier-3 pass can only turn misses into hits, never the reverse).
*Decision*: matching order stays D3's slug → title, then adds tier 3 `slugify(target) === n.slug` (case-insensitive by construction); each tier collects candidates and the first non-empty tier wins; **ties inside a tier break to the lexicographically smallest slug** (titles are not unique in F1, slugs are). Consumers — `buildBacklinkIndex` (unchanged code, gains the new matches automatically), the renderer, and the autocomplete insert — all call this one function, satisfying FR-003's "the three can never disagree".
*Alternatives*: (a) slugify-only matching (drop exact tiers) — rejected: D3 locks slug → title order and exact-title matching must not depend on slug shape; (b) fix it in the renderer only — rejected: creates exactly the render/index divergence FR-003 forbids; (c) rewrite `extractWikiLinks` instead — rejected: the extractor's "what is a link" semantics are F1-pinned (edge cases depend on them).

**R3 — Reading view: `/note/[slug].astro` as a plain SSR route with embedded page data.**
*Evidence*: a temporary `src/pages/__probe/[slug].astro` using `Astro.params.slug` (no `getStaticPaths`) built with exit 0 under the current config; worktree clean after removal. `Base.astro` is a 19-line shell (title hardcoded "Digital Garden" — the page therefore sets its own `<title>` via the layout's slot or accepts the default; decision: pass nothing, keep F3 diffs out of `Base.astro`, and render the note title in the `<h1>` — a per-page `<title>` override is F8 chrome).
*Decision*: the route reads `resolveVaultDir()` → `readNoteWithSnapshot` (page-load snapshot for FR-007) → `refreshVaultIndex` (panel + candidates + resolution set) → `renderNoteBody`; unknown slug returns `new Response(html404, { status: 404 })`; one embedded JSON island (`<script type="application/json" id="f3-page-data">`) carries `{ snapshot: { hash, mtimeMs }, candidates: [{ slug, title, status }] }` for the save path and the autocomplete — no extra GET endpoint.
*Alternatives*: fetch candidates from `GET /api/notes` — rejected: extra endpoint + latency + a second contract for data the page already holds; client-side rendering of the body — rejected: duplicates the renderer in the browser and would diverge from the index.

**R4 — Save: new `POST /api/note`, F1 snapshot machinery, D6 recompute inside the handler.**
*Evidence*: F1's `saveNote(vault, note, { baseSlug, baseSnapshot, force })` already implements exactly the FR-007 semantics — when `currentHashIfExists() !== baseSnapshot.hash && !force` it throws `ExternalEditConflictError` carrying the disk note + snapshot; `force: true` is the explicit overwrite. `readNoteWithSnapshot` supplies the page-load snapshot. F2's endpoint pattern (thin adapter → pure `lib` function → status table, proven by `api/capture.test.ts`) is reused verbatim.
*Decision*: handler flow = parse `{ slug, body, baseHash }` → `readNote` (title/status/tags stay disk-truth — body-only editing) → `saveNote(..., { baseSlug: slug, baseSnapshot: { slug, mtimeMs, hash: baseHash }, force })` → on success **`refreshVaultIndex(resolveVaultDir())` inside the same request (D6)** and answer `200 { slug, updated, backlinks }`. Mapping: `NoteNotFoundError`→404, `ExternalEditConflictError`→`409 { error:'external-edit-conflict', disk: { updated, hash } }`, bad payload/empty slug→400, fs errors→500, GET→405. Client on `200` does `location.reload()` — the server re-renders read mode from disk (persisted body + fresh panel), which is the simplest possible AC2 proof and needs zero client-side markdown.
*Alternatives*: return rendered HTML in the response and swap it client-side — rejected: a second render path (client must run the same plugin); optimistic panel patch from the response's `backlinks` — rejected for F3 (the response already carries them — kept for a future no-reload upgrade); `PUT /api/note/<slug>` — rejected: identical semantics, one contract surface is enough, and POST matches the F2 precedent.

**R5 — Pending-create reuses `POST /api/capture` (D7) instead of a third endpoint.**
*Evidence*: `saveCapture(vault, { title, body: '', mode:'new' })` pins `slug: slugify(title)` → `SlugConflictError` → `409 { error:'slug-conflict', slug }`, otherwise `201 { slug, status:'seed', git }` with `status:'seed'`, `visibility:'private'`, empty body — precisely clarification Q3's defaults; title validation guarantees non-empty. The F3 client needs only the slug from `201`, and maps `409` to "navigate to the existing note" (Q3's defensive collision branch) for free.
*Decision*: pending-create = `fetch('/api/capture', { method:'POST', body: JSON.stringify({ title: target }) })`; `201`/`409` → `location.assign('/note/' + slug)`; `400`/`500` → inline error, stay put (FR-009); one in-flight request per marker (`shouldAcceptSubmit`-style guard reused conceptually, implemented as a pure `pendingCreateDecision` in `wikilink-client.ts`). Side effect worth recording: the created note is git-committed by F2's capture path (`docs(note): capture <slug>`) — consistent with Q4's split (creates commit, edits don't) and F2's shipped behavior.
*Alternatives*: new `POST /api/note/create` — rejected: duplicates `saveCapture` logic (validation, defaults, conflict mapping) to avoid a one-line reuse; extending the save endpoint with `mode:'create'` — rejected: two unrelated payload shapes on one endpoint.

**R6 — Autocomplete: pure state machine in `wikilink-client.ts`, candidates embedded (D5).**
*Decision*: the page script owns exactly four DOM touchpoints (textarea caret, popup element, save/cancel buttons, status region); everything else is a pure function: `extractQuery(text, caret)` → text between the last unclosed `[[` on the caret's line and the caret (stops at `]` or newline; returns `null` when no open construct — popup closed), `filterCandidates(query, titles)` → case-insensitive substring match over titles (empty query = all) preserving the embedded candidates' order — the page embeds them sorted case-insensitively by title, so the popup order is deterministic and SC-004's "≤ 2 navigation keystrokes" holds (initial selection = first row; typing usually narrows to one), `moveSelection(delta, len, i)` → wrapped index, `acceptSelection(query, candidate)` → `{ replacement, caret }` replacing the whole `[[query` construct with `[[Title]]`, `dismissAutocomplete()`, plus the key router `autocompleteKeyCommand({ key, popupOpen })` → `'up'|'down'|'enter'|'tab'|'escape'|null` — **returns `null` for every key while the popup is closed** and matches no printable key ever (sweep-tested like F2's `isCaptureKeyCommand`). Save/escape/conflict/pending decisions live beside them (same file per D5).
*Decision on keys*: the textarea's `keydown` handler consults `autocompleteKeyCommand` first; only when it returns non-null does the handler `preventDefault` and act — so Up/Down/Enter/Tab/Esc are structurally scoped to the open popup (SC-004/SC-006), and when the popup is closed Esc falls through to the edit-buffer discard flow (US2.3).
*Alternatives*: contenteditable/CodeMirror editor — rejected: D1 pins a raw textarea, CodeMirror is F8; fetching candidates per keystroke — rejected (R3); displaying slugs in rows only when titles collide — decision: always show the slug as secondary text (duplicates disambiguated, FR/US3.6).

**R7 — Index freshness: recompute per request, no cache in F3.**
*Decision*: every note view and every save call `refreshVaultIndex(resolveVaultDir())`. Correctness first: external edits appear immediately, D6's "recompute on the save path" is literally true, and it matches F2's dashboard (per-request full read, documented follow-up at 5k scale).
*Trigger recorded for tasks*: if a measured temp-vault run at ~5,000 notes exceeds the 500 ms view budget, the follow-up (frontmatter-only candidate read or an mtime-keyed cache invalidated by the save handler) becomes a task — deliberately not built speculatively (YAGNI, F2 precedent).
*Alternatives*: in-process cache invalidated on save — rejected for F3: staleness against external editors (F1.5's whole point) plus invalidation complexity for a single-user tool at today's vault sizes (tens–hundreds of notes).

**R8 — Verification strategy: vitest + build + scripted browser checks against the installed Chromium.**
*Evidence (this session)*: default `chromium.launch()` fails (`chromium_headless_shell-1248` absent) but `chromium.launch({ executablePath: '/opt/hermes/tools/chromium-1208/chrome-linux/chrome' })` works — probed end to end (`about:blank` → `data:` URL, text content read back). `@playwright/test@1.64.1` is declared; no `playwright.config.ts` exists; no `*.spec.ts` will be added (vitest's default include would pick them up — F2's R8 trap kept).
*Decision*: primary evidence = vitest suites (pure modules + endpoint handlers invoked directly against `mkdtemp` vaults, `GARDEN_VAULT_DIR` override) + `npm run build`; browser-only facts (autofocus/keyboard/popup/click flows, view timing) are checked by one-off scripted sessions run from the scratch dir against `astro dev` with a temp vault, using the `executablePath` above — recorded in the completion report, never added to `npm run test`.
*Alternatives*: install the matching playwright browser revision (~170 MB download) — unnecessary when a working Chromium is on disk; manual-only checklist — strictly weaker than the scripted version now that launch is proven.

---

## Technical Approach

### 1. Reading view `/note/[slug]` (D1, FR-001/002/004, US1)

`src/pages/note/[slug].astro`, server-rendered (inherits `output:'server'`; R3 proved dynamic routes need nothing else). Page-scoped `<style>` only.

Markup: `<h1>` title + status badge + last-updated + Edit `<button>`; `<article id="note-body">` with the server-rendered HTML from `renderNoteBody`; `<aside id="backlinks">` with one row per inbound link occurrence — referencing title (anchor to its view), status badge (archived visibly flagged), link text — or an explicit "No backlinks yet" empty state; a hidden `#note-edit` region (textarea `#note-editor`, Save/Cancel buttons, `#note-status` `role="alert"`, `#note-conflict` `role="alert"` with the reload/overwrite pair); the embedded `#f3-page-data` JSON; one page script bundling `wikilink-client.ts`.

Resolution/data flow per request: `resolveVaultDir()` → `readNoteWithSnapshot(slug)` → 404 on `NoteNotFoundError` → `refreshVaultIndex()` → render body with `renderNoteBody(body, (t) => resolveWikiLink(t, index.notes))` → panel rows from `index.backlinks[slug]`. Pending markers are focusable anchors carrying `data-target`; nothing creates a note at render time (FR-002/009).

### 2. Renderer `src/lib/render.ts` (R1, FR-002)

- `renderNoteBody(body: string, resolve: (target: string) => string | null): string` — markdown-it instance with the wikilink inline rule; `resolve` is injected so tests can pass a stub resolver or the real `resolveWikiLink`.
- Rule behavior (probed): `[[target|alias]]` → `<a class="wikilink" href="/note/<slug>">alias</a>` when resolved; unresolved → `<a class="wikilink pending" data-target="<escaped target>" href="#" role="button">text</a>`; targets starting with `#`, empty/whitespace targets, and anything inside code spans/fences stay literal (the rule bails or is never reached).
- `linkText` semantics must equal F1's extractor: alias when present else target (probe confirmed parity: `extractWikiLinks` → `linkText: 'the alias'`).
- Security: markdown-it's `html:false` default is kept — raw HTML in note bodies escapes (probed). All injected attributes are escaped by the renderer rule.

### 3. Resolution extension `src/lib/notes.ts` (R2, D2/D3, FR-003)

Confined to `resolveWikiLink`: collect tier-1 slug matches (case-folded), else tier-2 title matches (case-folded), else tier-3 `slugify(target) === slug`; pick the lexicographically smallest slug within the winning tier; `null` only when all three tiers miss. No other `notes.ts` function changes — `buildBacklinkIndex` and `refreshVaultIndex` inherit the fix automatically (they call this function). `notes.test.ts` gains additive cases; the existing F1 suite must stay green untouched-in-intent (they cannot regress: misses→hits only).

### 4. Save path (R4, D6, FR-006/007, US2)

`src/pages/api/note.ts` — thin adapter exactly like `api/capture.ts`: parse → pure call → status table (contract below). No path logic, no resolution logic, no markdown here.

Client side (pure, in `wikilink-client.ts`): `editDecision` (enter/exit edit, dirty tracking), `saveDecision` (build payload from textarea + page-data snapshot hash; disable controls while in flight — double-save guard), `escapeDecision` (clean → leave immediately; dirty → `window.confirm` — F2's proven pattern), `conflictDecision` (409 → show `#note-conflict`, keep buffer, focus the content-preserving control; `reload` → confirm then `location.reload()`; `overwrite` → re-POST with `force: true`). On `200` → `location.reload()` (read mode re-rendered from disk with the recomputed panel — AC2's observable).

Order matters: read snapshot at page load → hash-compare inside `saveNote` → write → `refreshVaultIndex` → respond. A failed save never writes; a conflict never writes; `force` is only ever set by an explicit user choice.

### 5. Autocomplete wiring (R6, D5, FR-008, US3)

Textarea `keydown` → `autocompleteKeyCommand` → act only when non-null (popup open): Up/Down move the visual selection, Enter/Tab `acceptSelection` (replace `[[query` construct with `[[Title]]`, caret after `]]`), Esc dismisses the popup only. `input`/`keyup` → `extractQuery` + `filterCandidates` → re-render popup rows (`<button>`-style rows or `role="listbox"`/`role="option"` with `aria-activedescendant`; recommendation: listbox + option rows so screen readers get the popup semantics). Popup closes itself when `extractQuery` returns `null` (construct closed/abandoned). Printable keys are never intercepted (no handler claims them).

### 6. Pending-create wiring (R5, D7, FR-009, US4)

Pending marker `click` (and Enter/Space via its anchor/button semantics) → `pendingCreateDecision({ inFlight, target })` → single `POST /api/capture { title: target }` → `201`/`409` → `location.assign('/note/' + slug)`; error → `#note-status` message, marker stays, `inFlight` resets. The guard makes double-clicks idempotent (SC-005).

### 7. Tests (D8)

All hermetic: `mkdtemp` vaults, `GARDEN_VAULT_DIR` override, no network, no writes to the repo `vault/`, no commits anywhere.

| File | Covers |
|---|---|
| `src/lib/notes.test.ts` (extended) | tier-1/2/3 resolution matrix: exact slug ci, exact title ci, slugify-equivalence incl. accents/punctuation ("cafe society", "Retrieval Practice"), `ARTIFICIAL-INTELLIGENCE` regression, smallest-slug tie-break for duplicate titles, all-miss → null; existing F1 cases unchanged |
| `src/lib/render.test.ts` | resolved anchor href/text; alias linkText parity with `extractWikiLinks`; pending marker markup + `data-target` escaping; `[[#…]]` literal; `[[..]]` in inline code and fences untouched; raw HTML escaped; backlink-source parity: for a fixture body, the set of rendered link targets equals `extractWikiLinks(body)` |
| `src/lib/wikilink-client.test.ts` | `extractQuery` (open/closed constructs, line boundaries, `]]` termination); `filterCandidates` (case-insensitive, empty query, no match); `moveSelection` wrap; `acceptSelection` replacement + caret; `autocompleteKeyCommand` returns null for all five keys when popup closed **and for every printable key ever** (a–z/A–Z/0–9/punctuation sweep, F2 style); `escapeDecision` dirty/clean truth table with mocked confirm; `saveDecision` in-flight guard + payload build; `conflictDecision` reload/overwrite branches; `pendingCreateDecision` in-flight/201/409/error branches |
| `src/pages/api/note.test.ts` | endpoint contract verbatim: `200 { slug, updated, backlinks }` where `backlinks` reflects the just-saved body (AC2/D6 proof, no manual refresh); `404` unknown slug; `400` bad payload; `409 external-edit-conflict` when the file changed after the page-load hash (and `force:true` then succeeds — buffer/disk both intact until then); `500` vault IO failure; `GET` → 405; empty body save succeeds; no git commit is created by the save (asserts `git log` unchanged in a temp repo — Q4) |
| `src/pages/api/capture.test.ts` (F2, untouched) | stays green — it is also the pending-create contract's evidence (201 title-only → `seed`/`private`/empty body; 409 slug conflict) |

Unchanged: `src/lib/notes.test.ts`'s existing 100+ assertions, `capture*.test.ts`, `dashboard.test.ts`, `vault.test.ts` must all still pass — the whole suite is the regression net for touching `notes.ts`.

---

## Data Model (Phase 1)

| Entity | Fields (source) | Validation / state |
|---|---|---|
| **Note** (persisted, F1) | `title`, `slug`, `tags[]`, `status`, `visibility`, `created`, `updated`, `body` | unchanged; F3 only ever writes `body` (server reads the rest from disk at save time) |
| **Page load snapshot** | `hash`, `mtimeMs` (from `readNoteWithSnapshot`) | embedded in page data; compared at save; mismatch → 409 unless explicit force |
| **Edit buffer** (ephemeral) | `body`, `dirty`, `inFlight` | lives only while Edit is open; discarded on Esc/navigate after confirm (Q2) |
| **Autocomplete session** (ephemeral) | `open`, `query`, `candidates[]`, `selection` | derived from caret position on every keystroke; popup-scoped keys only |
| **Backlink row** (rendered) | `fromSlug`, referencing `title`, referencing `status`, `linkText` | one row per inbound link occurrence from F1's index; archived flagged; self/pending/trash excluded |
| **Page data** (embedded JSON) | `snapshot { hash, mtimeMs }`, `candidates [{ slug, title, status }]` | single source for save + autocomplete; no extra GET |
| **Pending-create result** | `201 { slug }` / `409 { slug }` / error | at most one in flight per marker; never overwrites |

State transitions: `read → (Edit) → editing → (Save) → saving → read | conflict(409) → (Reload) → read | (Overwrite) → saving(force) → read`; `editing → (Esc/Cancel, dirty) → confirm → read | stay`; `pending-marker → (click) → creating → navigate | error(stay)`.

## Interface Contracts (Phase 1) — surfaces beyond D1–D9's literals

**1. `POST /api/note` (save — NEW contract)**

Request:
```json
{ "slug": "retrieval-practice", "body": "See [[Other Note]].", "baseHash": "<sha from page load>", "force": false }
```
`slug` required non-empty string; `body` required string (may be `""`); `baseHash` required string (page-load hash); `force` optional boolean (default `false`, set only by the Overwrite control).

Responses:

| Status | Body | Meaning |
|---|---|---|
| `200` | `{ "slug": "…", "updated": "…", "backlinks": { "…": [ { "fromSlug", "linkText" } ] } }` | saved; `backlinks` is the D6-recomputed index (AC2 proof) |
| `409` | `{ "error": "external-edit-conflict", "disk": { "updated": "…", "hash": "…" } }` | disk moved on since page load; nothing written (FR-007) |
| `404` | `{ "error": "note-not-found", "slug": "…" }` | slug doesn't exist |
| `400` | `{ "error": "invalid-payload" }` | malformed body/missing fields; nothing written |
| `500` | `{ "error": "save-failed", "message": "…" }` | vault IO failure — loud, never silent |
| `405` | JSON | method guard |

**2. Embedded page data (NEW contract)** — `<script type="application/json" id="f3-page-data">` on `/note/[slug]`: `{ "snapshot": { "hash": "…", "mtimeMs": 0 }, "candidates": [ { "slug": "…", "title": "…", "status": "seed" } ] }`. Consumed only by the page script; shape is asserted by the endpoint/page tests.

**3. `resolveWikiLink` three-tier rule (F1-extension contract)** — case-insensitive; tier order slug → title → `slugify(target)===slug`; smallest-slug tie-break within a tier; `null` only when all miss. Binding for every future link consumer (F5 search hops, F12 orphan detection, F19 rewrites will all want it).

**4. Pending-create = `POST /api/capture { title }` (reused F2 contract)** — `201 { slug, status, git }` / `409 { error:'slug-conflict', slug }` / `400` / `500`, semantics unchanged from F2's plan §1; F3 relies only on slug + the 409 collision branch.

*These four are the reason ANALYZE = yes*: D1–D9 fix the features but not the save schema, the page-data shape, the F1-module behavioral change, or the cross-feature reuse of the capture endpoint — a read-only pass should bless those before implementation (verdict at the bottom).

## File-by-file changes

| File | A/M | What changes | Done when |
|---|---|---|---|
| `package.json` / `package-lock.json` | M | devDependency `@types/markdown-it` only | install exits 0; lock diff contains only that subtree; runtime deps unchanged |
| `.ainative/project.yaml` | M | `validation_commands`: add `npm run test` between install and build (D8) | file lists all three commands; comment stays accurate |
| `src/lib/notes.ts` | M | `resolveWikiLink` three-tier matching + tie-break (only this function) | new + existing resolution tests green; `git diff` shows no other hunk |
| `src/lib/notes.test.ts` | M | additive resolution cases | suite green |
| `src/lib/render.ts` + `render.test.ts` | A | markdown-it + wikilink inline rule, injected resolver | parity/code/escaping/alias/pending tests green |
| `src/lib/wikilink-client.ts` + `.test.ts` | A | autocomplete state machine + edit/save/escape/conflict/pending decisions (DOM-free) | suites green incl. printable-key sweep |
| `src/pages/note/[slug].astro` | A | read view, panel, edit region, conflict region, embedded JSON, page script | build green; served routes match §1; 404 for unknown slug |
| `src/pages/api/note.ts` + `note.test.ts` | A | save endpoint per contract §1 | contract tests green |
| `astro.config.mjs`, `src/pages/index.astro`, `src/pages/new.astro`, `src/pages/api/capture*.ts`, `src/lib/{capture,capture-client,vault,dashboard}.ts`, `src/layouts/Base.astro`, `src/styles/global.css` | — | **unchanged** | `git status` shows them untouched |
| `README.md` | M | document `/note/[slug]`, resolution rules, edit/save, no-commit-until-F9 note | docs match shipped behavior; build still green |

## AC verification matrix (the parent card's 4 acceptance criteria)

| # | Acceptance criterion | Automated evidence (`npm run test`) | Live evidence (quickstart) |
|---|---|---|---|
| **AC1** | `[[` autocomplete: filter-as-you-type, keyboard-selectable | `wikilink-client.test.ts`: `extractQuery`/`filterCandidates`/`moveSelection`/`acceptSelection`; `autocompleteKeyCommand` returns null for all 5 keys when popup closed and matches no printable key in the full sweep; insertion replaces the construct with `[[Title]]` | Browser: type `[[` → popup < 200 ms; Down/Up move selection; Enter/Tab insert; Esc closes popup only; with popup closed the same keys do nothing app-level |
| **AC2** | Save recomputes backlinks panel (referencing note + link text) | `api/note.test.ts`: `200.backlinks` reflects the just-saved body immediately (D6 in-handler recompute); `render.test.ts` renders panel rows from index data; no manual refresh anywhere in the flow | Browser: edit note → add `[[Other]]` → Save → land back in read mode → open `Other` → panel lists this note + link text, elapsed < 500 ms view |
| **AC3** | Pending link creates the note on first click | `wikilink-client.test.ts`: `pendingCreateDecision` in-flight guard + 201/409/error branches; F2's `capture.test.ts`/`api/capture.test.ts` prove title-only create → `seed`/`private`/unique slug and 409 collision | Browser: click pending marker → exactly one note (title = target) created → navigated to `/note/<slug>`; double-click fast → one note; external conflict case navigates to existing note |
| **AC4** | Case-insensitive + slug-equivalence resolution | `notes.test.ts` tier matrix (incl. `[[Retrieval Practice]]`→`retrieval-practice`, `[[cafe society]]`→`cafe-society` — both null before this change) + `render.test.ts`/panel parity through the shared resolver | Browser: fixture vault with the probe's edge titles renders all canonical variants as the same anchor; pending marker only when all 3 tiers miss |

Supporting SCs: **SC-001** view < 500 ms = quickstart timing; **SC-003** = tier matrix + shared-resolver parity tests; **SC-006** keyboard sweep live; **SC-007** loopback check; **SC-008** conflict tests (`409` keeps disk + buffer, `force` only via explicit branch).

## Validation & Quickstart (Phase 1 run guide)

Prerequisites: Node ≥ 20, no network after install, `GARDEN_VAULT_DIR` for hermetic runs. Run from the build worktree (`/opt/data/mnt/workspace/digitalGarden/.worktrees/t_5927eb0f`).

```bash
npm install                 # also materialises @types/markdown-it
npm run test                # expect: all suites green — F1/F2 suites untouched + new render/wikilink/api-note suites
npm run build               # expect: exit 0
```

API smoke (hermetic — never touches the repo `vault/`):

```bash
VAULT=$(mktemp -d) && git -C "$VAULT" init -q
GARDEN_VAULT_DIR="$VAULT" npm run dev        # Local http://localhost:4321/
# seed two notes via the F2 capture endpoint, then:
# 1) POST /api/note {"slug":"alpha","body":"See [[beta-note]].","baseHash":"<from page>"}  -> 200 + backlinks {"beta-note":[…]}
# 2) edit the file behind the app's back, re-POST with the stale baseHash                  -> 409 external-edit-conflict, file unchanged
# 3) re-POST with "force":true                                                            -> 200
# 4) POST /api/note with unknown slug                                                     -> 404 ; GET -> 405 ; bad payload -> 400
# 5) git -C "$VAULT" log --oneline                                                        -> NO commit from the edit save (Q4)
# 6) POST /api/capture {"title":"Future Idea"} twice                                       -> 201 then 409 (pending-create contract)
```

Browser checklist (scripted, `executablePath: '/opt/hermes/tools/chromium-1208/chrome-linux/chrome'`, R8; run from scratch — no files added to the repo):

1. Open `/note/<alpha>` → rendered body + pending marker for unresolved targets; panel rows correct; **view < 500 ms** (DevTools timing).
2. Edit → type `[[` → popup within 200 ms → filter → Down/Up → Enter inserts `[[…]]`; Esc closes popup only; dirty Esc prompts; Save → read mode; open the target → panel updated (AC2).
3. Click pending marker → created note with title/slug/`seed`/`private` → navigated; double-click → exactly one (AC3).
4. Canonical variants render identically; `[[cafe society]]` resolves (AC4).
5. Keyboard: Tab reaches Edit/Save/Cancel/popup rows/conflict buttons/pending markers; no bare-key hijacks.
6. External-edit conflict flow: stale hash → 409 → both controls work, nothing lost until chosen.
7. Loopback: no non-loopback listener for the app port (`awk '$4=="0A"{print $2}' /proc/net/tcp{,6}`), no `--host` anywhere.

Cleanup: stop dev; temp vaults under `mktemp`/`TMPDIR`. Verification as written creates **zero** commits on the build branch (D9; the only git activity is F2's capture-commit inside the throwaway vault). The repo's own `vault/` is never written.

---

## Risks & spec-internal tension (resolved here, not re-opened)

- **Touching `notes.ts`** is the one F3 edit to F1's module: confined to `resolveWikiLink`, additive only (misses→hits), guarded by keeping the full F1 suite green. Any reviewer seeing a `notes.ts` diff should check it is exactly that hunk.
- **Capture-endpoint reuse (R5)** couples F3 to F2's `saveCapture` semantics: if F2's contract ever changes (e.g. capture stops committing), pending-create inherits it. Recorded in the contract section so nobody "simplifies" it into a third endpoint without re-running ANALYZE.
- **Reload-after-save UX**: `location.reload()` resets scroll and closes edit mode — chosen deliberately (server re-render = AC2 proof, zero client markdown); a no-reload upgrade can consume the `200.backlinks` payload already in the contract.
- **Render/index parity is tested, not assumed**: `render.test.ts` asserts the rendered link set equals `extractWikiLinks(body)` on fixtures covering code/fence/`#`/empty/alias cases; the shared resolver covers the resolution side (FR-003).
- **Backslash-escape divergence** (spec edge): rendering honors Markdown escapes, the index does not — accepted and documented; changing `extractWikiLinks` is explicitly out of scope.
- **Duplicate titles** make tier-2/tier-3 ambiguous by nature → smallest-slug tie-break (deterministic, tested) + slug shown in popup rows.
- **Shared-file chains for fan-out**: `src/pages/note/[slug].astro` and `src/lib/wikilink-client.ts` each accumulate across stories — one worker per chain, in order (tasks.md spells this out) to avoid write collisions.
- **`@types/markdown-it`** is the only dependency churn; if its peer range ever conflicts with the locked `markdown-it@15.0.2`, fall back to a local `declare module 'markdown-it'` shim (build is type-advisory anyway).
- **5,000-note view budget**: fresh index read per view may exceed 500 ms only at PRD scale; trigger point and follow-up recorded in R7 rather than speculative caching now.

## Complexity Tracking

> Fill only if the Constitution Check has violations to justify — it has none (unfilled template, no gates). Additions beyond D1–D9 are recorded under Research R1–R8 and the Interface Contracts instead.

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| `markdown-it` inline rule (`render.ts`) | F3 must render `[[…]]` with code protection identical to F1's extractor | regex pre-pass needs `html:true` and re-implements code-protection, diverging from the index |
| `notes.ts` `resolveWikiLink` extension | D3's proven gap — without it AC4 and backlinks silently fail for slug-equivalent targets (probed) | renderer-local fix would create the exact render/index divergence FR-003 forbids |
| New `POST /api/note` endpoint | browsers cannot write files (F2's R1 applies to edits too) | saving from the page script would need a second server anyway; HTML form post cannot carry the snapshot-hash/409 contract |
| Embedded page-data JSON | save needs the load-time hash; autocomplete needs candidates | a `GET /api/notes` endpoint adds a contract for data the page already holds |
| `@types/markdown-it` devDep | `markdown-it` ships no types; keeps `npx tsc --noEmit` honest | ambient `declare module` shim is less precise (kept as fallback) |

## ANALYZE verdict

**ANALYZE: yes — a read-only architecture review pass is warranted before implementation.**

Reason: the plan necessarily fixes contracts and a behavioral change that D1–D9 do not spell out — (1) the `POST /api/note` save schema (409-conflict/200-backlinks/force semantics), (2) the embedded page-data shape, (3) the three-tier `resolveWikiLink` change inside F1's module (cross-feature surface: F5/F12/F19 will inherit it), and (4) the cross-feature reuse of `POST /api/capture` as the pending-create contract. A read-only pass should bless these four; nothing in the plan re-opens D1–D9 or the 5 recorded clarifications.

## Out of scope for this step

No code, no `tasks.md`, no commits/push/PRs, no board-status changes, no writes outside this worktree's `specs/f3-wiki-links/`. Follow-on: `/speckit.tasks` (Phase 2), then the analyze-equivalent cross-artifact report, then the orchestrator's implement/converge/critic/tester chain with `ANALYZE: yes` feeding the review pass.
