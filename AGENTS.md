# Project rules — digitalGarden

## Project context

- **Purpose:** Digital Garden — a personal, local-first knowledge tool: a
  folder of interconnected Markdown notes with a browser-based editor,
  automatic backlinks, full-text search, and a note-maturity model
  (seed → growing → evergreen). Private by default; selective static
  publishing is v1.1. Spec: `PRD.md` at repo root (v1.0, 2026-10-14).
- **Stack:** Node.js + Astro 7 (SSG + local dev UI), CodeMirror 6 editor,
  Minisearch client-side index, simple-git history, markdown-it parsing —
  per `PRD.md` §9. Validation is `npm install` + `npm run build`
  (`.ainative/project.yaml`); the tester state runs them.
- **Layout:** Repo root holds `PRD.md`, `IDEA.md`, `README.md`,
  `.ainative/project.yaml`, plus the Spec Kit layout (`.specify/`,
  `.opencode/commands/speckit.*.md`) for the spec/plan/tasks workflow.

## Workflow

- Work is submitted through this project's Hermes Kanban board
  (`hermes kanban --board digitalgarden ...`).
- Follow the card's `## Path` and the workflow stage assigned by Hermes.
- Keep `validation_commands` in `.ainative/project.yaml` accurate; the tester
  state runs them for managed work.
- For a `feature`, follow the spec/plan/tasks workflow and its reviews. A
  `change` is already specified; a `job` runs only its named skill.
- Ask rather than guessing when a consequential project decision is unclear.
- Update related project documentation when behavior or interfaces change.
