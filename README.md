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

## Quick start

```bash
npm install
npm run dev      # local dev server
npm run build    # static build into dist/
```
