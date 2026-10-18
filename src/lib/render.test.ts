/**
 * F3 T004 — renderer tests (spec FR-002, plan R1, AC4's render half).
 *
 * Covers: resolved anchor href/text, alias parity with F1's extractor,
 * pending-marker markup + attribute escaping, `[[#…]]` staying literal,
 * code span/fence protection, raw-HTML escaping, and the render/index
 * parity assertion (the rendered link set is exactly `extractWikiLinks`).
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
