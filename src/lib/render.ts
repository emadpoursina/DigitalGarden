/**
 * F3 T004 — note-body rendering (plan Research R1, spec FR-002).
 *
 * `renderNoteBody` runs the Markdown through markdown-it with its safe
 * defaults (`html:false` — raw HTML in a note body is escaped, never
 * executed) plus ONE inline rule, registered before `link`, that turns
 * `[[target]]` / `[[target|alias]]` into:
 *
 *   - a resolved anchor  `<a class="wikilink" href="/note/<slug>">text</a>`
 *   - an unresolved      `<a class="wikilink pending" data-target="…"`
 *     pending marker     `href="#" role="button">text</a>` (keyboard
 *     reachable; F3's page script creates the note on first click)
 *
 * Rules that keep rendering and F1's index in lockstep (FR-003, plan R1):
 *
 *   - targets starting with `#` (`[[#heading]]`), `[[]]` and whitespace-only
 *     targets stay LITERAL — F1's `extractWikiLinks` never extracts them;
 *   - the target is everything before the first `#`/`|`, the display text is
 *     the alias when present else that target — identical to the extractor;
 *   - code spans and fenced blocks are tokenized before this rule runs, so
 *     `[[..]]` inside code can never become a link;
 *   - the resolver is INJECTED, so renderer, backlink index and autocomplete
 *     all call the same `resolveWikiLink` and can never disagree.
 */
import MarkdownIt from 'markdown-it';

/** Canonical resolver signature — `resolveWikiLink(target, index.notes)`. */
export type WikiLinkResolve = (target: string) => string | null;

interface WikilinkTokenMeta {
  /** Resolved slug, or null when the target does not exist yet. */
  slug: string | null;
  /** Display text: alias when present, else the target (F1 parity). */
  linkText: string;
  /** Raw target as authored — carried so pending markers can create it. */
  target: string;
}

const md = new MarkdownIt({
  html: false, // raw HTML in note bodies renders as escaped text (FR-002)
  linkify: false,
  typographer: false,
  breaks: false,
});

const LBRACKET = 0x5b; // [
const RBRACKET = 0x5d; // ]

md.inline.ruler.before('link', 'wikilink', (state, silent) => {
  const start = state.pos;
  if (state.src.charCodeAt(start) !== LBRACKET) return false;
  if (state.src.charCodeAt(start + 1) !== LBRACKET) return false;
  if (start + 4 > state.posMax) return false;

  const close = state.src.slice(start + 2, state.posMax).indexOf(']]');
  if (close === -1) return false;
  const inner = state.src.slice(start + 2, start + 2 + close);
  const end = start + 2 + close + 2;

  // Never span lines: a half-open construct is plain text.
  if (inner.includes('\n')) return false;

  const pipe = inner.indexOf('|');
  const head = pipe === -1 ? inner : inner.slice(0, pipe);
  const alias = pipe === -1 ? null : inner.slice(pipe + 1);
  const hash = head.indexOf('#');
  const target = (hash === -1 ? head : head.slice(0, hash)).trim();

  // `[[]]`, `[[ ]]`, `[[#heading]]` → literal text (extractor drops these).
  if (!target) return false;

  const linkText = (alias ?? '').trim() || target;
  const env = state.env as { resolve?: WikiLinkResolve };
  const slug = env?.resolve ? env.resolve(target) : null;

  state.pos = end;
  if (!silent) {
    const token = state.push('wikilink', '', 0);
    token.content = linkText;
    token.meta = { slug, linkText, target } satisfies WikilinkTokenMeta;
  }
  return true;
});

md.renderer.rules.wikilink = (tokens, idx) => {
  const token = tokens[idx]!;
  const { slug, linkText, target } = (token.meta ?? {}) as unknown as WikilinkTokenMeta;
  const escape = md.utils.escapeHtml;
  const text = escape(linkText ?? '');
  if (slug) {
    return `<a class="wikilink" href="/note/${escape(slug)}">${text}</a>`;
  }
  return (
    `<a class="wikilink pending" data-target="${escape(target ?? '')}" ` +
    `href="#" role="button">${text}</a>`
  );
};

/**
 * Render a note body to HTML. `resolve` is injected (tests stub it; the page
 * passes `(t) => resolveWikiLink(t, index.notes)`), so this module has no
 * dependency on the vault and no side effects beyond rendering.
 */
export function renderNoteBody(body: string, resolve: WikiLinkResolve): string {
  return md.render(body ?? '', { resolve });
}
