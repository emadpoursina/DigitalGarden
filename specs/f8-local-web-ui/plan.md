# Implementation Plan: F8 Local Web UI

**Branch**: `digitalgarden/t_1e1b2dca-f8-local-web-ui` (spec card t_16ae5d38, parent t_1e1b2dca) | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md) | **Tasks**: [tasks.md](./tasks.md)

**Input**: Feature specification `specs/f8-local-web-ui/spec.md` (clarified 2026-10-27, 5/5 headless questions resolved: Q1 measured cold-start, Q2 2 s idle + commit-free + `/new` reuse, Q3 bare-`c` scoped retention, Q4 highlighting required, Q5 explicit toggle + measured ratios) + locked orchestrator decisions D1–D8 (spec card, stamped in spec "Locked Constraints").

**Step**: `/speckit.plan` (Phase 5/6). Deliverable is this plan — the build implements `tasks.md`; no code in this step.

> **Artifact consolidation**: the card fixes the F8 artifact set at `specs/f8-local-web-ui/{spec,plan,tasks}.md` + `checklists/requirements.md` (F4–F7 parity), so the template's separate `research.md`, `data-model.md`, `contracts/`, and `quickstart.md` outputs are consolidated into this single file: "Research (Phase 0)" below, "Data Model" and "Interface Contracts" (Phase 1), "Validation & Quickstart" (Phase 1).
> **Extension hooks**: `.specify/extensions.yml` does not exist → `before_plan` / `after_plan` hook stages skipped silently (both pre-check and mandatory post-check performed, same as F7).

---

## Summary

F8 is a formalization + measurement + gap-fix pass over the shipped v1 UI: five PRD ACs mapped onto six surfaces. Most behavior already ships (safe renderer, save/conflict contract, modifier-only search shortcut, loopback posture) and is regression-locked in tests — that half is verify-or-measure. Three gap fixes need real code, each tied to its FR and its gap files (spec "Gap Files", D5): code highlighting (FR-003, R1), side-by-side editor + live preview + 2 s autosave (FR-005/FR-006, R2/R6, contract C1), explicit light/dark themes with toggle (FR-010, R4). One conditional dependency (highlight mechanism, R1) is the only permitted `package.json` diff. The keyboard audit (FR-008/FR-009, R3) ends scoped-or-remediated with exactly one finding carried to critic sign-off. Cold start (FR-001, R5) is measured one-off evidence, never a committed timing test. Ten tasks (T001–T010) carry the work; the build converges when all ten are done and the gate + diff audit hold.

## Technical Context

**Language/Version**: TypeScript on Node.js ≥ 20 (repo runs Node 26.x); `astro check` not wired — `npm run build` catches syntax/import errors, types advisory (F2–F7 precedent; `npx tsc --noEmit` stays a voluntary gate).

**Primary Dependencies**: `astro ^7.3.8`, `@astrojs/node ^11.1.8`, `markdown-it ^15.0.2`, `minisearch ^7.2.0` (untouched), `simple-git ^4.0.2` (untouched — F8 never commits, D3), `vitest ^5`, `@playwright/test ^1.64.1` (verification only, no committed spec files). **Added by this plan: exactly one conditional runtime dep** — the R1 highlight mechanism (subset import only, bundle-justified; diff must be exactly that dep + lockfile, spec Gap Files FR-003). `codemirror ^6.0.2` stays as-is: zero imports under `src/`, but removing it is NOT a spec-named gap file — out of scope, recorded as a finding for a later feature.

**Storage**: plain Markdown + YAML frontmatter via F1 `src/lib/notes.ts` — F8 writes no new vault schema, no migration. Autosave reuses the existing `POST /api/note` save path (C1 adds a `hash` echo to the 200 body only). Theme choice persists in `localStorage` (client-only, never the vault). No git commits from any edit-save path (D3).

