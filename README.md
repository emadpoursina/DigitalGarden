# DigitalGarden

A personal, local-first knowledge tool: a folder of interconnected Markdown
notes with a browser-based editor, automatic backlinks, full-text search, and
a gentle note-maturity model (seed → growing → evergreen). Private by default;
selective static publishing comes in v1.1.

- **Stack:** Node.js + Astro 7 (SSR build + local dev UI), CodeMirror 6
  editor, Minisearch client-side index, simple-git history, markdown-it.
- **Vault:** plain Markdown files with YAML frontmatter live in `vault/` —
  portable, greppable, and yours.
- **Workflow:** development is planned and tracked through the project's
  Hermes Kanban board; see `PRD.md` (v1.0) for the full spec and
  `AGENTS.md` for project rules.

## Note storage (F1)

Notes are plain UTF-8 Markdown files with YAML frontmatter
(`title, slug, tags, status, visibility, created, updated`) in `vault/`.
All persistence goes through `src/lib/notes.ts`: create/read/update with
URL-safe auto-unique slugs (a save that would claim another note's slug is
rejected), archive (`status: archived`, file kept), delete (recoverable move
to `vault/.trash/`), snapshot-based external-edit detection, and one-pass
index refresh (`refreshVaultIndex`) feeding the future search/tag/backlink
consumers (F3/F5/F6). Tests: `npm test`.

## Quick capture (F2)

The capture loop is a single round trip:

1. **Open it** — press `c` on the dashboard (`/`), or go straight to `/new`.
   The title field is focused on load; bare keys type, `c`/`s` are inert
   while you are typing, and the shortcut never fires inside inputs.
2. **Fill it** — a title (required), a body, and tags (`alpha, alpha, beta`
   → deduped, lower-cased to `[alpha, beta]`).
3. **Save it** — `Ctrl+Enter` (or the Save button) POSTs
   `POST /api/capture` with `{title, body, tagsText, mode:'new'}` and
   redirects to `/`, where the new `seed` note is first in Recent Notes.

What the save does: F1's `createNote` writes the file as `status: seed` /
`visibility: private` with a slugified, collision-checked slug, then
simple-git commits it as `docs(note): capture <slug>` (target < 1 s).

Edges you will actually hit:

- **Slug collision → HTTP 409**, draft fully preserved, with two keyboard-
  reachable choices: **Save as new** (re-submits with `mode:'unique'` →
  `…-2` slug) or **Open existing** (navigates to `/note/<slug>`).
- **Empty/whitespace title → HTTP 400** shown inline, nothing written.
- **`Esc` with a draft** prompts (`Discard this capture?`): Cancel keeps you
  on `/new` with the draft and focus back on the title; OK discards and
  returns to `/`. `Esc` on an empty form returns to `/` instantly.
- **Git degraded** (no identity, or a vault that is not a git repo): the
  capture is still written to disk, the response carries
  `git.committed:false` with the git reason, and the dashboard shows the
  "git history is unavailable" banner **once per session** — a reload clears
  the warn-once flag, and a later failure warns again.

Response contract: `201 {slug, status, git:{committed, reason?}}`,
`409 {error:'slug-conflict', slug}`, `400 {error:'title-required' |
'invalid-payload'}`, `500 {error:'save-failed', message}`, `405` on GET.

## Reading, wiki-links & backlinks (F3)

`/note/<slug>` is the reading view: server-rendered Markdown with a
Backlinks panel beside it, a raw-Markdown edit surface, `[[` autocomplete
and click-to-create pending links. Unknown slugs answer `404` with a
friendly page (no stack trace).

**Canonical resolution (spec FR-003).** A `[[target]]` resolves
case-insensitively in three tiers — the first tier with a match wins, and
ties inside a tier break to the lexicographically smallest slug:

1. **exact slug** — `[[retrieval-practice]]`
2. **exact title** — `[[Retrieval practice sessions]]`
3. **slugify equivalence** — `[[Retrieval Practice]]`,
   `[[RETRIEVAL-PRACTICE]]` and `[[cafe society]]` (accents/punctuation
   collapsed) land on `retrieval-practice` / `cafe-society`

Only a genuine miss at all three tiers stays unresolved. One function
(`resolveWikiLink` in `src/lib/notes.ts`) drives rendering, the backlink
index and link insertion, so the three can never disagree.

