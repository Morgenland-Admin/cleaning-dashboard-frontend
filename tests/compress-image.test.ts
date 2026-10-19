import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fitWithin } from '../src/lib/compress-image.ts';

describe('fitWithin', () => {
  it('never upscales', () => {
    assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  });

  it('caps width at 1600 and keeps the ratio', () => {
    assert.deepEqual(fitWithin(4000, 3000), { width: 1600, height: 1200 });
  });

  it('caps tall images at 2400', () => {
    assert.deepEqual(fitWithin(1200, 4800), { width: 600, height: 2400 });
  });
});
