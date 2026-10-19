import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseEuroToCents } from '../src/lib/money-input.ts';

describe('parseEuroToCents', () => {
  it('reads German and English decimals the same', () => {
    assert.equal(parseEuroToCents('49,90'), 4990);
    assert.equal(parseEuroToCents('49.90'), 4990);
    assert.equal(parseEuroToCents('49.9'), 4990);
    assert.equal(parseEuroToCents(' 12 € '), 1200);
  });

  it('treats other dots as thousands separators', () => {
    assert.equal(parseEuroToCents('1.234,56'), 123456);
    assert.equal(parseEuroToCents('1.234'), 123400);
    assert.equal(parseEuroToCents('1.234.567'), 123456700);
  });

  it('reads a leading decimal point and refuses mixed grouping', () => {
    assert.equal(parseEuroToCents('.5'), 50);
    assert.equal(parseEuroToCents(',5'), 50);
    assert.equal(parseEuroToCents('1,234.56'), null);
  });

  it('rejects what is not a number', () => {
    assert.equal(parseEuroToCents(''), null);
    assert.equal(parseEuroToCents('abc'), null);
    assert.equal(parseEuroToCents('1,2,3'), null);
    assert.equal(parseEuroToCents('12a'), null);
  });

  it('keeps the sign for the caller to range-check', () => {
    assert.equal(parseEuroToCents('-5'), -500);
    assert.equal(parseEuroToCents('0'), 0);
  });
});
