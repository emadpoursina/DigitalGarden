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
  `adapter: node({ mode: 'standalone' })` — `/`, `/new` and
  `POST /api/capture` are on-demand routes.
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
