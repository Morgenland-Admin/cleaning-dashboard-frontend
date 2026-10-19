import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImageDown,
  Printer,
  Settings2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { MaterialBrandGuard } from '@/components/material-brand-guard';
import { MaterialEditor, type ResolvedQr } from '@/components/material-editor';
import { MaterialFrame, type MaterialFrameHandle } from '@/components/material-frame';
import { SaveState } from '@/components/material-save-state';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RecordNav } from '@/components/record-pager';
import { SectionCard } from '@/components/section';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { toast } from '@/hooks/use-toast';
import { useT, useLocale } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import { companiesAdminApi, uploadPublicImage } from '@/lib/api';
import {
  designSystemFor,
  findMaterial,
  materialBrand,
  materialFileName,
  materialHref,
  materialsFor,
  materialsListHref,
  materialsSettingsHref,
  materialSrc,
  templatePath,
  type BrandMeta,
  type MaterialDoc,
  type MaterialItem,
} from '@/lib/brand-materials';
import {
  downloadSheetPngs,
  printSheet,
  qrMarkup,
  type SheetInfo,
  type SheetPick,
  type SheetState,
} from '@/lib/brand-materials-export';
import {
  BRAND_PATH,
  companyValues,
  effectiveValues,
  isBrandValue,
  isQrPurpose,
  resolveQr,
  type MaterialDraftData,
} from '@/lib/material-data';
import { formatPrintSize, matchPrintSizes } from '@/lib/material-print';
import { useMaterialDraft } from '@/lib/use-material-draft';
import { usePageTitle } from '@/lib/use-page-title';
import { NotFoundPage } from '@/pages/not-found';

type Zoom = 'fit' | 'actual';

/** `/materialien/:brand/:set/:slug` (one template) and `/materialien/:brand/designsystem`. */
export function MaterialDetailPage() {
  const { brand: brandId, set, slug } = useParams();
  const brand = materialBrand(brandId);
  const item = findMaterial(brandId, set, slug);
  const doc = item ?? (!set && brand ? designSystemFor(brand.id) : undefined);
  if (!brand || !doc) return <NotFoundPage />;
  // Keyed so prev/next starts every template with fresh state.
  return (
    <MaterialBrandGuard brand={brand} page={{ item, view: item ? 'template' : 'system' }}>
      <MaterialView key={doc.path} brand={brand} item={item} doc={doc} />
    </MaterialBrandGuard>
  );
}

