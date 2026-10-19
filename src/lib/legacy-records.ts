// "Altdaten" helpers. Pure (type imports only) so `node --test` can run them directly.
import type { LegacyTableSummary } from './api';

/** Known import sources, in display order; anything else follows alphabetically. */
export const LEGACY_SOURCES = ['cleanilo_ops', 'cleanilo_cms'] as const;
export type KnownLegacySource = (typeof LEGACY_SOURCES)[number];

export function isKnownLegacySource(source: string): source is KnownLegacySource {
  return (LEGACY_SOURCES as readonly string[]).includes(source);
}

export interface LegacySourceGroup {
  source: string;
  tables: LegacyTableSummary[];
  total: number;
}

export function groupLegacyTables(tables: LegacyTableSummary[]): LegacySourceGroup[] {
  const bySource = new Map<string, LegacyTableSummary[]>();
  for (const row of tables) {
    const list = bySource.get(row.source) ?? [];
    list.push(row);
    bySource.set(row.source, list);
  }
  const rank = (s: string) => {
    const i = (LEGACY_SOURCES as readonly string[]).indexOf(s);
    return i < 0 ? LEGACY_SOURCES.length : i;
  };
  return [...bySource.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([source, rows]) => ({
      source,
      tables: [...rows].sort((a, b) => a.table.localeCompare(b.table)),
      total: rows.reduce((n, r) => n + Number(r.count), 0),
    }));
}

export function legacyTablePath(source: string, table: string): string {
  return `/altdaten/${encodeURIComponent(source)}/${encodeURIComponent(table)}`;
}

export function legacyRecordPath(id: number): string {
  return `/altdaten/eintrag/${id}`;
}

/** Fields of a raw row, alphabetical (jsonb does not keep the original key order). */
export function sortedFields(data: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(data).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }),
  );
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
