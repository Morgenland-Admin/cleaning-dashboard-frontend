import type { ChatAttachment, ChatMessage } from './api.ts';

/** A message as the thread shows it; `local` marks an optimistic one not yet on the server. */
export type ThreadMessage = ChatMessage & {
  local?: { id: string; status: 'sending' | 'failed' };
};

export type DeliveryState = 'sending' | 'failed' | 'sent' | 'delivered' | 'read';

export const LEGACY_ADMIN_SENDER = 'legacy-admin';
export const MAX_BODY = 8000;
export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const GROUP_GAP_MS = 5 * 60 * 1000;

// Same list as the backend's admin sign-upload.
export const ALLOWED_FILE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
]);
// Some browsers leave `type` empty for these.
const TYPE_BY_EXT: Record<string, string> = {
  heic: 'image/heic',
  heif: 'image/heif',
  csv: 'text/csv',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function fileType(file: { name: string; type: string }): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return TYPE_BY_EXT[ext] ?? '';
}

export type FileProblem = 'type' | 'size' | 'count';

/** Splits picked files into uploadable ones and rejects, keeping the per-message limit. */
export function checkFiles<F extends { name: string; type: string; size: number }>(
  files: F[],
  alreadyAttached: number,
): { ok: F[]; rejected: Array<{ file: F; problem: FileProblem }> } {
  const ok: F[] = [];
  const rejected: Array<{ file: F; problem: FileProblem }> = [];
  for (const file of files) {
    if (!ALLOWED_FILE_TYPES.has(fileType(file))) rejected.push({ file, problem: 'type' });
    else if (file.size > MAX_FILE_BYTES) rejected.push({ file, problem: 'size' });
    else if (alreadyAttached + ok.length >= MAX_FILES) rejected.push({ file, problem: 'count' });
    else ok.push(file);
  }
  return { ok, rejected };
}

export function isImageFile(att: Pick<ChatAttachment, 'name' | 'contentType'>): boolean {
  if (att.contentType) return att.contentType.startsWith('image/');
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(att.name);
}

