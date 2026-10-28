/**
 * F3 T004 — note-body rendering (plan Research R1, spec FR-002).
 * F8 T002 — syntax highlighting for fenced code blocks (spec FR-003, plan R1).
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
 *
 * Syntax highlighting (FR-003, F8 T002):
 *
 *   - Uses highlight.js core + a small subset of common languages.
 *   - One module shared by SSR read-mode and the client preview (FR-004, C2).
 *   - Untagged fences, unknown language tags, and empty fences fall back to
 *     escaped code — never throw (FR-003 fallback requirement).
 *   - highlight.js already HTML-escapes its output, so the markup is XSS-safe
 *     by construction; `html:false` continues to hold for note body HTML.
 */
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';

// Minimal language subset — common languages only, never the full bundle.
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import sql from 'highlight.js/lib/languages/sql';
import rust from 'highlight.js/lib/languages/rust';
import go from 'highlight.js/lib/languages/go';
import yaml from 'highlight.js/lib/languages/yaml';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('css', css);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('go', go);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);

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

/**
 * markdown-it `highlight` callback (FR-003).
 *
 * Returns a complete `<pre><code>` block when the language is registered;
 * returns `''` (empty string) to let markdown-it render its safe default
 * for untagged fences, empty fences, and unknown language tags.
 * highlight.js output is already HTML-escaped, so the result is XSS-safe.
 */
function highlightCode(str: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      const highlighted = hljs.highlight(str, { language: lang, ignoreIllegals: true });
      return `<pre class="hljs"><code class="language-${lang}">${highlighted.value}</code></pre>`;
    } catch {
      // Fall through to default rendering on any unexpected error.
    }
  }
  // Return '' → markdown-it renders its own escaped <pre><code> block.
  return '';
}

const md = new MarkdownIt({
  html: false, // raw HTML in note bodies renders as escaped text (FR-002)
  linkify: false,
  typographer: false,
  breaks: false,
  highlight: highlightCode,
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