**Testing**: `npm run test` → `vitest run` (node env, `*.test.ts` only — render/autosave-decision/theme units extend existing suites). UI flows are scripted Playwright runs from the scratch dir (`/tmp`), never committed `*.spec.ts` / `playwright.config.ts` (F2–F6 R8 lesson kept, no vitest include-collision). Runtime-only facts (cold start, contrast numbers) are command-produced captures under `specs/f8-local-web-ui/evidence/` recorded by the tester; the build only appends the two D7 `.gitignore` lines.

**Target Platform**: local-first web app, loopback only (`astro dev`/`astro preview` defaults; never `server.host: true`, never `--host` — F7 READ-ONLY, D4/FR-013).

**Performance Goals**: cold start spawn-to-first-200 < 2 s on the built server (measured per run, Q1 — NOT asserted in a committed test); autosave idle constant exactly 2000 ms; gate suite stays near its measured ~6–7 s vitest duration; UI proof runs add < 10 min wall time total.

**Constraints**: D3 (no commit-on-save), D4 (F7 READ-ONLY: loopback config, `privacy.test.ts` 8 its, visibility paths), D5 (OWN = `specs/f8-local-web-ui/*` + spec-named gap files only), D6 (gate in order, `TMPDIR=/tmp` on this FUSE host), D7 (evidence hygiene — tester-enforced manifest columns).

**Scale/Scope**: single-user, ≤ 5,000 notes (PRD §8); no new perf rig (F6/R6 posture carries over); no new read path, no route additions except NONE (toggle lives in Base shell, no `/settings` page — spec Edge Cases/F11).

**No NEEDS CLARIFICATION items remain** — all 5 spec clarifications resolved; the implementation-level questions they deferred (highlight mechanism, autosave lifecycle, preview parity form, toggle home, contrast method, probe form) are decided in Research below.

## Constitution Check

*GATE: `.specify/memory/constitution.md` is still the unfilled `[PROJECT_NAME]` template — it defines **no gates**, so no constitution gate can pass or fail (same finding as F2's–F7's plans; re-checked this session). Complexity Tracking is therefore empty of violations (see bottom).*

In place of constitution gates, the plan is checked against the binding PRD §8 non-functional requirements:

| PRD §8 requirement | How this plan satisfies it | Re-check after design |
|---|---|---|
| Loopback only | No config change; `astro.config.mjs` READ-ONLY; cold-start probe (R5) re-measures localhost-only serving | ✓ |
| Data loss: zero tolerance | Autosave reuses the validated save path (C1/C3); dirty-guard + in-flight guard + 409 choices preserve content; Esc confirms-if-dirty | ✓ |
| Vault format: plain Markdown + YAML | Unchanged — F1 serialization only; no new frontmatter keys | ✓ |
| Offline / no network service | No outbound calls in any F8 path; toggle/autosave/preview are local; probe uses localhost only | ✓ |
| Calm, keyboard-friendly, AA themes | R3 audit (every binding scoped), R4 measured AA in both themes, side-by-side responsive collapse | ✓ |

## Research (Phase 0)

**R1 — Highlight mechanism (FR-003, gap: `src/lib/render.ts` + `render.test.ts`, conditional `package.json`)**. DECIDED: markdown-it `highlight` callback backed by a minimal subset import of a small highlighter (plan-named dep at build time; subset only — e.g. common-languages core, never the full bundle), wired once in `render.ts` so SSR read-mode and the client preview share the identical module (R6). Bundle justification is measured, not argued: the build records the client-script delta and the tester UI flow screenshots prove highlighted output. Fallback if the measured delta is unreasonable: shrink the language subset, never drop highlighting (AC2 names it; Q4 decided REQUIRED). `codemirror` is NOT the mechanism (zero imports, editor-surface mismatch) and is NOT removed (not a gap file).

