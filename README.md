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
