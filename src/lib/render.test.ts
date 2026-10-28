/**
 * F3 T004 — renderer tests (spec FR-002, plan R1, AC4's render half).
 * F8 T002 — code highlighting + read/preview parity + XSS safety (spec FR-003,
 *            FR-004, SC-002, plan R1, C2).
 *
 * Covers: resolved anchor href/text, alias parity with F1's extractor,
 * pending-marker markup + attribute escaping, `[[#…]]` staying literal,
 * code span/fence protection, raw-HTML escaping, and the render/index
 * parity assertion (the rendered link set is exactly `extractWikiLinks`).
 *
 * F8 additions (T002):
 *   - Fenced blocks with a known language tag carry hljs highlighting markup.
 *   - Untagged and unknown-language fences render as plain escaped code.
 *   - Raw HTML in the body stays escaped (html:false holds).
 *   - Read/preview parity: the same source rendered twice through
 *     `renderNoteBody` yields identical HTML (C2 contract).
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createNote, extractWikiLinks, resolveWikiLink } from './notes';
import { renderNoteBody } from './render';

/** Resolver stub: every target is unresolved → rendered as a pending marker. */
const pending = () => null;

/** All rendered wikilink targets, in document order (href slug or data-target). */
function renderedTargets(html: string): string[] {
  const out: string[] = [];
  const re = /<a class="wikilink[^"]*"(?: href="\/note\/([^"]*)"| data-target="([^"]*)")/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1] ?? m[2] ?? '');
  return out;
}

const FIXTURE = [
  'Prose with [[Existing Note]], an alias [[Existing Note|an alias]],',
  'a heading fragment [[#heading]], an empty [[]] and [[ ]] target,',
  'plus a canonical variant [[Retrieval Practice]] and [[Missing Note]].',
  '',
  'Inline `[[Not A Link]]` stays code.',
  '',
  '```',
  '[[Also Not A Link]]',
  '```',
  '',
  'Raw HTML: <script>alert(1)</script>',
].join('\n');

describe('renderNoteBody (FR-002)', () => {
  it('renders a resolved target as an anchor to that note', () => {
    const html = renderNoteBody('See [[B]] now.', (t) => (t === 'B' ? 'b' : null));
    expect(html).toContain('<a class="wikilink" href="/note/b">B</a>');
    expect(html).not.toContain('pending');
  });

  it('uses the alias as display text and the target as the destination', () => {
    const html = renderNoteBody('[[B|alias text]]', (t) => (t === 'B' ? 'b' : null));
    expect(html).toContain('<a class="wikilink" href="/note/b">alias text</a>');
    // No alias written → the target itself is the display text.
    expect(renderNoteBody('[[B]]', () => 'b')).toContain('>B</a>');
  });

  it('renders an unresolved target as a focusable pending marker', () => {
    const html = renderNoteBody('See [[Missing Note]].', pending);
    expect(html).toContain(
      '<a class="wikilink pending" data-target="Missing Note" href="#" role="button">Missing Note</a>',
    );
  });

  it('renders a pending alias with the alias as text and the target in data-target', () => {
    const html = renderNoteBody('[[Missing Note|shorthand]]', pending);
    expect(html).toContain('data-target="Missing Note"');
    expect(html).toContain('>shorthand</a>');
  });

  it('escapes attributes in pending markers', () => {
    const html = renderNoteBody('[[a "quoted" target]]', pending);
    expect(html).toContain('data-target="a &quot;quoted&quot; target"');
    expect(html).not.toContain('data-target="a "quoted"');
  });

  it('leaves [[#heading]], [[]] and whitespace targets literal', () => {
    const html = renderNoteBody('A [[#heading]] B [[]] C [[ ]] D.', pending);
    expect(html).toContain('A [[#heading]] B [[]] C [[ ]] D.');
    expect(html).not.toContain('wikilink');
    expect(renderedTargets(html)).toEqual([]);
  });

  it('never links [[..]] inside inline code or fenced code', () => {
    const html = renderNoteBody(
      'Inline `[[Not A Link]]`.\n\n```\n[[Also Not A Link]]\n```\n',
      (t) => t, // would resolve anything — code still must stay code
    );
    expect(html).toContain('<code>[[Not A Link]]</code>');
    expect(html).toContain('[[Also Not A Link]]');
    expect(html).not.toContain('class="wikilink');
  });

  it('escapes raw HTML from the body instead of executing it', () => {
    const html = renderNoteBody('<script>alert("xss")</script>', pending);
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });
});

