import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  boardSlug,
  findPlaceholders,
  formatPrintSize,
  matchPrintSizes,
  pngPixelRatio,
  type PrintSize,
} from '../src/lib/material-print.ts';

const mm = (width: number, height: number, fitWidth?: boolean): PrintSize => ({
  width,
  height,
  unit: 'mm',
  ...(fitWidth && { fitWidth }),
});

describe('matchPrintSizes', () => {
  it('matches a business card front and back', () => {
    const out = matchPrintSizes(
      [
        { width: 510, height: 330 },
        { width: 510, height: 330 },
      ],
      [mm(85, 55)],
    );
    assert.deepEqual(out, [mm(85, 55), mm(85, 55)]);
  });

  it('turns the size to the artboard orientation', () => {
    assert.deepEqual(matchPrintSizes([{ width: 592, height: 420 }], [mm(105, 148)]), [
      mm(148, 105),
    ]);
  });

  it('picks the size that fits each artboard', () => {
    const out = matchPrintSizes(
      [
        { width: 420, height: 420 },
        { width: 560, height: 280 },
      ],
      [mm(120, 120), mm(200, 100)],
    );
    assert.deepEqual(out, [mm(120, 120), mm(200, 100)]);
  });

  it('leaves unknown shapes on their screen size', () => {
    assert.deepEqual(matchPrintSizes([{ width: 680, height: 300 }], [mm(210, 297)]), [null]);
    assert.deepEqual(matchPrintSizes([{ width: 680, height: 475 }], undefined), [null]);
  });

  it('fits a short slip to the page width only when allowed', () => {
    const slip = [{ width: 559, height: 627 }];
    assert.deepEqual(matchPrintSizes(slip, [mm(148, 210)]), [null]);
    assert.deepEqual(matchPrintSizes(slip, [mm(148, 210, true)]), [mm(148, 210, true)]);
  });
});

describe('pngPixelRatio', () => {
  it('renders px sizes exactly', () => {
    const px: PrintSize = { width: 1080, height: 1080, unit: 'px' };
    assert.equal(pngPixelRatio({ width: 540, height: 540 }, px), 2);
  });

  it('aims at 300 dpi and caps huge formats', () => {
    const card = pngPixelRatio({ width: 510, height: 330 }, mm(85, 55));
    assert.ok(Math.abs(card * 510 - (85 / 25.4) * 300) < 1);
    const rollUp = pngPixelRatio({ width: 476, height: 1120 }, mm(850, 2000));
    assert.equal(Math.round(rollUp * 1120), 8000);
  });
});

describe('formatting helpers', () => {
  it('shows large formats in cm', () => {
    assert.equal(formatPrintSize(mm(600, 400)), '60 × 40 cm');
    assert.equal(formatPrintSize(mm(85, 55)), '85 × 55 mm');
    assert.equal(formatPrintSize(null), null);
  });

  it('finds bracketed placeholders once each', () => {
    assert.deepEqual(findPlaceholders('USt [PLATZHALTER] · [ Kundenname / Firma ] [PLATZHALTER]'), [
      '[PLATZHALTER]',
      '[ Kundenname / Firma ]',
    ]);
  });

  it('names artboards for file names', () => {
    assert.equal(boardSlug('Flyer A5 · Vorderseite · 148 × 210 mm', 0), 'vorderseite');
    assert.equal(boardSlug('Rückseite · 85 × 55 mm', 1), 'rueckseite');
    assert.equal(boardSlug('Instagram-Post · 1080 × 1080 px', 0), 'instagram-post');
    assert.equal(boardSlug(null, 2), 'seite-3');
  });
});
