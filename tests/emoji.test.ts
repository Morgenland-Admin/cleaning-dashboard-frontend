import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EMOJI_CATEGORIES, moveInGrid, pushRecent, searchEmoji } from '../src/lib/emoji.ts';

describe('emoji set', () => {
  it('has the curated categories, no duplicates and the required work emojis', () => {
    const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis.map((e) => e.char));
    assert.equal(new Set(all).size, all.length);
    assert.ok(all.length >= 100 && all.length <= 150, `${all.length} emojis`);
    for (const e of [
      '✅',
      '❌',
      '📅',
      '📍',
      '📞',
      '📷',
      '🧾',
      '💶',
      '🧽',
      '🧼',
      '🧹',
      '🏠',
      '🚚',
      '👍',
      '🙏',
      '😊',
    ]) {
      assert.ok(all.includes(e), e);
    }
    assert.ok(EMOJI_CATEGORIES.every((c) => c.emojis.every((e) => e.keywords.length > 0)));
  });
});

describe('searchEmoji', () => {
  it('matches German and English word prefixes, ignoring case and umlauts', () => {
    assert.ok(searchEmoji('Rechnung').includes('🧾'));
    assert.ok(searchEmoji('invoice').includes('🧾'));
    assert.ok(searchEmoji('mude').includes('😴'));
    assert.deepEqual(searchEmoji('herz blau'), ['💙']);
    assert.deepEqual(searchEmoji('   '), []);
    assert.deepEqual(searchEmoji('xyzzy'), []);
  });
});

describe('pushRecent', () => {
  it('moves the pick to the front, dedupes and caps', () => {
    assert.deepEqual(pushRecent(['👍', '😊', '✅'], '✅'), ['✅', '👍', '😊']);
    assert.deepEqual(pushRecent(['a', 'b', 'c'], 'd', 3), ['d', 'a', 'b']);
    assert.deepEqual(pushRecent([], '🙏'), ['🙏']);
  });
});

describe('moveInGrid', () => {
  // Two sections: a short row of 3, then a row of 4 and a row of 2.
  const pos = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 80, y: 0 },
    { x: 0, y: 70 },
    { x: 40, y: 70 },
    { x: 80, y: 70 },
    { x: 120, y: 70 },
    { x: 0, y: 110 },
    { x: 40, y: 110 },
  ];
  it('moves by one sideways and to the nearest column up and down', () => {
    assert.equal(moveInGrid(pos, 2, 'ArrowRight'), 3);
    assert.equal(moveInGrid(pos, 0, 'ArrowLeft'), 0);
    assert.equal(moveInGrid(pos, 2, 'ArrowDown'), 5);
    assert.equal(moveInGrid(pos, 6, 'ArrowDown'), 8);
    assert.equal(moveInGrid(pos, 8, 'ArrowDown'), 8);
    assert.equal(moveInGrid(pos, 6, 'ArrowUp'), 2);
    assert.equal(moveInGrid(pos, 4, 'Home'), 0);
    assert.equal(moveInGrid(pos, 4, 'End'), 8);
    assert.equal(moveInGrid([], 0, 'End'), -1);
  });
});
