# Product Requirements Document: Digital Garden

**Version:** 1.0
**Date:** 2026-10-14
**Status:** Draft
**Author:** PRD Writer Agent (Hermes), based on discovery with the operator

---

## 1. Executive Summary

Digital Garden is a personal, local-first knowledge tool: a folder of interconnected Markdown notes with a browser-based editor, automatic backlinks, full-text search, and a gentle note-maturity model (seed → growing → evergreen). Unlike a blog, it optimizes for capturing rough thoughts quickly and letting them mature over months and years — notes can be incomplete, and nothing is public unless explicitly published. The primary user is the operator themself; a curated subset of notes can later be published to a static public website (v1.1), but the core loop — capture, connect, refine, find — works entirely offline on private local files, with git providing version history and backup.

## 2. Business Model

| Element | Detail |
|---------|--------|
| **Who** | The operator — a developer/knowledge worker maintaining a long-lived personal wiki; no external customers in v1 |
| **Problem** | Notes are scattered across apps; blog-style publishing forces premature polish; existing notes decay because nothing links them together and nothing makes revisiting easy |
| **Solution** | A local Markdown vault with frictionless capture, wiki-links with automatic backlinks, topic/tag navigation, full-text search, and maturity states — plus optional selective publishing of public notes to a static site |
| **Name** | Digital Garden (working title; repo `digitalGarden`) |

## 3. User Personas

### Primary Persona: The Gardener (the operator)

- **Who they are**: A developer/knowledge worker who reads widely, takes lots of notes, and wants a system that stays useful over years rather than days.
- **Goals**: Capture a thought in seconds; find any old note in seconds; see how ideas connect; let notes mature without a publish-or-perish workflow.
- **Pain points**: Blogs feel performative (everything must be finished); note apps become graveyards (no links, no revisit prompts); cloud note apps conflict with "private by default."
- **Context**: Daily, at a desk, in a terminal + browser workflow; occasionally reviewing the garden on a tablet.

### Secondary Persona: The Visitor (v1.1+)

- **Who they are**: A reader who arrives via search, a shared link, or an RSS feed after the operator publishes selected notes.
- **Goals**: Read a clear, well-linked article; discover related notes in the same garden.
- **Pain points**: Paywalls, broken links, and pages that leak the author's private draft structure.
- **Context**: Any browser, often mobile; first impression is the public garden homepage.

## 4. User Journeys

### Journey 1: Capture a Thought (v1 core)

1. The Gardener has an idea mid-reading session and opens the garden (local URL bookmarked / launcher hotkey).
2. From the dashboard they hit the quick-capture shortcut; a single input field is focused immediately.
3. They type a title, a sentence or two of raw Markdown, and optionally 1–2 tags; note defaults to `seed` and `private`.
4. They hit save; the note is written to disk and git-committed within 1 second.
5. The dashboard's "recent notes" list now shows the seed — the thought is safe, in under 30 seconds total.

### Journey 2: Connect Ideas (v1 core)

1. The Gardener opens an existing note from search or the dashboard.
2. While editing, they type `[[` and pick a related note from the autocomplete list (or type a new title to create it).
3. On save, the linked note's backlinks panel now lists this note automatically.
4. Opening the linked note shows the new backlink with context — the two ideas are now joined in the network.

### Journey 3: Find a Note (v1 core)

1. The Gardener half-remembers a note ("something about retrieval practice").
2. They press the search shortcut; the search view opens with the input focused.
3. Full-text search returns matching notes with title, snippet, and tags in under 300 ms.
4. They open the right note from the results — or refine by tag if too many results.

### Journey 4: Curate and Promote (v1 core)

1. Once a week, the Gardener opens the dashboard's "seeds needing attention" list.
2. They pick a seed, expand it with new links and paragraphs, and change its status to `growing`.
3. Months later, after further refinement, they mark it `evergreen`; the note surfaces in the "evergreen" browse view as a finished explanation worth sharing.

### Journey 5: Publish Selectively (v1.1)