**R2 — Autosave lifecycle (FR-006, gap: `wikilink-client.ts` + test, `note/[slug].astro` script, `api/note.ts` C1)**. DECIDED: single `AUTOSAVE_IDLE_MS = 2000` constant; `input` events reset the timer; pure decision predicates live in `wikilink-client.ts` (DOM-free, unit-tested: `shouldAutosave({dirty, inFlight, idleElapsed})`, response handler refreshing `baseHash` from the C1 `hash` echo); the page only wires DOM (timer, status line `Saving…` / `Saved HH:MM:SS` / error, existing 409 box). Rules: clean-buffer idle never POSTs; in-flight save suppresses the second POST (existing disable matrix precedent); autosave never carries `force:true` (only explicit Overwrite does); every post-autosave write uses the refreshed `baseHash` so an autosave can never 409 against its own write (cross-AC risk from spec Notes, carried as C1). No-commit invariant (D3/FR-007): the edit-save path calls `saveNote` only — verified by `git log` showing no new commit in the autosave flow.

**R3 — Keyboard audit (FR-008/FR-009, no gap file unless remediation)**. DECIDED: audit table with one row per binding — dashboard bare-`c` (FR-009: retained scoped command, finding + critic sign-off), Ctrl/⌘-K (modifier-only), `[[` popup router (popup-open-only), results keys (panel-focused-only), capture keys (form-scoped), editor Esc / Ctrl-Enter / 409-box buttons / theme toggle (all page- or control-scoped). Each row ends modifier-scoped or command-mode-scoped, or is remediated in the page script under FR-005/FR-006's gap file. Bare printables otherwise type, never command. Proof: keyboard-only Playwright traversal, recorded table (UI proof).

**R4 — Theme design (FR-010, gap: `global.css`, `Base.astro`, NEW `theme.ts` + test only if DOM-free-testable)**. DECIDED: `[data-theme="light"|"dark"]` token overrides on top of the existing vars; the `prefers-color-scheme` media query stays as the DEFAULT source only (no stored choice → follow OS); toggle button in the Base shell nav (`aria-pressed`, persisted `localStorage` key, all six surfaces repaint without reload). Contrast method: computed-style ratio script over body + muted/secondary text per theme, recorded ratios (body ≥ 4.5:1, large/UI accents ≥ 3:1), both themes screenshotted. Toggle is progressive enhancement (no-JS still renders the OS-media default — spec Edge Cases).

**R5 — Cold-start evidence form (FR-001, no repo files)**. DECIDED (Q1): scripted probe from `/tmp`, never a committed test — build, boot `astro preview` on a free probe port, time process-spawn → first 200 on `/`, confirm loopback-only listener (`/proc/net`-style check, F7 R4 precedent), stop, confirm port free. Record port + build state (warm vs first build) + timing. Flaky-by-construction as a committed assertion; measured-and-recorded as evidence.

**R6 — Preview parity + bundle (FR-004, gap: `note/[slug].astro` script)**. DECIDED: the preview renders through the SAME `renderNoteBody` module client-side (shared import, same `html:false` → preview XSS-safe by construction) with the page-data island index feeding the identical `resolveWikiLink` resolver — same source yields identical HTML in read and preview (parity asserted in `render.test.ts` extension, logic proof). Bundle impact of the client-side markdown-it + highlighter import is measured by the build and recorded; no second renderer, no server round-trip per keystroke.

## Data Model

- **Edit buffer**: `{ value, dirty, inFlight, baseHash }` — dirty = value ≠ lastSavedBody; inFlight = POST outstanding; baseHash refreshed from C1 `hash` after every 200. All four autosave/Esc/conflict transitions read this unit (spec Key Entities).
- **Theme**: `light | dark` persisted choice + OS default; resolved theme = stored ?? OS; every surface reads the same tokens.
- **Keyboard binding**: `{ key, modifiers, focusScope, outcome, verdict }` — verdict ∈ {modifier-scoped, command-mode-scoped, remediated, finding+sign-off (bare-`c` only)}.

## Interface Contracts