describe('render/index parity (FR-003)', () => {
  it('renders exactly the links extractWikiLinks finds — same targets, same count', () => {
    const extracted = extractWikiLinks(FIXTURE).map((l) => l.target);
    expect(extracted.length).toBeGreaterThan(0);
    expect(renderedTargets(renderNoteBody(FIXTURE, pending))).toEqual(extracted);
  });

  it('keeps the anchor count identical when links resolve (no link created or lost)', () => {
    const resolved = renderNoteBody(FIXTURE, (t) => (t === 'Missing Note' ? null : t));
    const pendingCount = (resolved.match(/wikilink pending/g) ?? []).length;
    const anchorCount = (resolved.match(/class="wikilink"/g) ?? []).length;
    expect(anchorCount + pendingCount).toBe(extractWikiLinks(FIXTURE).length);
    expect(anchorCount).toBe(extractWikiLinks(FIXTURE).length - 1); // only Missing Note is pending
  });

  it('shares resolveWikiLink, so canonical variants render as one note (AC4)', () => {
    const vault = mkdtempSync(join(tmpdir(), 'garden-render-'));
    const rp = createNote(vault, { title: 'Retrieval practice sessions', slug: 'retrieval-practice' }).note;
    const cafe = createNote(vault, { title: 'Café Society' }).note;
    expect(cafe.slug).toBe('cafe-society');
    const resolve = (target: string) => resolveWikiLink(target, [rp, cafe]);

    const html = renderNoteBody(
      '[[Retrieval Practice]] [[retrieval-practice]] [[RETRIEVAL-PRACTICE]] [[cafe society]] [[Nope]]',
      resolve,
    );
    expect(renderedTargets(html)).toEqual([
      'retrieval-practice',
      'retrieval-practice',
      'retrieval-practice',
      'cafe-society',
      'Nope', // all three tiers miss → pending, data-target carries the target
    ]);
    expect(html).not.toContain('[[Retrieval Practice]]');
  });
});

// ---------------------------------------------------------------------------
// F8 T002 — Syntax highlighting, parity, and XSS safety (FR-003, FR-004, C2,
//            SC-002, plan R1).
// ---------------------------------------------------------------------------