/** Shrinks a photo for browser-only drafts (no server to upload to). */
async function fileToDataUrl(file: File, maxSide = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function setEntry(
  record: Record<string, string> | undefined,
  key: string,
  value: string | null,
): Record<string, string> {
  const rest = Object.fromEntries(Object.entries(record ?? {}).filter(([k]) => k !== key));
  return value === null ? rest : { ...rest, [key]: value };
}

function MaterialView({
  brand,
  item,
  doc,
}: {
  brand: BrandMeta;
  item: MaterialItem | undefined;
  doc: MaterialDoc;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const canWrite = useCanWrite();
  const title = item?.title ?? t('materials.designSystemOf', { brand: brand.name });
  usePageTitle(title);

  const frame = useRef<MaterialFrameHandle>(null);
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [variant, setVariant] = useState<string | undefined>(item?.variants?.[0]);
  const [info, setInfo] = useState<SheetInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [focus, setFocus] = useState<{ pick: SheetPick; at: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [qrSvgs, setQrSvgs] = useState<Record<string, string>>({});
  const [qrErrors, setQrErrors] = useState<number[]>([]);

  const onStale = useCallback(() => toast({ title: t('materials.stale') }), [t]);
  const tpl = useMaterialDraft({
    companySlug: brand.companySlug,
    path: templatePath(item),
    canWrite,
    onStale,
  });
  const brandDraft = useMaterialDraft({
    companySlug: brand.companySlug,
    path: BRAND_PATH,
    canWrite,
    onStale,
  });

  const companies = useQuery({
    queryKey: ['projects-companies'],
    queryFn: ({ signal }) => companiesAdminApi.list(signal),
    staleTime: 60_000,
  });
  const company = companies.data?.companies.find((c) => c.slug === brand.companySlug);
  const fromCompany = useMemo(() => companyValues(company), [company]);
  const values = useMemo(
    () => effectiveValues(fromCompany, brandDraft.data.values, tpl.data.values),
    [fromCompany, brandDraft.data.values, tpl.data.values],
  );

  const qr = useMemo<ResolvedQr[]>(
    () =>
      (info?.qr ?? []).map((slot) => {
        const purpose = isQrPurpose(slot.purpose) ? slot.purpose : 'website';
        return {
          index: slot.index,
          purpose,
          board: slot.board,
          ...resolveQr({
            purpose,
            override: tpl.data.qr?.[slot.index],
            links: brandDraft.data.links,
            defaults: brand.links,
            utm: brandDraft.data.utm ?? true,
            campaign: `${brand.id}-${item?.slug ?? 'designsystem'}`,
          }),
        };
      }),
    [info?.qr, tpl.data.qr, brandDraft.data.links, brandDraft.data.utm, brand, item?.slug],
  );

  // Real, scannable QR codes in each slot's own colour.
  const qrKey = JSON.stringify(qr.map((c) => [c.content, info?.qr[c.index]?.color]));
  useEffect(() => {
    let alive = true;
    const codes = JSON.parse(qrKey) as [string, string | undefined][];
    // Per slot: content too long for a QR code fails that slot only (it shows the design's dummy).
    void Promise.allSettled(
      codes.map(([content, color]) => qrMarkup(content, color ?? '#000000')),
    ).then((results) => {
      if (!alive) return;
      const svgs: Record<string, string> = {};
      const failed: number[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') svgs[i] = r.value;
        else failed.push(i);
      });
      setQrSvgs(svgs);
      setQrErrors(failed);
    });
    return () => {
      alive = false;
    };
  }, [qrKey]);

  const sheetState = useMemo<SheetState>(
    () => ({
      edits: tpl.data.edits ?? {},
      values,
      qr: qrSvgs,
      images: tpl.data.images ?? {},
    }),
    [tpl.data.edits, tpl.data.images, values, qrSvgs],
  );

  const updateTpl = (key: keyof MaterialDraftData, entry: string, value: string | null) =>
    tpl.update((prev) => ({
      ...prev,
      [key]: setEntry(prev[key] as Record<string, string> | undefined, entry, value),
    }));

  const onImage = async (index: number, file: File | null) => {
    if (!file) {
      updateTpl('images', String(index), null);
      return;
    }
    try {
      const url =
        tpl.mode === 'server'
          ? await uploadPublicImage(brand.companySlug, file, undefined, 'materials')
          : await fileToDataUrl(file);
      updateTpl('images', String(index), url);
    } catch {
      toast({ title: t('materials.imageFailed'), variant: 'destructive' });
    }
  };

  const onPick = useCallback((pick: SheetPick) => setFocus({ pick, at: Date.now() }), []);

  const boards = useMemo(() => info?.boards ?? [], [info]);
  const pages = useMemo(() => matchPrintSizes(boards, item?.print), [boards, item?.print]);
  const openPlaceholders = (info?.placeholders ?? []).filter((p) => !values[p.key]?.trim());

  const listHref = materialsListHref(brand.id, item?.set ?? 'kunden');
  const fileName = item
    ? materialFileName(item, item.variants ? variant : undefined)
    : `${brand.short}-designsystem`;

  const print = () => {
    const el = frame.current?.frame;
    if (el) printSheet(el, { pages, fileName });
  };

  const png = async () => {
    const el = frame.current?.frame;
    if (!el || !boards.length) return;
    setExporting(true);
    try {
      await downloadSheetPngs(el, { boards, pages, fileName });
    } catch {
      toast({ title: t('materials.pngFailed'), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageContainer>
      <RecordNav pager={item ? <MaterialPager item={item} /> : undefined}>
        <BackLink to={listHref}>{t('materials.back')}</BackLink>
      </RecordNav>

      <PageHeading
        title={title}
        meta={
          <>
            <Badge variant="secondary">{brand.short}</Badge>
            {item ? <Badge variant="outline">{item.format}</Badge> : null}
          </>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={materialSrc(doc)} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" />
                {t('materials.openTab')}
              </a>
            </Button>
            <Button variant="outline" onClick={png} loading={exporting} disabled={!info}>
              <ImageDown aria-hidden="true" />
              {boards.length > 1
                ? t('materials.pngMany', { n: boards.length })
                : t('materials.png')}
            </Button>
            <Button onClick={print} disabled={!info}>
              <Printer aria-hidden="true" />
              {t('materials.pdf')}
            </Button>
          </>
        }
      />

      {failed ? (
        <Alert
          tone="destructive"
          title={t('materials.loadFailed')}
          className="mb-4"
          action={
            <Button size="xs" variant="outline" onClick={() => window.location.reload()}>
              {t('materials.reload')}
            </Button>
          }
        />
      ) : openPlaceholders.length > 0 ? (
        <Alert
          tone="warning"
          title={t('materials.placeholdersTitle')}
          className="mb-4"
          action={
            <Button
              size="xs"
              variant="outline"
              onClick={() => onPick({ kind: 'placeholder', key: openPlaceholders[0]!.key })}
            >
              {t('materials.jumpToFirst')}
            </Button>
          }
        >
          {t('materials.placeholdersOpen', {
            n: openPlaceholders.length,
            list: openPlaceholders
              .slice(0, 4)
              .map((p) => p.label)
              .join(', '),
          })}
        </Alert>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-label={title} className="min-w-0 rounded-lg border bg-muted">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
            {item?.variants ? (
              <SegmentedControl
                size="sm"
                label={t('materials.variantAria')}
                value={variant ?? item.variants[0]!}
                onValueChange={setVariant}
                options={item.variants.map((v) => ({ value: v, label: v }))}
              />
            ) : (
              <span className="text-xs text-muted-foreground">{t('materials.clickToEdit')}</span>
            )}
            <SegmentedControl
              size="sm"
              label={t('materials.zoomAria')}
              value={zoom}
              onValueChange={setZoom}
              options={[
                { value: 'fit', label: t('materials.zoomFit') },
                { value: 'actual', label: t('materials.zoomActual') },
              ]}
            />
          </div>
          <div className="p-3 sm:p-4">
            <MaterialFrame
              ref={frame}
              doc={doc}
              title={title}
              zoom={zoom}
              props={variant ? { docType: variant } : undefined}
              state={sheetState}
              onPick={onPick}
              onInfo={setInfo}
              onError={() => setFailed(true)}
            />
          </div>
        </section>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto xl:pr-1">
          {info ? (
            <MaterialEditor
              info={info}
              brandName={brand.name}
              canWrite={tpl.editable && brandDraft.editable}
              edits={tpl.data.edits ?? {}}
              values={{ ...brandDraft.data.values, ...tpl.data.values }}
              companyValues={fromCompany}
              qr={qr}
              qrErrors={qrErrors}
              qrOverrides={tpl.data.qr ?? {}}
              images={tpl.data.images ?? {}}
              onText={(key, value) => updateTpl('edits', key, value)}
              onValue={(key, value) => {
                // Company facts go to every template; customer/document details stay on this one.
                const draft = isBrandValue(key) ? brandDraft : tpl;
                draft.update((prev) => ({ ...prev, values: setEntry(prev.values, key, value) }));
              }}
              onQr={(index, value) => updateTpl('qr', String(index), value)}
              onImage={onImage}
              onResetTemplate={() => tpl.update(() => ({}))}
              focus={focus}
              settingsLink={
                <Link
                  to={materialsSettingsHref(brand.id)}
                  className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                >
                  <Settings2 className="size-3.5" aria-hidden="true" />
                  {t('materials.qrDefaultsLink')}
                </Link>
              }
              footer={
                <SaveState
                  mode={tpl.mode}
                  status={tpl.status}
                  meta={tpl.meta}
                  canWrite={canWrite}
                  bcp47={bcp47}
                />
              }
            />
          ) : null}

          <SectionCard title={t('materials.details')} bodyClassName="px-4 py-3">
            <KeyValueList>
              <KeyValue label={t('materials.brand')} value={brand.name} />
              {item ? (
                <>
                  <KeyValue
                    label={t('materials.setLabel')}
                    value={t(`materials.set.${item.set}`)}
                  />
                  <KeyValue label={t('materials.number')} value={item.no} />
                </>
              ) : null}
              {boards.map((board, i) => (
                <KeyValue
                  key={i}
                  label={
                    boards.length > 1
                      ? (board.name?.split('·')[0]?.trim() ?? t('materials.pageN', { n: i + 1 }))
                      : t('materials.printSize')
                  }
                  value={formatPrintSize(pages[i] ?? null) ?? t('materials.screenSize')}
                />
              ))}
              <KeyValue
                label={t('materials.file')}
                value={<span className="font-mono text-xs">{fileName}</span>}
              />
            </KeyValueList>
          </SectionCard>

          {info?.notes.length ? (
            <SectionCard title={t('materials.notesTitle')} bodyClassName="px-4 py-3">
              <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                {info.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('materials.printNote')}
          </p>
        </aside>
      </div>
    </PageContainer>
  );
}

function MaterialPager({ item }: { item: MaterialItem }) {
  const t = useT();
  const list = materialsFor(item.brand, item.set);
  const i = list.findIndex((m) => m.slug === item.slug);
  const prev = list[i - 1];
  const next = list[i + 1];
  const nav = (target: MaterialItem | undefined, label: string, icon: React.ReactNode) =>
    target ? (
      <Button variant="ghost" size="icon" className="sm:size-8" asChild>
        <Link to={materialHref(target)} replace aria-label={`${label}: ${target.title}`}>
          {icon}
        </Link>
      </Button>
    ) : (
      <Button variant="ghost" size="icon" className="sm:size-8" aria-label={label} disabled>
        {icon}
      </Button>
    );
  return (
    <div
      role="group"
      aria-label={t('materials.position', { n: i + 1, total: list.length })}
      className="flex items-center gap-0.5"
    >
      {nav(prev, t('materials.previous'), <ChevronLeft aria-hidden="true" />)}
      <span
        aria-hidden="true"
        className="min-w-12 text-center text-xs tabular-nums text-muted-foreground"
      >
        {i + 1} / {list.length}
      </span>
      {nav(next, t('materials.next'), <ChevronRight aria-hidden="true" />)}
    </div>
  );
}
