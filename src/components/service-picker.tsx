import { Checkbox } from '@/components/ui/checkbox';
import { useT } from '@/i18n';

import type { CatalogEntry } from '@/lib/api';

/** Catalog checkboxes grouped by category; selected slugs that are inactive or unknown stay visible. */
export function ServicePicker({
  catalog,
  value,
  onChange,
  disabled,
}: {
  catalog: CatalogEntry[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const selected = new Set(value);
  const known = new Set(catalog.map((c) => c.slug));
  const visible = catalog.filter((c) => c.isActive || selected.has(c.slug));
  const groups = new Map<string, CatalogEntry[]>();
  for (const c of visible) {
    const key = c.category ?? t('serviceCatalog.noCategory');
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const unknown = value.filter((s) => !known.has(s));

  function toggle(slug: string, on: boolean) {
    onChange(on ? [...value, slug] : value.filter((s) => s !== slug));
  }

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([category, entries]) => (
        <fieldset key={category} className="space-y-2">
          <legend className="text-xs font-medium text-muted-foreground">{category}</legend>
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {entries.map((c) => (
              <label key={c.slug} className="flex items-start gap-2 text-2sm text-foreground">
                <Checkbox
                  className="mt-0.5"
                  checked={selected.has(c.slug)}
                  disabled={disabled}
                  onChange={(e) => toggle(c.slug, e.target.checked)}
                />
                <span className="min-w-0">
                  {c.name}
                  {!c.isActive ? (
                    <span className="text-muted-foreground"> · {t('serviceCatalog.inactive')}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {unknown.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-muted-foreground">
            {t('serviceCatalog.unknownSlugs')}
          </legend>
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {unknown.map((slug) => (
              <label key={slug} className="flex items-start gap-2 text-2sm text-foreground">
                <Checkbox
                  className="mt-0.5"
                  checked
                  disabled={disabled}
                  onChange={(e) => toggle(slug, e.target.checked)}
                />
                <span className="min-w-0 font-mono text-xs">{slug}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
