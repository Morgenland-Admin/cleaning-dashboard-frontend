import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CountPill } from '@/components/count-pill';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RecordNav, RecordPager } from '@/components/record-pager';
import { SectionCard } from '@/components/section';
import { ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import { ApiError, errMessage, legacyRecordsAdminApi, type LegacyRecord } from '@/lib/api';
import { legacyRecordPath, legacyTablePath, sortedFields } from '@/lib/legacy-records';
import { readListNav } from '@/lib/list-nav';
import { usePageTitle } from '@/lib/use-page-title';
import { formatNumber } from '@/lib/utils';
import { legacyDateTime, legacySourceLabel } from '@/pages/legacy-shared';

import type { ReactNode } from 'react';

type T = ReturnType<typeof useT>;

export function LegacyRecordPage() {
  const params = useParams();
  const id = params.id && /^\d+$/.test(params.id) ? Number(params.id) : null;
  // Keyed by id: prev/next must not carry an open confirm over to the next record.
  return <LegacyRecordView key={id ?? 'invalid'} id={id} />;
}

function LegacyRecordView({ id }: { id: number | null }) {
  const t = useT();
  const { bcp47 } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeProject, isAllBrands } = useProject();
  const slug = activeProject.companySlug;

  const detail = useQuery({
    queryKey: ['legacy-record', slug, id] as const,
    queryFn: ({ signal }) => legacyRecordsAdminApi.get(slug, id!, signal),
    enabled: id != null && !isAllBrands,
  });
  const record = detail.data?.record ?? null;
  usePageTitle(
    record ? t('legacy.record.title', { id: record.legacyId }) : t('legacy.record.fallbackTitle'),
  );

  const { from } = readListNav(location.state);
  const tablePath = record ? legacyTablePath(record.source, record.legacyTable) : '/altdaten';
  const fromSearch = !!from?.startsWith('/altdaten?');
  const backTo = from?.startsWith('/altdaten/') || fromSearch ? from! : tablePath;
  const backLabel = fromSearch
    ? t('legacy.search.backToResults')
    : record
      ? record.legacyTable
      : t('legacy.title');

  // Cache is dropped on unmount: removing a still-observed query would refetch the deleted row.
  const deleted = useRef(false);
  useEffect(() => {
    const flag = deleted;
    return () => {
      if (flag.current) queryClient.removeQueries({ queryKey: ['legacy-record', slug, id] });
    };
  }, [queryClient, slug, id]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => legacyRecordsAdminApi.remove(slug, id!),
    onSuccess: () => {
      toast.success(t('legacy.record.deleted'));
      void queryClient.invalidateQueries({ queryKey: ['legacy-summary', slug] });
      void queryClient.invalidateQueries({ queryKey: ['legacy-search', slug] });
      if (record) {
        void queryClient.invalidateQueries({
          queryKey: ['legacy-records', slug, record.source, record.legacyTable],
        });
      }
      deleted.current = true;
      navigate(backTo, { replace: true });
    },
    onError: (err) => {
      setConfirmOpen(false);
      toast.error(errMessage(err));
    },
  });

  const backRow = (pager?: ReactNode) => (
    <RecordNav pager={pager}>
      <BackLink to={backTo}>{backLabel}</BackLink>
    </RecordNav>
  );

  if (isAllBrands) {
    return (
      <PageContainer>
        {backRow()}
        <PageHeading title={t('legacy.record.fallbackTitle')} />
        <EmptyState
          variant="dashed"
          icon={<Archive aria-hidden="true" />}
          message={t('legacy.selectBrandFirst')}
        />
      </PageContainer>
    );
  }

  if (id == null || (!record && !detail.isLoading)) {
    const error =
      detail.error && !(detail.error instanceof ApiError && detail.error.status === 404)
        ? detail.error instanceof ApiError
          ? detail.error
          : new Error(t('legacy.loadFailed'))
        : null;
    return (
      <PageContainer>
        {backRow()}
        <PageHeading title={t('legacy.record.fallbackTitle')} />
        {error ? (
          <ErrorState
            error={error}
            onRetry={() => void detail.refetch()}
            retrying={detail.isFetching}
          />
        ) : (
          <EmptyState variant="dashed" message={t('legacy.record.notFound')} />
        )}
      </PageContainer>
    );
  }

  if (!record) {
    return (
      <PageContainer>
        {backRow()}
        <LoadingState label={t('legacy.loading')} />
      </PageContainer>
    );
  }

  const sourceLabel = legacySourceLabel(record.source, t);

  return (
    <PageContainer>
      {backRow(<RecordPager currentId={record.id} hrefFor={legacyRecordPath} />)}
      <PageHeading
        title={
          <span className="[overflow-wrap:anywhere]">
            {t('legacy.record.title', { id: record.legacyId })}
          </span>
        }
        meta={<Badge variant="secondary">{sourceLabel}</Badge>}
        subtitle={`${record.legacyTable} · ${
          record.legacyCreatedAt
            ? legacyDateTime(record.legacyCreatedAt, bcp47)
            : t('legacy.noDate')
        }`}
        actions={
          <Button variant="outline-destructive" size="sm" onClick={() => setConfirmOpen(true)}>
            <Trash2 aria-hidden="true" />
            {t('legacy.record.delete')}
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <RecordData record={record} t={t} bcp47={bcp47} />

        <aside className="flex min-w-0 flex-col gap-5" aria-label={t('legacy.record.details')}>
          <SectionCard title={t('legacy.record.details')}>
            <KeyValueList layout="stacked">
              <KeyValue label={t('legacy.record.source')} value={sourceLabel} />
              <KeyValue label={t('legacy.record.table')} value={record.legacyTable} />
              <KeyValue
                label={t('legacy.record.legacyId')}
                value={<span className="font-mono text-xs">{record.legacyId}</span>}
              />
              <KeyValue
                label={t('legacy.record.createdAt')}
                value={
                  record.legacyCreatedAt ? (
                    <span className="tabular-nums">
                      {legacyDateTime(record.legacyCreatedAt, bcp47)}
                    </span>
                  ) : null
                }
                empty={t('legacy.noDate')}
              />
              <KeyValue
                label={t('legacy.record.importedAt')}
                value={
                  <span className="tabular-nums">{legacyDateTime(record.importedAt, bcp47)}</span>
                }
              />
              <KeyValue
                label={t('legacy.record.archiveId')}
                value={<span className="tabular-nums">{record.id}</span>}
              />
            </KeyValueList>
          </SectionCard>
        </aside>
      </div>

      {confirmOpen ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !remove.isPending) setConfirmOpen(false);
          }}
          title={t('legacy.record.deleteTitle')}
          description={t('legacy.record.deleteDescription', {
            id: record.legacyId,
            table: record.legacyTable,
          })}
          confirmLabel={t('legacy.record.deleteConfirm')}
          isDangerous
          isPending={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      ) : null}
    </PageContainer>
  );
}