1. The Gardener marks a note `visibility: public` (leaving everything else private).
2. They run the publish build; the static site generator renders only explicitly-public notes.
3. A CI check verifies no private note titles, slugs, or content appear in the output or search index.
4. The public garden homepage and the note's page update on the hosted static site; unpublishing reverts step 2–4.

## 5. Feature Set

### MVP (Must-Have) — v1

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| F1 | Note storage & CRUD | Markdown files with YAML frontmatter (title, slug, tags, status, visibility); create, edit, archive, delete | P0 |
| F2 | Quick capture | One shortcut from the dashboard to a focused single-field capture; auto-slug, defaults `seed`/`private` | P0 |
| F3 | Wiki-links & backlinks | `[[Title]]` internal links with autocomplete; backlinks panel computed automatically on every save | P0 |
| F4 | Lifecycle states | `seed` / `growing` / `evergreen` / `archived` as frontmatter metadata, settable per note, filterable | P0 |
| F5 | Full-text search | Client-side index over title + body + tags; fast fuzzy search with snippets | P0 |
| F6 | Tags & browsing | Tag index page, per-tag note lists, browse-by-status views | P0 |
| F7 | Privacy model | Private by default; explicit `visibility: private \| public` per note; nothing public renders in v1 | P0 |
| F8 | Local web UI | Dashboard, reading view, side-by-side Markdown editor with live preview, keyboard-first navigation | P0 |
| F9 | Git-backed version history | Auto-commit on save with conventional messages; git is the audit trail and backup channel | P0 |

### V1.1 (Should-Have)

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| F10 | Selective publishing | Static build of public notes only, to GitHub Pages/Netlify; unpublish = flip visibility + rebuild | P1 |
| F11 | Visual knowledge graph | Interactive node graph of notes and links, filterable by tag/status | P1 |
| F12 | Orphan detection | "Unlinked notes" report listing notes with no inbound links, with one-click link insertion | P1 |
| F13 | Curated entry points | Maps-of-content notes and a public homepage with curated collections | P1 |

### Future (Nice-to-Have)

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| F14 | RSS/Atom feed | Feed of newly published public notes | P2 |
| F15 | Backlink context previews | Show the sentence around each backlink, not just the title | P2 |
| F16 | Global quick-capture hotkey | OS-level hotkey → capture window, works outside the browser | P2 |
| F17 | Attachments | Image/asset management with relative-path portability | P2 |
| F18 | Public search | Client-side search over public notes only on the published site | P2 |
| F19 | Note merge workflow | Merge two notes with link rewriting and redirect stubs | P2 |

## 6. Page / Screen List

```
/ (local app)
├── Dashboard                     — recent notes, seeds needing attention, quick stats
├── /new                          — quick capture (single-field editor)
├── /note/[slug]                  — reading view: rendered note, backlinks panel, metadata
│   └── edit mode                 — side-by-side Markdown editor + live preview
├── /search                       — search results (title, snippet, tags)
├── /tags                         — tag index
│   └── /tags/[tag]               — notes by tag
├── /status/[state]               — notes by lifecycle state (seed/growing/evergreen/archived)
├── /settings                     — vault path, theme, autosave/commit behavior
├── /graph                        — (v1.1) interactive knowledge graph
├── /unlinked                     — (v1.1) orphan notes report
└── /maps/[slug]                  — (v1.1) curated maps of content

/ (public site, v1.1 — built from public notes only)
├── /                             — public garden homepage with curated collections
├── /n/[slug]                     — published note (cross-links to other public notes)
├── /tags/[tag]                   — public tag pages
└── /feed.xml                     — (v2) Atom feed
```

## 7. Functional Requirements

### F1: Note Storage & CRUD

**User Story:** As the Gardener, I want every note to be a plain Markdown file with structured metadata, so that my knowledge stays portable, greppable, and mine.

#### Acceptance Criteria

