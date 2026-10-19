import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  companyValues,
  effectiveValues,
  formatIban,
  isBrandValue,
  mergeDraft,
  resolveQr,
  withUtm,
  type QrLinks,
} from '../src/lib/material-data.ts';

const defaults: QrLinks = {
  website: 'https://www.cleanilo.de',
  booking: 'https://www.cleanilo.de/buchung',
  inquiry: 'https://www.cleanilo.de/anfrage',
  review: 'https://www.cleanilo.de/bewertungen',
  voucher: 'https://www.cleanilo.de/kontakt',
  partner: 'https://www.cleanilo.de/partner',
  verify: 'https://www.cleanilo.de/partner',
  order: 'https://www.cleanilo.de/bestellung',
};

describe('withUtm', () => {
  it('adds print UTM parameters', () => {
    assert.equal(
      withUtm('https://www.cleanilo.de/buchung', 'flyer-a5'),
      'https://www.cleanilo.de/buchung?utm_source=print&utm_medium=qr&utm_campaign=flyer-a5',
    );
  });

  it('keeps parameters that are already there and ignores non-URLs', () => {
    assert.equal(
      withUtm('https://x.de/?utm_campaign=sommer', 'flyer-a5'),
      'https://x.de/?utm_campaign=sommer&utm_source=print&utm_medium=qr',
    );
    assert.equal(withUtm('CL-1426', 'abholbeleg-a5'), 'CL-1426');
  });
});

describe('resolveQr', () => {
  const base = { defaults, utm: false, campaign: 'flyer-a5' };

  it('prefers the template override, then the brand link, then the default', () => {
    assert.deepEqual(
      resolveQr({
        ...base,
        purpose: 'booking',
        override: ' https://a.de ',
        links: { booking: 'https://b.de' },
      }),
      { content: 'https://a.de', base: 'https://a.de', source: 'template' },
    );
    assert.equal(
      resolveQr({ ...base, purpose: 'booking', override: '', links: { booking: 'https://b.de' } })
        .source,
      'brand',
    );
    assert.deepEqual(resolveQr({ ...base, purpose: 'review', override: undefined, links: {} }), {
      content: defaults.review,
      base: defaults.review,
      source: 'default',
    });
  });

  it('tags only links on the brand domain', () => {
    const own = resolveQr({
      ...base,
      utm: true,
      purpose: 'booking',
      override: undefined,
      links: {},
    });
    assert.match(own.content, /utm_source=print/);
    const google = resolveQr({
      ...base,
      utm: true,
      purpose: 'review',
      override: 'https://g.page/r/abc/review',
      links: {},
    });
    assert.equal(google.content, 'https://g.page/r/abc/review');
  });
});

describe('company values', () => {
  it('maps company facts onto placeholder keys', () => {
    assert.deepEqual(
      companyValues({
        vatId: 'DE352699047',
        iban: 'de89370400440532013000',
        bic: 'COBADEFFXXX',
        legalName: 'Cleanilo GbR',
      }),
      {
        'USt-IdNr. · [PLATZHALTER]': 'DE352699047',
        'IBAN · [PLATZHALTER]': 'DE89 3704 0044 0532 0130 00',
        'BIC · [PLATZHALTER]': 'COBADEFFXXX',
        '[ Kontoinhaber ]': 'Cleanilo GbR',
      },
    );
    assert.deepEqual(companyValues(undefined), {});
  });

  it('lets brand values win unless they are blank', () => {
    assert.deepEqual(effectiveValues({ a: '1', b: '2' }, { a: 'x', b: '  ' }), { a: 'x', b: '2' });
  });

  it('groups an IBAN in fours', () => {
    assert.equal(formatIban('DE12 3456 7890 1234 5678 90'), 'DE12 3456 7890 1234 5678 90');
  });
});

describe('mergeDraft', () => {
  it('keeps local changes and takes everything else from the server', () => {
    const base = { edits: { a: '1', b: '2' }, utm: true };
    const local = { edits: { a: 'mine', b: '2', c: 'new' }, utm: true };
    const fresh = { edits: { a: '1', b: 'theirs' }, values: { x: 'v' }, utm: false };
    assert.deepEqual(mergeDraft(base, local, fresh), {
      edits: { a: 'mine', b: 'theirs', c: 'new' },
      values: { x: 'v' },
      utm: false,
    });
  });

  it('applies local deletions and an emptied draft', () => {
    assert.deepEqual(
      mergeDraft(
        { qr: { '0': 'x' }, edits: { k: 'v' } },
        { edits: { k: 'v' } },
        { qr: { '0': 'x' }, edits: { k: 'v' }, images: { '1': 'https://a' } },
      ),
      { edits: { k: 'v' }, images: { '1': 'https://a' } },
    );
    assert.deepEqual(mergeDraft({ edits: { k: 'v' } }, {}, { edits: { k: 'v' } }), {});
  });
});

describe('isBrandValue', () => {
  it('shares company facts but not customer details', () => {
    assert.equal(isBrandValue('USt-IdNr. · [PLATZHALTER]'), true);
    assert.equal(isBrandValue('IBAN · [PLATZHALTER]'), true);
    assert.equal(isBrandValue('[0800-NUMMER]'), true);
    assert.equal(isBrandValue('[ Kundenname / Firma ]'), false);
    assert.equal(isBrandValue('Start · [Datum]'), false);
  });
});
