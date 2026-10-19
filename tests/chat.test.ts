import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  checkFiles,
  dayGroups,
  daysAgo,
  deliveryState,
  fileType,
  initialsOf,
  insertAt,
  linkParts,
  mergePages,
  sharedItems,
  threadRows,
} from '../src/lib/chat.ts';

import type { ChatMessage } from '../src/lib/api.ts';

const msg = (id: number, createdAt: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  conversationId: 1,
  senderUserId: 'admin-1',
  senderRole: 'admin',
  body: `m${id}`,
  attachments: [],
  deliveredAt: null,
  readAt: null,
  createdAt,
  ...extra,
});

describe('mergePages', () => {
  it('orders pages oldest first and drops duplicates', () => {
    const latest = { messages: [msg(3, '2026-10-02T10:00:00Z'), msg(4, '2026-10-02T11:00:00Z')] };
    const older = { messages: [msg(1, '2026-10-01T10:00:00Z'), msg(3, '2026-10-02T10:00:00Z')] };
    assert.deepEqual(
      mergePages([latest, older]).map((m) => m.id),
      [1, 3, 4],
    );
  });
});

describe('threadRows', () => {
  it('adds day separators, the unread divider and sender runs', () => {
    const rows = threadRows(
      [
        msg(1, '2026-10-01T10:00:00Z'),
        msg(2, '2026-10-01T10:01:00Z'),
        msg(3, '2026-10-01T10:02:00Z', { senderUserId: 'p', senderRole: 'partner' }),
        msg(4, '2026-10-03T09:00:00Z', { senderUserId: 'p', senderRole: 'partner' }),
      ],
      4,
    );
    assert.deepEqual(
      rows.map((r) =>
        r.kind === 'message'
          ? `${r.startsGroup ? '*' : ''}${r.message.id}${r.endsGroup ? '.' : ''}`
          : r.kind,
      ),
      ['day', '*1', '2.', '*3.', 'day', 'unread', '*4.'],
    );
    assert.deepEqual(
      dayGroups(rows).map((g) => g.rows.length),
      [3, 2],
    );
  });
});

describe('deliveryState', () => {
  it('prefers local state, then read, then delivered', () => {
    assert.equal(deliveryState({ ...msg(1, 'x'), local: { id: 'a', status: 'failed' } }), 'failed');
    assert.equal(deliveryState(msg(1, 'x', { readAt: 'y', deliveredAt: 'y' })), 'read');
    assert.equal(deliveryState(msg(1, 'x', { deliveredAt: 'y' })), 'delivered');
    assert.equal(deliveryState(msg(1, 'x')), 'sent');
  });
});

describe('checkFiles', () => {
  const f = (name: string, type: string, size = 100) => ({ name, type, size });
  it('rejects unknown types, big files and more than ten per message', () => {
    const { ok, rejected } = checkFiles(
      [
        f('a.jpg', 'image/jpeg'),
        f('b.exe', 'application/x-msdownload'),
        f('c.pdf', 'application/pdf', 11 * 1024 * 1024),
        f('d.heic', ''),
      ],
      8,
    );
    assert.deepEqual(
      ok.map((x) => x.name),
      ['a.jpg', 'd.heic'],
    );
    assert.deepEqual(
      rejected.map((r) => r.problem),
      ['type', 'size'],
    );
    assert.equal(checkFiles([f('e.png', 'image/png')], 10).rejected[0]?.problem, 'count');
    assert.equal(fileType(f('x.HEIC', '')), 'image/heic');
  });
});

describe('linkParts', () => {
  it('finds http links without trailing punctuation', () => {
    assert.deepEqual(linkParts('Siehe https://example.com/a?b=1. Danke'), [
      { text: 'Siehe ' },
      { text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
      { text: '. Danke' },
    ]);
    assert.deepEqual(linkParts('javascript:alert(1)'), [{ text: 'javascript:alert(1)' }]);
  });
});

describe('daysAgo', () => {
  it('counts calendar days', () => {
    const now = new Date(2026, 9, 29, 9, 0);
    assert.equal(daysAgo(new Date(2026, 9, 29, 0, 5).toISOString(), now), 0);
    assert.equal(daysAgo(new Date(2026, 9, 28, 23, 59).toISOString(), now), 1);
  });
});

describe('initialsOf', () => {
  it('takes two initials and skips legal forms and email domains', () => {
    assert.equal(initialsOf('Teppichpflege Müller GmbH'), 'TM');
    assert.equal(initialsOf('Özkan & Söhne e.K.'), 'ÖS');
    assert.equal(initialsOf('Cleanilo'), 'CL');
    assert.equal(initialsOf('info@example.com'), 'IN');
    assert.equal(initialsOf('Reinigung Nord UG (haftungsbeschränkt)'), 'RN');
    assert.equal(initialsOf('  '), '?');
    assert.equal(initialsOf(null), '?');
  });
});

describe('sharedItems', () => {
  it('collects photos, files and http links newest first without duplicates', () => {
    const img = (key: string) => ({ key, name: `${key}.jpg`, size: 1, contentType: 'image/jpeg' });
    const pdf = { key: 'r', name: 'rechnung.pdf', size: 2, contentType: 'application/pdf' };
    const { images, files, links } = sharedItems([
      msg(1, '2026-10-01T10:00:00Z', {
        body: 'Alt: https://www.example.com/a und http://foo.de/x',
        attachments: [img('a')],
      }),
      msg(2, '2026-10-02T10:00:00Z', { body: 'ftp://nope.de javascript:alert(1)' }),
      msg(3, '2026-10-03T10:00:00Z', {
        body: 'Neu: https://www.example.com/a',
        attachments: [img('b'), pdf, img('a')],
      }),
      {
        ...msg(-1, '2026-10-04T10:00:00Z', { attachments: [img('c')] }),
        local: { id: 'x', status: 'sending' },
      },
    ]);
    assert.deepEqual(
      images.map((i) => i.attachment.key),
      ['b', 'a'],
    );
    assert.equal(images[1]?.messageId, 3);
    assert.deepEqual(
      files.map((f) => f.attachment.name),
      ['rechnung.pdf'],
    );
    assert.deepEqual(
      links.map((l) => `${l.host}@${l.messageId}`),
      ['example.com@3', 'foo.de@1'],
    );
  });
});

describe('insertAt', () => {
  it('replaces the selection and returns the caret after the insert', () => {
    assert.deepEqual(insertAt('Hallo Welt', 6, 6, '👋 '), { value: 'Hallo 👋 Welt', caret: 9 });
    assert.deepEqual(insertAt('abc', 1, 3, 'X'), { value: 'aX', caret: 2 });
    assert.deepEqual(insertAt('abc', 99, 99, '!'), { value: 'abc!', caret: 4 });
  });
});