1. WHEN the user creates or saves a note, THE System SHALL write a UTF-8 Markdown file with YAML frontmatter (title, slug, tags, status, visibility, created, updated) to the configured vault directory.
2. WHEN the user supplies a title, THE System SHALL derive a URL-safe unique slug automatically and reject a save that would overwrite a different note's slug.
3. WHEN the user archives a note, THE System SHALL set `status: archived` while retaining the file and its links.
4. WHEN the user deletes a note, THE System SHALL move it to a trash directory (recoverable) and remove it from search, tag, and backlink indexes on next index refresh.
5. IF the vault file changes on disk outside the app (external editor), THEN THE System SHALL reload the note and preserve the newer file content, warning if the in-app buffer has unsaved conflicting edits.

### F2: Quick Capture

**User Story:** As the Gardener, I want to record a thought in seconds, so that capture friction never makes me lose an idea.

#### Acceptance Criteria

1. WHEN the dashboard is shown, THE System SHALL focus a quick-capture input within one keystroke of the user invoking the capture shortcut.
2. WHEN the user submits a capture with only a title and body, THE System SHALL save it with `status: seed`, `visibility: private`, an auto-derived slug, and a git commit — all within 1 second of submission.
3. WHILE the capture dialog is open, THE System SHALL keep focus in the capture input, and single-letter keys SHALL type text, never trigger app commands.
4. IF the capture title already matches an existing note, THEN THE System SHALL offer to open that note or save as a new uniquely-slugged note.

### F3: Wiki-Links & Backlinks

**User Story:** As the Gardener, I want to link notes with `[[Title]]` and see inbound links automatically, so that my notes form a network without manual bookkeeping.

#### Acceptance Criteria

1. WHILE the user types `[[` in the editor, THE System SHALL show an autocomplete list of existing note titles, filtered as the user types, keyboard-selectable.
2. WHEN a note is saved, THE System SHALL recompute the backlinks index so that every referenced note's backlinks panel lists the referencing note with its link text.
3. WHEN a `[[Title]]` does not resolve to an existing note, THE System SHALL render it as a "pending" link that creates the note on first click.
4. THE System SHALL resolve links case-insensitively and treat slugs derived from identical titles as equivalent (canonical resolution rules per Open Questions).

### F4: Note Lifecycle States

**User Story:** As the Gardener, I want notes to declare how developed they are, so that I can tell at a glance what needs work and what is finished.

#### Acceptance Criteria

1. WHEN a note is created without an explicit status, THE System SHALL default it to `seed`.
2. WHEN the user changes a note's status, THE System SHALL update frontmatter on save and reflect the change in the note's badge, browse views, and dashboard lists.
3. WHEN the dashboard loads, THE System SHALL show a "seeds needing attention" list of `seed` notes sorted by least recently updated.

### F5: Full-Text Search

**User Story:** As the Gardener, I want instant full-text search over my whole vault, so that I can retrieve any idea without remembering where I filed it.

#### Acceptance Criteria

1. WHEN the user invokes the search shortcut (from any view), THE System SHALL open the search view with the input focused and no prior query required.
2. WHEN the user types a query, THE System SHALL return matching notes ranked by relevance with title and a context snippet, completing within 300 ms for a 1,000-note vault.
3. WHEN a note is edited or deleted, THE System SHALL update the search index within one save cycle.
4. WHILE the results panel is shown, arrow keys and Enter SHALL navigate and open results; these keys SHALL do nothing outside the results panel's focus scope.

### F6: Tags & Browsing

**User Story:** As the Gardener, I want to browse by tag and status, so that I can explore a topic from any of several entry points.

#### Acceptance Criteria

1. WHEN the user opens `/tags`, THE System SHALL list all tags with note counts, sorted alphabetically.
2. WHEN the user opens `/tags/[tag]` or `/status/[state]`, THE System SHALL list matching notes with title, status badge, and last-updated date.
3. WHEN a tag is removed from every note, THE System SHALL drop it from the tag index on the next index refresh.

### F7: Privacy Model

**User Story:** As the Gardener, I want privacy to be the default and publishing to be an explicit act, so that unfinished or personal thoughts can never leak by accident.

#### Acceptance Criteria