**Rendering (`src/lib/render.ts`).** `[[target]]` / `[[target|alias]]`
become links to `/note/<slug>` with the alias as the display text when
written; unresolved targets become focusable pending markers carrying
`data-target`. `[[#heading]]`, `[[]]` and whitespace-only targets stay
literal (matching F1's extractor), `[[..]]` inside code spans/fences stays
code, and raw HTML in a body is escaped — never executed.

**Backlinks panel.** One row per inbound link occurrence: the referencing
note's title (a link to its view), its status (archived visibly flagged)
and the link text as written. Self-links, unresolved links and trashed
notes are excluded by F1's index; archived sources stay in it (D4). The
index is recomputed per view **and** on every save: `POST /api/note` calls
`refreshVaultIndex()` inside the same request and answers with the fresh
`backlinks` object, so a saved link shows up on the target's next view with
no manual rebuild step anywhere.

**Editing & saving.** `Edit` swaps in a raw-Markdown textarea prefilled
with the source — body only (status has its own control since F4, below;
title/tags editing belongs to F8).
`Save` POSTs `{slug, body, baseHash, force?}` and reloads read mode from
disk; `Esc`/`Cancel` confirm first when the buffer is dirty, and leave it
alone when it is clean. If the file changed on disk while you were editing,
the save answers `409 external-edit-conflict` and the page shows two
keyboard-reachable choices — **Reload from disk** (confirms first, discards
your buffer) or **Overwrite** (`force: true`, the only source of `force`) —
and neither side is touched until you pick one. F4 routes the status
control through this **same** conflict box and the same two choices.

**Autocomplete & pending links.** Typing `[[` in the editor opens a popup
of existing titles, filtered case-insensitively as you type (row 1 is the
default selection; duplicate titles show their slug). Up/Down/Enter/Tab/Esc
act **only while the popup is open** — with it closed those keys are inert,
and no printable key is ever intercepted. Clicking a pending marker creates
exactly one note through `POST /api/capture` (title = the target, `seed` /
`private`, empty body) and navigates to its view; a slug collision
navigates to the existing note instead of overwriting, and a failure shows
an inline error and changes nothing.

`POST /api/note` response contract: `200 {slug, status, updated, backlinks}`
(`status` added by F4 — see below), `409 {error:'external-edit-conflict',
disk:{updated, hash}}`, `404 {error:'note-not-found', slug}`,
`400 {error:'invalid-payload'}` (bad or incomplete payload, nothing written),
`500 {error:'save-failed', message}`, `405` on GET.

> **Known gap until F9:** edit saves write the file but create **no git
> commit** — commit-on-save (with its settings toggle and push) is F9's
> acceptance criterion. Quick captures still commit
> (`docs(note): capture <slug>`), so between F3 and F9 edits are on disk
> but missing from git history. This is deliberate, not an oversight.

## Note lifecycle states (F4)

Every note carries one of four lifecycle states — `seed`, `growing`,
`evergreen`, `archived` (`NOTE_STATUSES` in `src/lib/notes.ts`). A note
created without a status is a **`seed`** (F1 default, now regression-locked
by tests), and a file with an out-of-enum status is rejected as corrupt
rather than silently accepted. Nothing here adds a persistence layer:
status stays an ordinary frontmatter key in the same Markdown file.

**Changing status from the note view.** `/note/<slug>` has a `Status`
`<select>` beside the badge (the badge itself is unchanged — it now links to
`/status/<state>`). It **posts on change** through the very same
`POST /api/note` contract as a body save: same snapshot check, same single
`409` conflict box (Overwrite retries the payload with `force: true`,
Reload takes the disk copy), same inline errors. The select is **disabled
while edit mode is open and while any save is in flight** (so a status post
can never stale the body editor's snapshot), re-selection of the value
already on disk posts nothing, a `400`/`500` reverts the select to the
value on disk, and a `200` reloads the view so the badge, the state lists
and the dashboard all re-render from disk.

**Extended `POST /api/note`.** The endpoint accepts
`{slug, baseHash, force?, body?, status?}` with **at least one of
`body`/`status`**; an omitted field keeps its on-disk value, so a
status-only save can never clobber a body edited elsewhere (and vice
versa), and `status` outside the enum is a `400 invalid-payload` decided
before anything touches the vault. The `200` body is now
`{slug, status, updated, backlinks}`. Validation order: JSON → object →
`slug` → `baseHash` → presence rule → field types → `status` ∈ enum →
slug shape → vault ops.

**`/status/<state>`.** A shared browse route: `/status/seed`,
`/status/growing`, `/status/evergreen` and `/status/archived` list exactly
the notes in that state, newest-updated first, with a param-driven heading
and empty-state sentence (each state words its own copy). An unknown state
is a friendly `404` (no stack trace, link back to the dashboard). The page
reads notes one at a time and skips a malformed file, so one broken note
never takes a list view down — the direct note view still fails loudly on
the same file, which is the shipped F3 asymmetry, not a regression.

**Dashboard.** `Seeds needing attention` sits under Recent notes: the
`seed` notes least-recently-updated first, capped at five
(`SEEDS_ATTENTION_LIMIT`), heading linked to `/status/seed`. All dashboard
row titles link to `/note/<slug>` and all status badges link to
`/status/<state>`; the Recent-notes badges link the same way.

**Commits.** Status saves write the file and create **no git commit** —
same rule as F3's body saves: commit-on-save is F9's acceptance criterion.
F2 quick captures still commit (`docs(note): capture <slug>`).

## Full-text search (F5)

**`/search`.** A server-rendered view on the Base layout: the server reads
the vault one note at a time (the same tolerant loop as the dashboard — a
malformed file is skipped, it never 500s the page), embeds the resulting
`SearchDoc[]` as a JSON island, and the browser builds a **MiniSearch**
index from it (`src/lib/search.ts`). Nothing is written to disk and
**search never creates a commit**: it is a read-only surface, and it adds no
endpoint and no save hook of its own.

**Index and rows.** Indexed fields are `title` (boosted ×2), `body` and
`tags` (tag arrays are joined with spaces so tag terms tokenize), with
`slug` as identity and `title`/`slug`/`tags`/`status` stored for display.
Each row shows the title link (`/note/<slug>`), the slug, the tags, an
escaped ~160-character snippet with a `<mark>` around the first body hit
(title/tag-only hits fall back to the leading excerpt, unmarked), and an
`archived` badge when the archive filter surfaced it. **Archived notes stay
in the index** and are hidden until `Include archived` is ticked;
`visibility` is carried but never filtered on localhost.

**Shortcut.** `Ctrl-K` / `⌘-K` opens `/search` from every view — dashboard,
capture, note, status list and search itself (on `/search` it just refocuses
the input). The predicate lives in `src/lib/search-shortcut.ts` and each
page's own `<script>` wires it, so `Base.astro` stays untouched and a bare
`k`/`K` typed anywhere still only types (modifier-only rule, PRD §10).

**Freshness.** The next `/search` load always reflects the disk state —
edits, deletes and status changes ride the existing generic
`refreshVaultIndex` hook, which F5 deliberately does **not fork** (F6
consumes the same hook). For the open tab there is a second, in-memory
layer: when the tab becomes visible again the page re-reads its own
document (same-origin GET of `/search`, no new endpoint) and patches the
live index with `upsertDoc`/`removeDoc` + `replace`/`discard`, so results
update without a reload and agree with a fresh load.

**Keyboard.** ArrowUp/Down and Enter are bound by **one listener on the
results panel** (`role="listbox"`), routed through
`resultsKeyCommand({key, panelFocused})`; focus in the input or anywhere
else keeps fully native key behavior — there is no document-global arrow or
Enter binding anywhere in the feature path.

**Performance (Q4 protocol).** On a deterministic seeded 1,000-note vault
(1,004 healthy docs + 1 corrupt file skipped), scripted Chromium measured
keystroke → rendered results over 5 queries (title-hit, body-hit, tag-hit,
multi-word, zero-match) × cold load + 3 warm re-types: **p95 = 107 ms**
(min 101 / median 102 / max 108) against a 300 ms budget.

## Tag browsing (F6)

**`/tags` — the tag index.** One row per canonical tag (trimmed, lowercased —
`AI` / `ai` / ` padded ` all merge into one row with the merged count), sorted
in code-unit order, each row a link to that tag's list. The page reads the
vault one note at a time (the same tolerant loop as the dashboard and status
list: a malformed file is skipped, it never 500s the view), rebuilds the tag
index from disk on **every request** and renders — no cache, no hook, no
reindex step. A vault with no tags answers `200` with
`No tags yet — add a tag to a note to grow this index.`, never a 404.
Archived notes are counted exactly like live ones (no archive filter in v1).

**`/tags/<tag>` — notes for one tag.** Matching is case-folded
(`/tags/AI`, `/tags/Ai` and `/tags/ai` show the same list), rows are
newest-`updated` first with `slug` ascending as the tie-break, and each row
carries the title link (`/note/<slug>`), the status badge (page-scoped copy of
the `.badge[data-status]` idiom) and a `<time datetime>`. The heading and the
empty sentence name the **raw** URL segment as you asked for it (`/tags/AI`
says "AI" while listing the `ai` members). An unknown tag — never used, or
just removed from every note — answers `200` with
`No notes tagged “<tag>” yet.`; there is no 404 branch in the tag path.

**URL contract.** Rows are built with `tagHref` = `/tags/` + one
`encodeURIComponent`-ed segment, and the route decodes with `decodeTagParam`
(`decodeURIComponent`, `URIError` → raw input, then lowercase) — so `C++`,
`a/b`, `50%`, `café` and emoji round-trip, and a decoding miss lands on the
empty state instead of an error. Note the frame around that contract: a URL
whose percent-escapes are *malformed* (`/tags/50%`, `/tags/%E0%A4%A`) never
reaches the app at all — Astro's own dev middleware
(`trailing-slash.js` → `decodeURI`) answers `500` in `astro dev`, and the node
adapter's request guard (`standalone.js` → `decodeURI`) answers `400` in the
built server. F6 code is never invoked for those requests, and its own
decoding is unit-tested to never throw (`src/lib/tags.test.ts`).

**Navigation.** `Base.astro` carries exactly one new landmark,
`<nav id="site-nav" aria-label="Sections">` with
`<a href="/tags" id="tags-entry">Tags</a>` above `<slot/>` — a native link, so
it is Tab-reachable with a visible focus ring from every view and adds **zero**
key handlers anywhere in F6. `Ctrl/⌘-K` is unchanged (F5's per-page shortcut).

**Freshness (AC3).** Because both tag routes rebuild the index per request
from a fresh read, a tag removed from every note is gone from `/tags` on the
very next load and `/tags/<old>` immediately answers the empty state — no
manual reindex, no second hook. The same rule is regression-locked in
`src/lib/tags.test.ts` (through the real `buildTagIndex`, not a mock index).

**Selection lives in `src/lib/tags.ts`** (pure, DOM-free, fs-free):
`getAllTags`, `getNotesForTag`, `tagHref`, `decodeTagParam`. Pages do no
inline sorting or filtering — the only page-level transform is `.map()` to
display rows — so the ordering discipline stays unit-testable without a
browser. `src/lib/notes.ts` and the F4/F5 surfaces are untouched.

**Limitations (accepted, recorded).** A tag literally named `index` is
delegated back to the index page at `/tags/index` (D3 wins, so that tag's list
is unreachable by URL). The direct note view still fails loudly on a corrupt
file — the shipped F3 asymmetry: list views skip it, `/note/<slug>` does not.
Measured on a 1,000-note vault, both views render in ~120–270 ms (`/tags`) and
~135–165 ms (`/tags/<tag>`) against the 500 ms budget.

## Vault location (`GARDEN_VAULT_DIR`)

`src/lib/vault.ts` → `resolveVaultDir()` is the only place in the app that
decides where the vault lives:

- `GARDEN_VAULT_DIR` set to a non-blank value → that directory, used
  verbatim (leading/trailing whitespace alone counts as blank).
- otherwise → `<cwd>/vault`, the repository's own vault.

Every consumer (dashboard, `/api/capture`, tests) imports it, so switching
vaults is one environment variable — which is how verification stays
hermetic:

```bash
VAULT=$(mktemp -d) && git -C "$VAULT" init -q   # temp vault with its own history
GARDEN_VAULT_DIR="$VAULT" npm run dev
```

Captures write note files **and** real `docs(note): capture <slug>` commits
into whichever vault is active, so keep test runs on a temp vault unless you
deliberately want commits on the feature branch.

## Run model (F2)

Since F2 the app is server-rendered, not a static build:

- `astro.config.mjs` sets `output: 'server'` with
  `adapter: node({ mode: 'standalone' })` — `/`, `/new`,
  `/note/<slug>` and the `POST /api/capture` + `POST /api/note`
  endpoints are on-demand routes.
- `npm run build` writes `dist/server/` (server entry + app) and
  `dist/client/` (bundled assets).
- **Loopback only.** The server binds `localhost`; `astro dev` prints
  `Network use --host to expose` — never use it, never set
  `server.host: true` in `astro.config.mjs`, and no npm script passes
  `--host`. A running instance listens on the loopback interface only.

## Quick start

```bash
npm install
npm run dev       # local dev server → http://localhost:4321/
npm run test      # vitest suite
npm run build     # SSR build into dist/server + dist/client
```

Run the built app:

```bash
npm run build
npm run preview                              # astro preview serves the build
PORT=4321 node dist/server/entry.mjs         # …or the standalone server directly
```
