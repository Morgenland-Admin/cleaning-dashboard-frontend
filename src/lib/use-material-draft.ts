import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, brandMaterialsApi, type BrandMaterialDraft } from '@/lib/api';
import { mergeDraft, type MaterialDraftData } from '@/lib/material-data';

/** `server` = shared with the team; `local` = backend without the drafts API (this browser only). */
export type DraftMode = 'loading' | 'server' | 'local' | 'error';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'stale';
type Meta = Pick<BrandMaterialDraft, 'updatedAt' | 'updatedByName'>;
type DraftList = { drafts: BrandMaterialDraft[] };

const LOCAL_KEY = 'rp-material-draft:v2:';
const SAVE_DELAY = 700;

const queryKey = (companySlug: string) => ['brand-materials', companySlug] as const;
const metaOf = (row: BrandMaterialDraft): Meta => ({
  updatedAt: row.updatedAt,
  updatedByName: row.updatedByName,
});

// One save at a time per draft, across every component instance (prev/next, unmount flush).
const chains = new Map<string, Promise<void>>();
function enqueue(key: string, task: () => Promise<void>): Promise<void> {
  const next = (chains.get(key) ?? Promise.resolve()).then(task, task);
  chains.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

function cachedRow(qc: QueryClient, companySlug: string, path: string) {
  return qc
    .getQueryData<DraftList>(queryKey(companySlug))
    ?.drafts.find((d) => d.templatePath === path);
}

function putRow(qc: QueryClient, companySlug: string, row: BrandMaterialDraft) {
  qc.setQueryData<DraftList>(queryKey(companySlug), (old) => ({
    drafts: [...(old?.drafts ?? []).filter((d) => d.templatePath !== row.templatePath), row],
  }));
}

export function useMaterialDrafts(companySlug: string) {
  const query = useQuery({
    queryKey: queryKey(companySlug),
    queryFn: ({ signal }) => brandMaterialsApi.list(companySlug, signal),
    staleTime: 30_000,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
  const notDeployed = query.error instanceof ApiError && query.error.status === 404;
  // A failed background refetch keeps the data we have; only a failed first load is an error.
  const mode: DraftMode = query.data
    ? 'server'
    : query.isPending
      ? 'loading'
      : notDeployed
        ? 'local'
        : 'error';
  return { mode, drafts: query.data?.drafts ?? [], refetch: query.refetch };
}

function readLocal(companySlug: string, path: string): MaterialDraftData {
  try {
    const raw = window.localStorage.getItem(`${LOCAL_KEY}${companySlug}:${path}`);
    return raw ? (JSON.parse(raw) as MaterialDraftData) : {};
  } catch {
    return {};
  }
}

function writeLocal(companySlug: string, path: string, data: MaterialDraftData) {
  try {
    window.localStorage.setItem(`${LOCAL_KEY}${companySlug}:${path}`, JSON.stringify(data));
  } catch {
    // Storage blocked or full: the edit still shows for this visit.
  }
}

/**
 * One draft (a template, or `_brand`). Edits apply at once and autosave after a pause. Saves are
 * queued per draft and always send the newest known version; a conflict merges this client's
 * changes onto the newer server copy and saves again.
 */
export function useMaterialDraft(opts: {
  companySlug: string;
  path: string;
  canWrite: boolean;
  onStale?: () => void;
}) {
  const { companySlug, path, canWrite, onStale } = opts;
  const queryClient = useQueryClient();
  const { mode, drafts } = useMaterialDrafts(companySlug);
  const server = drafts.find((d) => d.templatePath === path);

  const [data, setData] = useState<MaterialDraftData>({});
  // The server copy `data` was last in step with; the merge base for conflicts.
  const [base, setBase] = useState<MaterialDraftData>({});
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loadedFor, setLoadedFor] = useState<DraftMode | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [dirty, setDirty] = useState(0);
  const latest = useRef({ data, base });
  const pending = useRef(false);
  const mounted = useRef(true);

  // Adopt the stored draft once; after a failed first load, take the server copy when it
  // arrives as long as nothing was typed. Later server versions (another tab, a refetch) are
  // merged under local changes.
  if (
    mode !== 'loading' &&
    (loadedFor === null || (loadedFor === 'error' && mode === 'server' && dirty === 0))
  ) {
    const initial = mode === 'local' ? readLocal(companySlug, path) : (server?.data ?? {});
    setLoadedFor(mode);
    setData(initial);
    setBase(initial);
    setMeta(server ? metaOf(server) : null);
  } else if (
    mode === 'server' &&
    loadedFor === 'server' &&
    server &&
    server.updatedAt !== meta?.updatedAt
  ) {
    setData(mergeDraft(base, data, server.data));
    setBase(server.data);
    setMeta(metaOf(server));
  }

  useEffect(() => {
    latest.current = { data, base };
  }, [data, base]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const save = useCallback(
    () =>
      enqueue(`${companySlug}:${path}`, async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          const payload = latest.current.data;
          try {
            const { draft } = await brandMaterialsApi.save(companySlug, {
              templatePath: path,
              data: payload,
              expectedUpdatedAt: cachedRow(queryClient, companySlug, path)?.updatedAt,
            });
            latest.current = { ...latest.current, base: payload };
            if (mounted.current) {
              setBase(payload);
              setMeta(metaOf(draft));
              setStatus('saved');
            }
            putRow(queryClient, companySlug, draft);
            return;
          } catch (err) {
            if (!(err instanceof ApiError && err.status === 409)) break;
            // Someone saved in between: merge our changes onto their version and retry once.
            const fresh = await brandMaterialsApi.list(companySlug).catch(() => null);
            if (!fresh) break;
            const row = fresh.drafts.find((d) => d.templatePath === path);
            const theirs = row?.data ?? {};
            const merged = mergeDraft(latest.current.base, latest.current.data, theirs);
            latest.current = { data: merged, base: theirs };
            if (mounted.current) {
              setData(merged);
              setBase(theirs);
              setMeta(row ? metaOf(row) : null);
              onStale?.();
            }
            queryClient.setQueryData(queryKey(companySlug), fresh);
          }
        }
        if (mounted.current) setStatus('error');
      }),
    [companySlug, path, queryClient, onStale, setBase, setMeta, setStatus, setData],
  );

  // Leaving the page inside the autosave pause still saves the last edit (queued behind any
  // save in flight, so it sends the version that save produced).
  const canSave = useRef(false);
  useEffect(() => {
    canSave.current = canWrite && mode === 'server';
  }, [canWrite, mode]);
  useEffect(
    () => () => {
      if (pending.current && canSave.current) void save();
    },
    [save],
  );

  const update = useCallback(
    (fn: (prev: MaterialDraftData) => MaterialDraftData) => {
      setData((prev) => fn(prev));
      setDirty((n) => n + 1);
      pending.current = true;
    },
    [setData, setDirty],
  );

  useEffect(() => {
    if (!dirty || !canWrite || mode === 'loading' || mode === 'error') return;
    if (mode === 'local') {
      writeLocal(companySlug, path, latest.current.data);
      pending.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      pending.current = false;
      setStatus('saving');
      void save();
    }, SAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [dirty, canWrite, mode, companySlug, path, save]);

  return {
    mode,
    data,
    update,
    status,
    meta,
    ready: loadedFor !== null,
    /** Editing on top of a draft that never loaded would overwrite it on save. */
    editable: canWrite && mode !== 'error' && mode !== 'loading',
  };
}