1. WHEN a note is created, THE System SHALL set `visibility: private` unless the user explicitly overrides it.
2. WHERE no publishing build exists (v1), THE System SHALL serve all notes only on localhost and never expose them to any network address other than the loopback interface.
3. WHEN a publishing build runs (v1.1), THE System SHALL include only notes with `visibility: public` in the output, sitemap, RSS feed, and search index.
4. IF a private note is linked from a public note (v1.1), THEN THE System SHALL render the link as plain text without title, target, or existence confirmation in the public output.

### F8: Local Web UI

**User Story:** As the Gardener, I want a calm, keyboard-friendly browser interface over my vault, so that editing feels like writing, not operating software.

#### Acceptance Criteria

1. WHEN the app starts, THE System SHALL serve the UI on `http://localhost:[port]` and be ready within 2 seconds.
2. WHEN a note view is open, THE System SHALL render the Markdown (headings, code blocks with highlighting, lists, tables, wiki-links) in a readable typographic layout.
3. WHEN the user enters edit mode, THE System SHALL show a side-by-side editor and live preview, autosaving on idle (default 2 s) and on explicit save.
4. All interactive controls (search palette, capture, editor toolbar) SHALL be reachable by keyboard alone; global shortcuts SHALL require a modifier (e.g. Ctrl/⌘-K) or an explicit command mode, and no bare printable character SHALL be bound globally.
5. THE System SHALL support light and dark themes and meet WCAG 2.1 AA contrast in both.

### F9: Git-Backed Version History

**User Story:** As the Gardener, I want every save captured in git history, so that I get undo, audit, and off-machine backup for free.

#### Acceptance Criteria

1. WHEN a note is saved, THE System SHALL stage and commit the change with a conventional message (`docs(note): update <slug>`), unless autosave-commit is disabled in settings.
2. WHEN git is unavailable or the vault is not a git repo, THE System SHALL still save the file and warn once that history/backup is degraded.
3. WHERE a remote is configured, THE System SHALL push at least daily (or on app close) so the private repo serves as backup.

### F10: Selective Publishing (v1.1)

**User Story:** As the Gardener, I want to publish chosen notes to a public static site, so that I can share finished ideas without maintaining a blog.

#### Acceptance Criteria

1. WHEN the publish build runs, THE System SHALL generate static HTML for every `visibility: public` note and nothing else.
2. WHEN the build completes, THE System SHALL deploy to the configured static host via git push/CI and make the site live.
3. IF any private slug, title, or content fragment is detected in the build output or search index, THEN the CI pipeline SHALL fail the deployment.
4. WHEN the user unpublishes a note (visibility → private), THE System SHALL remove its page, feed entry, and search index entry on the next build.

### F11: Visual Knowledge Graph (v1.1)

**User Story:** As the Gardener, I want to see my notes as a graph, so that I can discover structural clusters and lonely notes.

#### Acceptance Criteria

1. WHEN the user opens `/graph`, THE System SHALL render an interactive graph where each node is a note and each edge is a resolved wiki-link.
2. WHEN the user clicks a node, THE System SHALL navigate to that note.
3. WHEN the vault exceeds 500 notes, THE System SHALL keep initial render under 3 seconds (via level-of-detail or clustering).

### F12: Orphan Detection (v1.1)

**User Story:** As the Gardener, I want a list of unlinked notes, so that I can weave isolated ideas back into the network.

#### Acceptance Criteria

1. WHEN the user opens `/unlinked`, THE System SHALL list notes with zero inbound links, ordered by last updated.
2. WHEN the user selects a suggested connection, THE System SHALL insert a `[[link]]` into the chosen note with one confirmation step.

### F13: Curated Entry Points (v1.1)

**User Story:** As the Gardener, I want maps of content and a curated homepage, so that both I and my readers have guided paths through the garden.

#### Acceptance Criteria

1. WHEN a note is marked as a map-of-content (frontmatter flag), THE System SHALL list it in a "Maps" index.
2. WHEN the public homepage is built, THE System SHALL render only operator-curated collections and featured public notes — never an automatic full dump.

### F14–F19 (P2, specified at pickup)

