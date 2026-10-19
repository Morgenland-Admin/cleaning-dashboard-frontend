import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  groupLegacyTables,
  legacyTablePath,
  pageCount,
  sortedFields,
} from '../src/lib/legacy-records.ts';

const row = (source: string, table: string, count: number) => ({
  source,
  table,
  count,
  firstAt: null,
  lastAt: null,
});

describe('groupLegacyTables', () => {
  it('puts known sources first, then others, and sorts tables by name', () => {
    const groups = groupLegacyTables([
      row('zeta_import', 'x', 1),
      row('cleanilo_cms', 'newsletter', 4),
      row('cleanilo_ops', 'orders', 10),
      row('cleanilo_ops', 'chats', 5),
      row('cleanilo_cms', 'bookings', 2),
    ]);
    assert.deepEqual(
      groups.map((g) => g.source),
      ['cleanilo_ops', 'cleanilo_cms', 'zeta_import'],
    );
    assert.deepEqual(
      groups[0].tables.map((t) => t.table),
      ['chats', 'orders'],
    );
    assert.equal(groups[0].total, 15);
    assert.equal(groups[1].total, 6);
  });

  it('returns no groups for an empty archive', () => {
    assert.deepEqual(groupLegacyTables([]), []);
  });
});

describe('legacyTablePath', () => {
  it('encodes both segments', () => {
    assert.equal(
      legacyTablePath('cleanilo_cms', 'page content/de'),
      '/altdaten/cleanilo_cms/page%20content%2Fde',
    );
  });
});

describe('sortedFields', () => {
  it('sorts keys case-insensitively and numerically', () => {
    assert.deepEqual(
      sortedFields({ b: 1, A: 2, item10: 3, item2: 4 }).map(([k]) => k),
      ['A', 'b', 'item2', 'item10'],
    );
  });
});

describe('pageCount', () => {
  it('never returns less than one page', () => {
    assert.equal(pageCount(0, 50), 1);
    assert.equal(pageCount(50, 50), 1);
    assert.equal(pageCount(51, 50), 2);
  });
});