export function formatBytes(bytes: number, bcp47 = 'de-DE'): string {
  const n = new Intl.NumberFormat(bcp47, { maximumFractionDigits: 1 });
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${n.format(bytes / 1024)} KB`;
  return `${n.format(bytes / 1024 / 1024)} MB`;
}

const byTime = (a: ChatMessage, b: ChatMessage) =>
  a.createdAt === b.createdAt ? a.id - b.id : a.createdAt < b.createdAt ? -1 : 1;

/** Server pages (newest page first) → one ordered list without duplicates. */
export function mergePages(pages: Array<{ messages: ChatMessage[] }>): ChatMessage[] {
  const byId = new Map<number, ChatMessage>();
  for (const page of pages) for (const m of page.messages) byId.set(m.id, m);
  return [...byId.values()].sort(byTime);
}

export function deliveryState(m: ThreadMessage): DeliveryState {
  if (m.local) return m.local.status;
  if (m.readAt) return 'read';
  if (m.deliveredAt) return 'delivered';
  return 'sent';
}

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export type ThreadRow =
  | { kind: 'day'; key: string; date: string }
  | { kind: 'unread'; key: string }
  | {
      kind: 'message';
      key: string;
      message: ThreadMessage;
      /** First of a run from the same sender (shows the sender label, more spacing). */
      startsGroup: boolean;
      /** Last of its run (bubble corner shape). */
      endsGroup: boolean;
    };

/** Day separators, the "new messages" divider and sender runs for the message list. */
export function threadRows(messages: ThreadMessage[], firstUnreadId: number | null): ThreadRow[] {
  const rows: ThreadRow[] = [];
  let prev: ThreadMessage | null = null;
  let prevRow: Extract<ThreadRow, { kind: 'message' }> | null = null;
  for (const m of messages) {
    const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
    if (newDay) rows.push({ kind: 'day', key: `day-${dayKey(m.createdAt)}`, date: m.createdAt });
    const unread = m.id === firstUnreadId;
    if (unread) rows.push({ kind: 'unread', key: 'unread' });
    const startsGroup =
      newDay ||
      unread ||
      !prev ||
      prev.senderUserId !== m.senderUserId ||
      new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > GROUP_GAP_MS;
    if (prevRow && startsGroup) prevRow.endsGroup = true;
    const row = {
      kind: 'message' as const,
      key: m.local?.id ?? String(m.id),
      message: m,
      startsGroup,
      endsGroup: false,
    };
    rows.push(row);
    prev = m;
    prevRow = row;
  }
  if (prevRow) prevRow.endsGroup = true;
  return rows;
}

export type DayGroup = { key: string; date: string; rows: Exclude<ThreadRow, { kind: 'day' }>[] };

/** One group per day, so each day label sticks only while its own messages are on screen. */
export function dayGroups(rows: ThreadRow[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const row of rows) {
    if (row.kind === 'day') groups.push({ key: row.key, date: row.date, rows: [] });
    else groups.at(-1)?.rows.push(row);
  }
  return groups;
}

/** 0 = today, 1 = yesterday, … in the viewer's local calendar. */
export function daysAgo(iso: string, now = new Date()): number {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((start(now) - start(d)) / 86_400_000);
}

const URL_RE = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'])/g;

/** Text split into plain parts and http(s) links. */
export function linkParts(text: string): Array<{ text: string; href?: string }> {
  return text
    .split(URL_RE)
    .map((part, i) => (i % 2 === 1 ? { text: part, href: part } : { text: part }))
    .filter((p) => p.text !== '');
}

const LEGAL_FORMS = new Set([
  'gmbh',
  'mbh',
  'ug',
  'ag',
  'kg',
  'gbr',
  'ohg',
  'ek',
  'co',
  'cokg',
  'haftungsbeschränkt',
  '&',
]);

/** Two-letter avatar initials; legal forms ("GmbH", "UG") and email domains are skipped. */
export function initialsOf(name: string | null | undefined): string {
  const raw = (name ?? '').trim();
  const base = raw.includes('@') && !raw.includes(' ') ? raw.split('@')[0]! : raw;
  const words = base
    .split(/\s+/)
    .filter((w) => !LEGAL_FORMS.has(w.toLowerCase().replace(/[^\p{L}&]/gu, '')))
    .flatMap((w) => w.split(/[-_.()/]+/))
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (words.length === 0) return '?';
  const letters =
    words.length === 1 ? [...words[0]!].slice(0, 2) : [[...words[0]!][0], [...words[1]!][0]];
  return letters.join('').toLocaleUpperCase('de-DE');
}

export type SharedFile = { attachment: ChatAttachment; at: string; messageId: number };
export type SharedLink = { href: string; host: string; at: string; messageId: number };

/** Photos, files and links of the loaded messages, newest first, without duplicates. */
export function sharedItems(messages: ThreadMessage[]): {
  images: SharedFile[];
  files: SharedFile[];
  links: SharedLink[];
} {
  const images: SharedFile[] = [];
  const files: SharedFile[] = [];
  const links: SharedLink[] = [];
  const seen = new Set<string>();
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.local) continue;
    for (const attachment of m.attachments) {
      if (seen.has(`a:${attachment.key}`)) continue;
      seen.add(`a:${attachment.key}`);
      (isImageFile(attachment) ? images : files).push({
        attachment,
        at: m.createdAt,
        messageId: m.id,
      });
    }
    // Later links in one message come first, matching the newest-first order.
    const found = m.body ? linkParts(m.body).filter((p) => p.href) : [];
    for (let j = found.length - 1; j >= 0; j--) {
      const href = found[j]!.href!;
      if (seen.has(`l:${href}`)) continue;
      let url: URL;
      try {
        url = new URL(href);
      } catch {
        continue;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      seen.add(`l:${href}`);
      links.push({
        href,
        host: url.hostname.replace(/^www\./, ''),
        at: m.createdAt,
        messageId: m.id,
      });
    }
  }
  return { images, files, links };
}

/** Replaces the selection [start, end) with `insert`; returns the new value and caret. */
export function insertAt(
  value: string,
  start: number,
  end: number,
  insert: string,
): { value: string; caret: number } {
  const from = Math.max(0, Math.min(start, value.length));
  const to = Math.max(from, Math.min(end, value.length));
  return { value: value.slice(0, from) + insert + value.slice(to), caret: from + insert.length };
}
