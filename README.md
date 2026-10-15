# DigitalGarden

A personal, local-first knowledge tool: a folder of interconnected Markdown
notes with a browser-based editor, automatic backlinks, full-text search, and
a gentle note-maturity model (seed → growing → evergreen). Private by default;
selective static publishing comes in v1.1.

- **Stack:** Node.js + Astro 7 (static build + local dev UI), CodeMirror 6
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

## Quick start

```bash
npm install
npm run dev      # local dev server
npm run build    # static build into dist/
```