- **C1 — `POST /api/note` 200 echoes `hash`** (gap file `src/pages/api/note.ts`, FR-006): 200 becomes `{ slug, status, updated, hash, backlinks }` where `hash` is the new on-disk snapshot hash. No other contract change: validation order, 400/404/409/500 shapes, and the omitted-field-keeps-disk-value rule are untouched (spec FR-006 ties to the existing path).
- **C2 — Preview parity** (FR-004): for identical source, preview HTML ≡ read HTML (modulo page shell); raw HTML escaped in both (`html:false` carries client-side); `[[#…]]`/`[[]]`/whitespace targets literal in both; code-span `[[..]]` never links in either.
- **C3 — Autosave timing/status** (FR-006): idle = 2000 ms with no keystroke in the edit buffer → POST iff dirty && !inFlight; explicit Save POSTs immediately; status line confirms every write; zero git commits from any edit-save write (D3).

## Validation & Quickstart

Gate in order (D6): `npm install` → `TMPDIR=/tmp npm run test` → `npm run build`, all exit 0. Baseline @76d6dbd: install 0, 274/274, build 0 (run-79). Expectation: 274+ (never fewer).

| Flow | AC | Proof type (exactly ONE per D1) | Command-produced artifacts |
|---|---|---|---|
| F-coldstart | AC1 | CLI/job (scripted probe from /tmp) | boot log + curl timing + listener check + port-free confirm |
| F-render | AC2 | logic (vitest `render.test.ts` extension: fixture + highlighting + parity + XSS) | test file hunks (gap file) |
| F-editor | AC3 | UI (Playwright commands only: side-by-side open, preview tracking, explicit save, Esc-dirty, both 409 choices) | trace/video/screenshots |
| F-autosave | AC3 | UI (Playwright commands only: type → 2 s idle → disk write + status; `git log` shows no new commit) | trace/screenshots + shell no-commit check |
| F-keyboard | AC4 | UI (Playwright keyboard-only traversal of the audit table) | recorded audit table + traversal trace |
| F-contrast | AC5 | UI (Playwright commands only: six surfaces × two themes screenshots + recorded ratios) | screenshots + ratio table |
| F-gate | all | CLI/job (`install` → `test` → `build` in order) | exit codes + `git diff --stat` (SC-007 audit) |

Quickstart for the build: read `tasks.md` (ONLY work source), implement T001→T010 in FR order (C1 before autosave wiring: T002 → T003 → T004), measure as you go, converge when F-gate + SC-007 (diff shows ONLY `specs/f8-local-web-ui/*` + spec-named gap files; `privacy.test.ts` still 8 its) hold. Tester owns `evidence.md` (D7 manifest, 6 fixed columns); the build only appends the two evidence `.gitignore` lines (T010).

## Gap-file work orders (D5 — build may touch ONLY these)

1. `src/lib/render.ts` + `render.test.ts` — FR-003 (R1 highlight + C2 parity assertions). → T001
2. `src/pages/api/note.ts` — FR-006 C1 `hash` echo ONLY. → T002
3. `src/lib/wikilink-client.ts` + `wikilink-client.test.ts` — FR-006 pure autosave predicates. → T003
4. `src/pages/note/[slug].astro` — FR-005/FR-006 panes + preview + timer/status (page script + scoped styles; no save-path redesign). → T004, T007-keyboard-remediation-if-any
5. `src/styles/global.css` — FR-010 theme tokens (media query stays as default source). → T005
6. `src/layouts/Base.astro` — FR-010 toggle home (button + tiny wiring; nav stays). → T005
7. NEW `src/lib/theme.ts` + `theme.test.ts` ONLY if DOM-free-testable — FR-010. → T005
8. `package.json` + lockfile CONDITIONAL on R1 (exactly the highlight dep). → T001
9. `.gitignore` append ONLY the two D7 evidence lines. → T010

## Complexity Tracking

No constitution gates exist (unfilled template — see Constitution Check), so no violations. Only tuned constants, both measured not argued: `AUTOSAVE_IDLE_MS = 2000` (build measures what shipped; F-autosave proves it) and the R1 highlight subset import (build records the client-script delta). No new routes, no new vault schema, no new test runner, no committed browser specs.
