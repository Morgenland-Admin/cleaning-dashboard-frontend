import type { DictKey } from '@/i18n';

/** Backend TaskKind values (lib/tasks.ts); t() echoes a missing key, so an unknown future kind falls back to its raw value. */
export function taskKindLabel(t: (key: DictKey) => string, kind: string): string {
  const key = `tasks.kindLabel.${kind}` as DictKey;
  const label = t(key);
  return label === key ? kind : label;
}
