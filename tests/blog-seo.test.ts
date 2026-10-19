import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  analyzePost,
  headingSkips,
  isInternalHref,
  suggestDescription,
  type PostDraft,
} from '../src/lib/blog-seo.ts';

const words = (n: number) => Array.from({ length: n }, () => 'wort').join(' ');

function draft(overrides: Partial<PostDraft> = {}): PostDraft {
  return {
    title: 'Perserteppich richtig reinigen',
    slug: 'perserteppich-reinigen',
    slugStatus: 'ok',
    doc: {
      words: 450,
      headings: [{ level: 2, text: 'Vorbereitung' }],
      images: [],
      links: [{ href: '/leistungen/teppichwaesche/', text: 'Teppichwäsche in Hamburg' }],
      firstParagraph: 'So reinigen Sie einen Perserteppich schonend.',
    },
    seoTitle: 'Perserteppich richtig reinigen | Hamburg Teppichreinigung',
    metaDescription:
      'Wie Sie einen Perserteppich schonend reinigen, wann eine professionelle Wäsche sinnvoll ist und was sie kostet.',
    featuredImage: 'https://cdn.example/a.jpg',
    featuredImageAlt: 'Perserteppich nach der Handwäsche',
    canonicalUrl: '',
    noindex: false,
    focusKeyphrase: '',
    ownUrl: 'https://hamburg-teppichreinigung.de/blog/perserteppich-reinigen/',
    siteHost: 'hamburg-teppichreinigung.de',
    ...overrides,
  };
}

const ids = (p: PostDraft) => analyzePost(p).map((i) => i.id);

describe('analyzePost', () => {
  it('passes a complete post', () => {
    assert.deepEqual(analyzePost(draft()), []);
  });

  it('only errors block publishing: title, content, featured image, slug', () => {
    const issues = analyzePost(
      draft({
        title: '',
        featuredImage: null,
        slugStatus: 'taken',
        doc: { words: 0, headings: [], images: [], links: [], firstParagraph: '' },
      }),
    );
    assert.deepEqual(
      issues.filter((i) => i.level === 'error').map((i) => i.id),
      ['titleMissing', 'contentMissing', 'imageMissing', 'slugTaken'],
    );
  });

  it('flags an H1 in the body with a demote fix', () => {
    const issue = analyzePost(
      draft({ doc: { ...draft().doc, headings: [{ level: 1, text: 'Doppelt' }] } }),
    ).find((i) => i.id === 'bodyH1');
    assert.equal(issue?.level, 'warning');
    assert.equal(issue?.fix, 'demoteH1');
  });

  it('treats alt="" as decorative but a missing alt as a warning', () => {
    const base = draft().doc;
    assert.ok(
      !ids(draft({ doc: { ...base, images: [{ src: 'x', alt: '' }] } })).includes('imagesNoAlt'),
    );
    assert.ok(
      ids(draft({ doc: { ...base, images: [{ src: 'x', alt: null }] } })).includes('imagesNoAlt'),
    );
  });

  it('keeps length guidance as suggestions, never errors', () => {
    const issues = analyzePost(
      draft({
        seoTitle: 'x'.repeat(80),
        metaDescription: 'zu kurz',
        doc: { ...draft().doc, words: 120 },
      }),
    );
    for (const id of ['metaTitleLong', 'metaDescriptionLength', 'shortContent'] as const) {
      assert.equal(issues.find((i) => i.id === id)?.level, 'suggestion', id);
    }
  });

  it('validates the canonical URL and warns when it points elsewhere', () => {
    assert.ok(ids(draft({ canonicalUrl: 'not a url' })).includes('canonicalInvalid'));
    assert.ok(ids(draft({ canonicalUrl: 'https://other.de/a/' })).includes('canonicalElsewhere'));
    assert.deepEqual(
      ids(
        draft({ canonicalUrl: 'https://hamburg-teppichreinigung.de/blog/perserteppich-reinigen' }),
      ),
      [],
    );
  });

  it('checks the focus keyphrase only when one is set (accent-insensitive)', () => {
    assert.deepEqual(ids(draft({ focusKeyphrase: 'perserteppich' })), []);
    assert.deepEqual(ids(draft({ focusKeyphrase: 'Teppichwäsche Kosten' })), [
      'keyphraseTitle',
      'keyphraseDescription',
      'keyphraseIntro',
    ]);
  });

  it('suggests subheadings only for longer posts', () => {
    const doc = { ...draft().doc, headings: [] };
    assert.ok(ids(draft({ doc })).includes('noSubheadings'));
    assert.ok(!ids(draft({ doc: { ...doc, words: 200 } })).includes('noSubheadings'));
  });

  it('flags vague link text and http links', () => {
    const doc = {
      ...draft().doc,
      links: [...draft().doc.links, { href: 'http://x.de', text: ' Hier ' }],
    };
    assert.deepEqual(ids(draft({ doc })), ['vagueLinkText', 'insecureLink']);
  });
});

describe('headingSkips', () => {
  it('reports a jump below the previous level', () => {
    assert.deepEqual(
      headingSkips([
        { level: 2, text: 'A' },
        { level: 4, text: 'B' },
        { level: 3, text: 'C' },
      ]),
      [{ from: 2, to: 4, text: 'B' }],
    );
    assert.deepEqual(headingSkips([{ level: 3, text: 'Start' }]), [
      { from: 1, to: 3, text: 'Start' },
    ]);
  });
});

describe('isInternalHref', () => {
  it('accepts relative paths and the own host, rejects others', () => {
    assert.ok(isInternalHref('/kontakt/', null));
    assert.ok(
      isInternalHref('https://www.hamburg-teppichreinigung.de/x', 'hamburg-teppichreinigung.de'),
    );
    assert.ok(!isInternalHref('//evil.de/x', 'hamburg-teppichreinigung.de'));
    assert.ok(!isInternalHref('https://other.de', 'hamburg-teppichreinigung.de'));
  });
});

describe('suggestDescription', () => {
  it('returns short text unchanged and cuts long text at a boundary', () => {
    assert.equal(suggestDescription('Kurz und gut.'), 'Kurz und gut.');
    const long = `${words(10)}. ${words(40)}`;
    const out = suggestDescription(long);
    assert.ok(out.length <= 157, String(out.length));
    assert.ok(out.endsWith('…') || out.endsWith('.'));
  });
});