describe('code highlighting (FR-003, F8 T002)', () => {
  it('(a) fenced block with a known language tag carries hljs highlighting markup', () => {
    const html = renderNoteBody('```javascript\nconst x = 1;\n```', pending);
    // Must contain at least one hljs span — proves highlighting fired.
    expect(html).toMatch(/class="hljs-/);
    // The outer wrapper must include the hljs class and the language class.
    expect(html).toContain('class="hljs"');
    expect(html).toContain('class="language-javascript"');
    // The keyword 'const' must be wrapped in a span.
    expect(html).toContain('<span class="hljs-keyword">const</span>');
  });

  it('(a) typescript alias "ts" also produces hljs markup', () => {
    const html = renderNoteBody('```ts\nconst y: string = "hello";\n```', pending);
    expect(html).toMatch(/class="hljs-/);
    expect(html).toContain('class="language-ts"');
  });

  it('(a) python fence produces hljs markup', () => {
    const html = renderNoteBody('```python\nprint("hello")\n```', pending);
    expect(html).toMatch(/class="hljs-/);
  });

  it('(d) untagged fence renders as plain escaped code — no hljs markup', () => {
    const html = renderNoteBody('```\nsome plain code\n```', pending);
    // Default markdown-it output: <pre><code>...</code></pre>, no hljs class.
    expect(html).not.toContain('class="hljs"');
    expect(html).not.toMatch(/class="hljs-/);
    // Content must still appear (escaped).
    expect(html).toContain('some plain code');
    // Must be wrapped in pre > code.
    expect(html).toContain('<pre>');
    expect(html).toContain('<code>');
  });

  it('(d) unknown language tag falls back to escaped code — never throws', () => {
    // Should not throw; unknown lang → empty return → markdown-it default.
    let html: string;
    expect(() => {
      html = renderNoteBody('```zzz_not_a_language\nfoo bar\n```', pending);
    }).not.toThrow();
    html = renderNoteBody('```zzz_not_a_language\nfoo bar\n```', pending);
    // No hljs wrapper on an unregistered language.
    expect(html).not.toContain('class="hljs"');
    // Content must survive.
    expect(html).toContain('foo bar');
  });

  it('(d) empty fenced block never throws', () => {
    expect(() => {
      renderNoteBody('```javascript\n```', pending);
    }).not.toThrow();
    expect(() => {
      renderNoteBody('```\n```', pending);
    }).not.toThrow();
  });

  it('(c) raw HTML in note body stays escaped — html:false holds after F8', () => {
    const html = renderNoteBody('<b>bold</b> and <script>evil()</script>', pending);
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('(c) raw HTML inside a highlighted code block is escaped by the highlighter', () => {
    // hljs already escapes HTML in its output, so no raw tags must appear.
    const html = renderNoteBody('```javascript\n<script>alert(1)</script>\n```', pending);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    // hljs markup around 'alert' is still present.
    expect(html).toMatch(/class="hljs-/);
  });

  it('(b) read/preview parity (C2): same source rendered twice yields identical HTML', () => {
    // The preview imports the same renderNoteBody module as read mode.
    // Calling it twice with the same input must produce the same output.
    const source = [
      '# Heading',
      '',
      '```javascript',
      'const a = 1;',
      '```',
      '',
      'See [[SomeNote]] and [[Missing]].',
      '',
      '- list item one',
      '- list item two',
    ].join('\n');
    const resolver = (t: string) => (t === 'SomeNote' ? 'some-note' : null);

    const html1 = renderNoteBody(source, resolver);
    const html2 = renderNoteBody(source, resolver);

    // Exact bit-for-bit equality — no randomness, no state drift.
    expect(html1).toBe(html2);

    // Also confirm the expected content is present in both.
    expect(html1).toContain('<h1>Heading</h1>');
    expect(html1).toMatch(/class="hljs-/);
    expect(html1).toContain('href="/note/some-note"');
    expect(html1).toContain('wikilink pending');
  });

  it('(b) parity holds across wikilink types, literals, and code spans', () => {
    const source = [
      'Inline `[[Not A Link]]`.',
      '[[#heading-ref]] and [[]] stay literal.',
      '[[Exists]] and [[Missing]] appear.',
    ].join('\n');
    const resolver = (t: string) => (t === 'Exists' ? 'exists' : null);

    const h1 = renderNoteBody(source, resolver);
    const h2 = renderNoteBody(source, resolver);

    expect(h1).toBe(h2);
    // Literals survive.
    expect(h1).toContain('[[#heading-ref]]');
    expect(h1).toContain('[[]]');
    // Code span not linked.
    expect(h1).toContain('<code>[[Not A Link]]</code>');
    // Wikilinks resolved / pending correctly.
    expect(h1).toContain('href="/note/exists"');
    expect(h1).toContain('wikilink pending');
  });
});

// ---------------------------------------------------------------------------
// Block shapes — SC-002 / F8 T006 — headings, nested lists, GFM tables.
// Locks in the structural HTML shapes required by the success criterion.
// ---------------------------------------------------------------------------

describe('block shapes (SC-002)', () => {
  /** Trivial resolver used across all three block-shape tests. */
  const resolver = (t: string) => (t === 'x' ? 'x' : null);

  it('headings h1–h6 render to the correct HTML elements', () => {
    const source = [
      '# H1',
      '## H2',
      '### H3',
      '#### H4',
      '##### H5',
      '###### H6',
    ].join('\n');
    const html = renderNoteBody(source, resolver);
    expect(html).toContain('<h1>H1</h1>');
    expect(html).toContain('<h2>H2</h2>');
    expect(html).toContain('<h3>H3</h3>');
    expect(html).toContain('<h4>H4</h4>');
    expect(html).toContain('<h5>H5</h5>');
    expect(html).toContain('<h6>H6</h6>');
  });

  it('nested list renders a <ul> inside the outer <ul>', () => {
    const source = [
      '- item one',
      '- item two',
      '  - sub item',
      '- item three',
    ].join('\n');
    const html = renderNoteBody(source, resolver);
    // Outer list must be present.
    expect(html).toContain('<ul>');
    // A nested <ul> must appear somewhere inside the outer list.
    expect(html).toMatch(/<ul>[\s\S]*<ul>/);
    // Sub-item content must survive.
    expect(html).toContain('sub item');
  });

  it('GFM pipe table renders <table> with <th> and <td> cells', () => {
    const source = [
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |',
    ].join('\n');
    const html = renderNoteBody(source, resolver);
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<th>b</th>');
    expect(html).toContain('<td>1</td>');
    expect(html).toContain('<td>2</td>');
  });
});