1. WHEN a note is newly published, THE F14 feed SHALL include it with title, date, and summary (Atom, validated in CI).
2. WHILE backlinks are shown (F15), THE System SHALL display the containing sentence with the link highlighted.
3. WHEN the global hotkey is pressed (F16), THE System SHALL open a capture window focused for typing within 1 second, outside the browser.
4. WHEN an image is pasted (F17), THE System SHALL store it under the vault's asset directory with a relative path that survives git and publish.
5. WHEN public search runs (F18), THE index SHALL contain public notes only, verified by the same CI gate as F10.
6. WHEN two notes are merged (F19), THE System SHALL rewrite all inbound links to the surviving title and leave a stub note pointing to it.

## 8. Non-Functional Requirements

| Category | Requirement | Target |
|----------|-------------|--------|
| Performance | Search response (1,000-note vault) | < 300 ms |
| Performance | Note view render (local) | < 500 ms |
| Performance | Quick capture → saved + committed | < 1 s |
| Performance | App cold start | < 2 s |
| Availability | Local tool; no server SLA | N/A — must never block capture on any network service |
| Security | Network exposure | Bind loopback only; zero external endpoints in v1 |
| Security | Private content in public output | Zero (enforced by CI gate, F10.3) |
| Security | Data leaves machine | None in v1; publishing sends only public notes |
| Scalability | Vault size without UX degradation | 5,000 notes (benchmark before release) |
| Accessibility | WCAG level | 2.1 AA, keyboard-navigable editor and search |
| Portability | Vault format | Plain Markdown + YAML frontmatter, Obsidian-compatible links/frontmatter |
| Reliability | Data loss | Zero tolerance — every save is a git commit; daily push to private remote |

## 9. Tech Stack Recommendations

| Layer | Recommended | Rationale |
|-------|-------------|-----------|
| Storage | Markdown files + YAML frontmatter in a git repo | Directly from the idea doc; portable, greppable, diffable, survives the tool |
| Runtime / SSG | Node.js + Astro | Content collections over Markdown out of the box; same framework serves the local dev UI (v1) and the static public build (v1.1) |
| Editor | CodeMirror 6 (raw Markdown + live preview) | Edits the real Markdown source (no proprietary format), keyboard-first, fast; ProseMirror-style WYSIWYG rejected to keep files plain |
| Wiki-links | markdown-it / remark wiki-link plugin + build-time link graph | Standard `[[wikilink]]` syntax compatible with Obsidian vaults |
| Backlinks | Build-time + incremental in-app index (TypeScript) | Backlinks are a pure graph computation over parsed links; no database needed |
| Search | Minisearch (client-side index) | In-process, private, fuzzy; Pagefind better for the public site later — swap at F18 |
| Version history | git (auto-commit via simple-git) | Idea doc mandates git; commit-on-save gives undo + backup for free |
| Hosting (v1.1) | GitHub Pages (or Netlify) | Static output, free, git-triggered CI deploy; private repo keeps the full vault off-platform |
| CI/CD | GitHub Actions | Build + privacy gate (F10.3) + deploy on push |
| Monitoring | None for the local app; optional uptime check on the public site | A single-user local tool needs no telemetry — keeps the "no data leaves the machine" promise |
| Testing | Vitest (unit) + Playwright (editor, search, privacy-gate E2E) | The privacy gate in particular needs an automated regression test |

### Liberties and Alternatives

- **Astro over Eleventy**: chosen for TypeScript-first content collections and interactive islands (editor, graph). Eleventy is the lighter alternative if the build proves heavy.
- **CodeMirror over ProseMirror**: keeps notes as raw Markdown (portability, Obsidian compatibility) at the cost of not-WYSIWYG-while-typing.
- **Minisearch over Pagefind/FlexSearch**: best fit for the local private index; revisit for the public site (F18).
- **Deviation from idea.md**: the idea's MVP table included publishing in the initial scope; discovery confirmed publishing is deferred to v1.1 (F10) to ship the capture/connect loop first.
- **Assumptions**: single vault per install; operator has git + Node installed; no mobile authoring in v1 (mobile = reading published site only).

## 10. Design Direction

