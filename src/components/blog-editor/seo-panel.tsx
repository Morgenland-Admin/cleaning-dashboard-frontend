import {
  AlertTriangle,
  ChevronRight,
  CircleX,
  Info,
  Lightbulb,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT, type DictKey } from '@/i18n';
import {
  META_DESCRIPTION_RANGE,
  SEO_TITLE_RANGE,
  type IssueLevel,
  type SeoIssue,
} from '@/lib/blog-seo';
import { cn } from '@/lib/utils';

import { ImageField } from './image-field';

import type { CompanySlug } from '@/contexts/project-context';
import type { SeoPageMeta } from '@/lib/api';

// Off-palette colours on purpose: previews Google's own link colours (allowlisted in scripts/check-design-tokens.mjs).
export function SerpPreview({
  brand,
  url,
  title,
  description,
}: {
  brand: string;
  url: string;
  title: string;
  description: string;
}) {
  const crumbs = url
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .split('/');
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-card p-3">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-2xs font-semibold text-muted-foreground"
        >
          {brand.slice(0, 1)}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-xs text-foreground">{brand}</p>
          <p className="truncate text-2xs text-muted-foreground">{crumbs.join(' › ')}</p>
        </div>
      </div>
      <p className="line-clamp-2 text-base leading-snug text-[#1a0dab] dark:text-blue-400">
        {title}
      </p>
      <p className="line-clamp-3 text-2sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

export function SocialPreview({
  image,
  domain,
  title,
  description,
}: {
  image: string | null;
  domain: string;
  title: string;
  description: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="aspect-[1.91/1] bg-muted">
        {image ? <img src={image} alt="" className="size-full object-cover" /> : null}
      </div>
      <div className="flex flex-col gap-0.5 border-t border-border bg-muted/40 px-3 py-2">
        <p className="truncate text-2xs text-muted-foreground">{domain}</p>
        <p className="line-clamp-2 text-2sm font-semibold leading-snug">{title}</p>
        <p className="line-clamp-1 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

/** Character count with soft guidance; the colour is never the only signal (text says it too). */
export function CharCount({
  id,
  n,
  range,
}: {
  id: string;
  n: number;
  range: { min: number; max: number };
}) {
  const t = useT();
  const state = n === 0 ? 'empty' : n > range.max ? 'long' : n < range.min ? 'short' : 'ok';
  return (
    <span
      id={id}
      className={cn(
        'text-xs tabular-nums',
        state === 'long' || state === 'short' ? 'text-warning' : 'text-muted-foreground',
      )}
    >
      {n} / ~{range.max}
      {state === 'long' ? ` · ${t('blogSeo.count.long')}` : null}
      {state === 'short' ? ` · ${t('blogSeo.count.short')}` : null}
    </span>
  );
}

export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="grid size-6 place-items-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-pretty">{children}</TooltipContent>
    </Tooltip>
  );
}

export function PanelSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col gap-3 py-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={headingId} className="text-sm font-semibold">
            {title}
          </h3>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A disclosure for settings most posts never touch; open state is lifted so "Fix" can open it. */
export function Disclosure({
  title,
  summary,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  summary?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const panelId = useId();
  return (
    <div className="py-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center gap-2 rounded-md py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-fast',
            open && 'rotate-90',
          )}
          aria-hidden="true"
        />
        <span className="text-sm font-semibold">{title}</span>
        {summary && !open ? (
          <span className="ml-auto truncate text-xs text-muted-foreground">{summary}</span>
        ) : null}
      </button>
      {open ? (
        <div id={panelId} className="flex flex-col gap-3 pb-3 pl-6">
          {children}
        </div>
      ) : null}
    </div>
  );
}

const LEVEL_ICON: Record<IssueLevel, typeof CircleX> = {
  error: CircleX,
  warning: AlertTriangle,
  suggestion: Lightbulb,
};
const LEVEL_TONE: Record<IssueLevel, string> = {
  error: 'text-destructive',
  warning: 'text-warning',
  suggestion: 'text-muted-foreground',
};
const LEVEL_HEADING: Record<IssueLevel, DictKey> = {
  error: 'blogSeo.level.error',
  warning: 'blogSeo.level.warning',
  suggestion: 'blogSeo.level.suggestion',
};