function RecordData({ record, t, bcp47 }: { record: LegacyRecord; t: T; bcp47: string }) {
  const fields = useMemo(() => sortedFields(record.data ?? {}), [record.data]);
  const json = useMemo(() => JSON.stringify(record.data ?? {}, null, 2), [record.data]);

  return (
    <Tabs defaultValue="fields" className="min-w-0">
      <TabsList variant="line" overflow="scroll" aria-label={t('legacy.record.view')}>
        <TabsTrigger value="fields">
          {t('legacy.record.fields')}
          <CountPill>{formatNumber(fields.length, bcp47)}</CountPill>
        </TabsTrigger>
        <TabsTrigger value="raw">{t('legacy.record.raw')}</TabsTrigger>
      </TabsList>

      <TabsContent value="fields" className="mt-4">
        {fields.length === 0 ? (
          <EmptyState variant="dashed" size="sm" message={t('legacy.record.noFields')} />
        ) : (
          <dl className="divide-y divide-border rounded-lg border border-border bg-card text-2sm">
            {fields.map(([key, value]) => (
              <div
                key={key}
                className="grid gap-1 px-4 py-2.5 sm:grid-cols-[minmax(8rem,14rem)_minmax(0,1fr)] sm:gap-4"
              >
                <dt className="break-all font-mono text-xs leading-5 text-muted-foreground">
                  {key}
                </dt>
                <dd className="min-w-0">
                  <FieldValue value={value} t={t} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </TabsContent>

      <TabsContent value="raw" className="mt-4">
        <pre className="max-h-[70svh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted p-4 font-mono text-xs leading-5 text-foreground">
          {json}
        </pre>
      </TabsContent>
    </Tabs>
  );
}

function FieldValue({ value, t }: { value: unknown; t: T }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (typeof value === 'boolean') {
    return <span>{value ? t('common.yes') : t('common.no')}</span>;
  }
  // Raw on purpose: phone numbers, years and ids must not get thousands separators.
  if (typeof value === 'number') {
    return <span className="tabular-nums">{String(value)}</span>;
  }
  if (typeof value === 'string') {
    if (value.trim() === '') {
      return <span className="text-muted-foreground">({t('legacy.record.emptyText')})</span>;
    }
    return <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{value}</span>;
  }
  const isEmpty = Array.isArray(value)
    ? value.length === 0
    : typeof value === 'object' && Object.keys(value).length === 0;
  if (isEmpty) {
    return (
      <span className="font-mono text-xs text-muted-foreground">
        {Array.isArray(value) ? '[]' : '{}'}
      </span>
    );
  }
  return (
    <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 font-mono text-xs leading-5 text-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