- **Visual tone**: Clean/minimal and typographic — content over chrome. Readable serif for note body, restrained sans/mono for UI chrome; generous whitespace.
- **Key interaction patterns**: Command palette / search on Ctrl-⌘-K; quick capture one keystroke from the dashboard; side-by-side editor with live preview; autosave-on-idle; status badges inline.
- **Accessibility targets**: WCAG 2.1 AA; full keyboard operation; scoped shortcuts (modifier-key or command-mode only — bare printable keys never bound globally); screen-reader labels on editor and search controls.
- **Responsive strategy**: Desktop-first for authoring; mobile-adaptive for reading (dashboard, note view, search collapse gracefully).
- **Design system**: Build from scratch with a tiny token set (type scale, spacing, 2 themes) — no component-library weight for a single-user tool.

## 11. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Capture latency | < 30 s median, capture → saved | Local save-log timestamps |
| Habit (active weeks) | Used ≥ 4 days/week in ≥ 3 of the first 6 months | Git commit days |
| Vault growth | ≥ 50 notes within 90 days of v1 | Git / frontmatter count |
| Link density | ≥ 60% of notes have ≥ 1 inbound link by month 6 | Backlink index |
| Search usefulness | Search used in ≥ 30% of sessions | Local usage log |
| Garden maturity | ≥ 20% of notes reach `evergreen` within 12 months | Status counts |
| Retrieval time | Find any existing note in < 60 s (spot-checked monthly) | Self-timed spot check |
| Public site (post-v1.1) | LCP < 2.5 s; ≥ 10 external visits/month by month 3 | Host analytics / Lighthouse |

## 12. Risks and Assumptions

| # | Risk / Assumption | Impact | Mitigation |
|---|-------------------|--------|------------|
| R1 | Scope creep toward "full knowledge platform" (graph DB, sync, multi-user) | High | P0/P1/P2 frozen at this PRD; new ideas go to a parking-lot note reviewed monthly |
| R2 | Capture friction kills the daily habit | High | Quick capture ≤ 3 keystrokes from dashboard; 30 s capture-latency metric; editor loads < 1 s; global hotkey escalated from P2 if habit metrics slip |
| R3 | Raw-Markdown editing in browser feels worse than Obsidian | Medium | Side-by-side preview; Obsidian-compatible `[[links]]` + frontmatter so the vault stays fully usable in any editor |
| R4 | Concurrent edits (app + external editor) overwrite work | Medium | File watcher reload (F1.5); mtime conflict warning; git makes any loss recoverable |
| R5 | Private note leaks into public build or search index | High | Default-private; allowlist-only publish; CI privacy gate fails deploy (F10.3); regression test in Playwright suite |
| R6 | Vault growth degrades search/build performance | Low | Benchmark at 5,000 notes before v1 release; incremental index updates |
| R7 | Auto-commit noise makes history unusable | Low | Conventional per-save messages; optional weekly-squash script; commit-on-save toggle |
| R8 | Single-machine dependency (disk failure) | Medium | Daily push to a private remote (F9.3); repo restore drill once per quarter |
| R9 | Assumption: operator has git/Node locally | Low | App shows a clear setup check on first run with copy-paste install steps |

## 13. Open Questions

- Link resolution rules: should `[[AI]]` and `[[Artificial Intelligence]]` be distinct, aliased, or case-folded? Needs a decision before F3 implementation (spike against 20 real vault notes).
- Astro vs Eleventy: half-day spike comparing wiki-link plugin support and content-collection ergonomics before locking the scaffold.
- Lifecycle transitions: manual only (current spec), or auto-suggest `seed → growing` when a note gains ≥ 2 links? Validate after a month of real use.
- Do `archived` notes appear in default search results and tag listings, or behind a filter?
- Is an OS-level global hotkey (F16) actually required to sustain the capture habit, or is the in-app shortcut enough? Decide from the habit metrics at month 2.
- Public hosting choice for v1.1: GitHub Pages vs Netlify vs a custom domain — decide when the first note is ready to publish.
- Should the dashboard surface a "random note" or "notes not visited in 90 days" revisit prompt (anti-decay feature)? Candidate for P1 if decay proves real.

---

*Generated by the PRD Writer agent. Review with stakeholders before committing to implementation.*