export function IssueRow({ issue, onFix }: { issue: SeoIssue; onFix: (issue: SeoIssue) => void }) {
  const t = useT();
  const Icon = LEVEL_ICON[issue.level];
  const params = { ...issue.params };
  return (
    <li className="flex gap-2.5 py-2.5">
      <Icon className={cn('mt-0.5 size-4 shrink-0', LEVEL_TONE[issue.level])} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-2sm font-medium leading-snug">
          <span className="sr-only">{t(LEVEL_HEADING[issue.level])}: </span>
          {t(`blogSeo.issue.${issue.id}.title` as DictKey, params)}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t(`blogSeo.issue.${issue.id}.reason` as DictKey, params)}
        </p>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto min-h-6 self-start p-0 text-xs sm:h-auto"
          onClick={() => onFix(issue)}
        >
          {issue.fix ? <Wand2 aria-hidden="true" /> : null}
          {issue.fix ? t(`blogSeo.fix.${issue.fix}` as DictKey) : t('blogSeo.fix.goTo')}
        </Button>
      </div>
    </li>
  );
}

export function IssueList({
  issues,
  onFix,
  levels = ['error', 'warning', 'suggestion'],
}: {
  issues: SeoIssue[];
  onFix: (issue: SeoIssue) => void;
  levels?: IssueLevel[];
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      {levels.map((level) => {
        const group = issues.filter((i) => i.level === level);
        if (group.length === 0) return null;
        return (
          <section key={level} aria-label={t(LEVEL_HEADING[level])}>
            <h4 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {t(LEVEL_HEADING[level])}
              <span className="tabular-nums">{group.length}</span>
            </h4>
            <ul className="divide-y divide-border">
              {group.map((issue) => (
                <IssueRow key={issue.id} issue={issue} onFix={onFix} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function SeoTab({
  disabled,
  companySlug,
  brand,
  domain,
  ownUrl,
  slug,
  seoTitleDefault,
  metaTitle,
  onMetaTitle,
  metaDescription,
  onMetaDescription,
  descriptionFallback,
  onGenerateDescription,
  canGenerate,
  meta,
  setMeta,
  featuredImage,
  socialOpen,
  onSocialOpen,
  advancedOpen,
  onAdvancedOpen,
}: {
  disabled: boolean;
  companySlug: CompanySlug;
  brand: string;
  domain: string;
  ownUrl: string | null;
  slug: string;
  seoTitleDefault: string;
  metaTitle: string;
  onMetaTitle: (v: string) => void;
  metaDescription: string;
  onMetaDescription: (v: string) => void;
  descriptionFallback: string;
  onGenerateDescription: () => void;
  canGenerate: boolean;
  meta: SeoPageMeta;
  setMeta: <K extends keyof SeoPageMeta>(key: K, value: SeoPageMeta[K]) => void;
  featuredImage: string | null;
  socialOpen: boolean;
  onSocialOpen: (open: boolean) => void;
  advancedOpen: boolean;
  onAdvancedOpen: (open: boolean) => void;
}) {
  const t = useT();
  const seoTitle = metaTitle.trim() || seoTitleDefault;
  const description = metaDescription.trim() || descriptionFallback.trim();
  const ogTitle = meta.ogTitle?.trim() || seoTitle;
  const ogDescription = meta.ogDescription?.trim() || description;
  const customSocial = !!(meta.ogTitle || meta.ogDescription || meta.ogImage);

  return (
    <div className="flex flex-col divide-y divide-border">
      <PanelSection
        title={t('blogSeo.searchAppearance')}
        description={t('blogSeo.searchAppearanceHint')}
        className="pt-1"
      >
        <SerpPreview
          brand={brand}
          url={ownUrl ?? `${domain}/blog/${slug || '…'}`}
          title={seoTitle || t('blogEditor.untitled')}
          description={description || t('blogSeo.noDescriptionPreview')}
        />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Label htmlFor="seo-title">{t('blogSeo.seoTitle')}</Label>
              <HelpTip label={t('blogSeo.seoTitleHelpLabel')}>{t('blogSeo.seoTitleHelp')}</HelpTip>
            </div>
            <CharCount id="seo-title-count" n={seoTitle.length} range={SEO_TITLE_RANGE} />
          </div>
          <Input
            id="seo-title"
            value={metaTitle}
            onChange={(e) => onMetaTitle(e.target.value)}
            placeholder={seoTitleDefault || t('blogSeo.seoTitlePlaceholder')}
            disabled={disabled}
            maxLength={300}
            aria-describedby="seo-title-count"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Label htmlFor="seo-description">{t('blogSeo.metaDescription')}</Label>
              <HelpTip label={t('blogSeo.metaDescriptionHelpLabel')}>
                {t('blogSeo.metaDescriptionHelp')}
              </HelpTip>
            </div>
            <CharCount
              id="seo-description-count"
              n={metaDescription.trim().length}
              range={META_DESCRIPTION_RANGE}
            />
          </div>
          <Textarea
            id="seo-description"
            rows={4}
            value={metaDescription}
            onChange={(e) => onMetaDescription(e.target.value)}
            placeholder={descriptionFallback || t('blogSeo.metaDescriptionPlaceholder')}
            disabled={disabled}
            maxLength={500}
            aria-describedby="seo-description-count"
          />
          {!disabled ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="self-start"
              onClick={onGenerateDescription}
              disabled={!canGenerate}
            >
              <Sparkles aria-hidden="true" />
              {t('blogSeo.generateDescription')}
            </Button>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor="seo-keyphrase">{t('blogSeo.focusKeyphrase')}</Label>
            <HelpTip label={t('blogSeo.focusKeyphraseHelpLabel')}>
              {t('blogSeo.focusKeyphraseHelp')}
            </HelpTip>
          </div>
          <Input
            id="seo-keyphrase"
            value={meta.focusKeyphrase ?? ''}
            onChange={(e) => setMeta('focusKeyphrase', e.target.value)}
            placeholder={t('blogSeo.focusKeyphrasePlaceholder')}
            disabled={disabled}
            maxLength={120}
          />
        </div>
      </PanelSection>

      <Disclosure
        title={t('blogSeo.social')}
        summary={customSocial ? t('blogSeo.socialCustom') : t('blogSeo.socialDefault')}
        open={socialOpen}
        onOpenChange={onSocialOpen}
      >
        <p className="text-xs text-muted-foreground">{t('blogSeo.socialHint')}</p>
        <SocialPreview
          image={meta.ogImage || featuredImage}
          domain={domain}
          title={ogTitle || t('blogEditor.untitled')}
          description={ogDescription}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="og-title">{t('blogSeo.ogTitle')}</Label>
          <Input
            id="og-title"
            value={meta.ogTitle ?? ''}
            onChange={(e) => setMeta('ogTitle', e.target.value)}
            placeholder={seoTitle}
            disabled={disabled}
            maxLength={300}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="og-description">{t('blogSeo.ogDescription')}</Label>
          <Textarea
            id="og-description"
            rows={3}
            value={meta.ogDescription ?? ''}
            onChange={(e) => setMeta('ogDescription', e.target.value)}
            placeholder={description}
            disabled={disabled}
            maxLength={500}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-2sm font-medium" id="og-image-label">
            {t('blogSeo.ogImage')}
          </span>
          <ImageField
            id="og-image"
            companySlug={companySlug}
            value={meta.ogImage ?? null}
            onChange={(url) => setMeta('ogImage', url ?? undefined)}
            disabled={disabled}
            describedBy="og-image-label"
            emptyLabel={t('blogSeo.ogImageEmpty')}
          />
        </div>
      </Disclosure>

      <Disclosure
        title={t('blogSeo.advanced')}
        summary={
          meta.noindex
            ? t('blogSeo.hiddenFromSearch')
            : meta.canonicalUrl
              ? t('blogSeo.customCanonical')
              : undefined
        }
        open={advancedOpen}
        onOpenChange={onAdvancedOpen}
      >
        <div className="flex items-start gap-2">
          <Checkbox
            id="seo-index"
            checked={!meta.noindex}
            onChange={(e) => setMeta('noindex', e.target.checked ? undefined : true)}
            disabled={disabled}
            aria-describedby="seo-index-hint"
            className="mt-0.5"
          />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="seo-index">{t('blogSeo.allowIndexing')}</Label>
            <p
              id="seo-index-hint"
              className={cn('text-xs', meta.noindex ? 'text-warning' : 'text-muted-foreground')}
            >
              {meta.noindex ? t('blogSeo.noindexOn') : t('blogSeo.allowIndexingHint')}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor="seo-canonical">{t('blogSeo.canonical')}</Label>
            <HelpTip label={t('blogSeo.canonicalHelpLabel')}>{t('blogSeo.canonicalHelp')}</HelpTip>
          </div>
          <Input
            id="seo-canonical"
            type="url"
            inputMode="url"
            value={meta.canonicalUrl ?? ''}
            onChange={(e) => setMeta('canonicalUrl', e.target.value)}
            placeholder={ownUrl ?? 'https://…'}
            disabled={disabled}
            maxLength={2000}
          />
        </div>
      </Disclosure>
    </div>
  );
}
