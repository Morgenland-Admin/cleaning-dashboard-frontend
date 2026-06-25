import { Loader2, MapPin } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';

const PHOTON_URL = 'https://photon.komoot.io/api/';
const PHOTON_LAT = 53.5443;
const PHOTON_LON = 10.0027;

export interface AddressPick {
  street: string;
  houseNumber: string;
  postcode: string;
  city: string;
  lat?: number;
  lon?: number;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    countrycode?: string;
  };
}

type Suggestion = AddressPick & { label: string; sub: string };

function featureToSuggestion(f: PhotonFeature): Suggestion | null {
  const p = f.properties;
  if (!p.street && !p.name) return null;
  const street = p.street ?? p.name ?? '';
  const houseNumber = p.housenumber ?? '';
  const postcode = p.postcode ?? '';
  const city = p.city ?? p.town ?? p.village ?? p.suburb ?? '';
  const line1 = `${street}${houseNumber ? ` ${houseNumber}` : ''}`.trim();
  if (!line1) return null;
  const coords = f.geometry?.coordinates;
  return {
    street,
    houseNumber,
    postcode,
    city,
    lat: coords ? coords[1] : undefined,
    lon: coords ? coords[0] : undefined,
    label: line1,
    sub: [postcode, city].filter(Boolean).join(' · '),
  };
}

interface Props {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  /** Fired when a suggestion is chosen — fill postal code / city from it. */
  onPick: (a: AddressPick) => void;
  placeholder?: string;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/** Type-ahead street search (Photon/OSM); selecting a result yields a structured address. */
export function AddressAutocomplete({
  id,
  value,
  onChange,
  onPick,
  placeholder = 'z. B. Brook 9',
  className,
  ...aria
}: Props) {
  const reactId = useId();
  const inputId = id ?? `addr-${reactId}`;
  const listboxId = `${inputId}-listbox`;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const ignoreNextFetchRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (ignoreNextFetchRef.current) {
      ignoreNextFetchRef.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3) {
      // Immediate reset when the query is too short — keeps the dropdown in sync
      // with the input, no debounce needed (and nothing to fetch).
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setResults([]);
      setLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const url = new URL(PHOTON_URL);
        url.searchParams.set('q', q);
        url.searchParams.set('lang', 'de');
        url.searchParams.set('limit', '6');
        url.searchParams.set('lat', String(PHOTON_LAT));
        url.searchParams.set('lon', String(PHOTON_LON));
        const res = await fetch(url.toString(), { signal: ctrl.signal });
        if (!res.ok) throw new Error('photon');
        const data: { features: PhotonFeature[] } = await res.json();
        const mapped = data.features
          .filter((f) => !f.properties.countrycode || f.properties.countrycode === 'DE')
          .map(featureToSuggestion)
          .filter((s): s is Suggestion => s !== null);
        setResults(mapped);
        setActiveIdx(mapped.length > 0 ? 0 : -1);
        setOpen(true);
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const choose = useCallback(
    (s: Suggestion) => {
      ignoreNextFetchRef.current = true;
      onChange(`${s.street}${s.houseNumber ? ` ${s.houseNumber}` : ''}`.trim());
      onPick(s);
      setOpen(false);
      setResults([]);
    },
    [onChange, onPick],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (e.key === 'ArrowDown' && results.length > 0) {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && activeIdx < results.length) {
        e.preventDefault();
        choose(results[activeIdx]!);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="address-line1"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={open && activeIdx >= 0 ? `${listboxId}-opt-${activeIdx}` : undefined}
        className={className}
        aria-describedby={aria['aria-describedby']}
        aria-invalid={aria['aria-invalid']}
      />
      {loading ? (
        <Loader2
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      ) : null}
      {open && results.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg"
        >
          {results.map((s, i) => {
            const active = i === activeIdx;
            return (
              <li
                key={`${s.label}-${s.sub}-${i}`}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className={
                  'flex cursor-pointer items-start gap-2.5 px-3 py-2.5 text-sm transition-colors ' +
                  (active ? 'bg-primary/10 text-foreground' : 'hover:bg-secondary/60')
                }
              >
                <MapPin
                  className={
                    'mt-0.5 size-4 shrink-0 ' + (active ? 'text-primary' : 'text-muted-foreground')
                  }
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{s.label}</div>
                  {s.sub ? (
                    <div className="truncate text-xs text-muted-foreground">{s.sub}</div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
