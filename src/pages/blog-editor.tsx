import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  Globe,
  Link2,
  Loader2,
  Lock,
  Save,
  Trash2,
  Undo2,
  User,
} from 'lucide-react';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';

import { newFaqKey, type FaqDraft } from '@/components/blog-editor/editor-utils';
import {
  Checklist,
  CounterBadge,
  FaqPanel,
  FeaturedImagePanel,
  Panel,
  type CheckState,
} from '@/components/blog-editor/panels';
import { PreviewDialog } from '@/components/blog-editor/preview-dialog';
import { RichTextEditor } from '@/components/blog-editor/rich-text-editor';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import {
  ApiError,
  errMessage,
  seoPagesAdminApi,
  type SeoPageRow,
  type SeoPageStatus,
} from '@/lib/api';
import {
  BLOG_PATH_PREFIX,
  countWords,
  htmlToText,
  postSlug,
  readArticle,
  readingMinutes,
  siteThemeClass,
  SLUG_RE,
  slugify,
  STATUS_KEY,
  STATUS_TONE,
  toDateInput,
  writeArticle,
} from '@/lib/blog-utils';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';

import type { CompanySlug } from '@/contexts/project-context';

// The storefront's own typefaces, self-hosted (no Google Fonts request) and only
// loaded with this route's chunk — the canvas and preview use them.
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/dm-sans/wght-italic.css';
import '@fontsource-variable/lora';
import '@fontsource-variable/lora/wght-italic.css';

// Soft SEO targets — outside these we warn, never block.
const META_TITLE = { min: 30, max: 60 };
const META_DESC = { min: 70, max: 160 };
const MIN_WORDS = 300;

/** Tiptap's serialisation of an empty document. */
const EMPTY_DOC = '<p></p>';

export function BlogEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === undefined;
  const numericId = Number(id);
  const { activeProject, isAllBrands } = useProject();
  const slug = activeProject.companySlug;
  const t = useT();

  const query = useQuery({
    queryKey: ['blog-page', slug, numericId] as const,
    enabled: !isNew && Number.isFinite(numericId) && !isAllBrands,
    queryFn: ({ signal }) => seoPagesAdminApi.get(slug, numericId, signal),
    // The form owns the content once loaded; a background refetch must not
    // look like a new post and remount the editor mid-edit.
    refetchOnWindowFocus: false,
  });

  usePageTitle(isNew ? t('blogEditor.newTitle') : (query.data?.page.title ?? t('blog.title')));

  if (isAllBrands) {
    return (
      <EditorShellMessage>
        <AlertCircle className="size-4" aria-hidden="true" />
        {t('blog.selectBrandFirst')}
      </EditorShellMessage>
    );
  }
  if (!isNew && query.isLoading) return <EditorSkeleton />;
  if (!isNew && (query.error || !query.data)) {
    return (
      <EditorShellMessage>
        <AlertCircle className="size-4" aria-hidden="true" />
        {query.error instanceof ApiError ? query.error.message : t('blog.notFound')}
      </EditorShellMessage>
    );
  }

  const post = isNew ? null : query.data!.page;
  // Keyed by row so a navigation to another post (or new → saved) starts clean.
  return <BlogEditorForm key={post ? `post-${post.id}` : 'new'} post={post} companySlug={slug} />;
}

interface Snapshot {
  title: string;
  slug: string;
  body: string;
  metaTitle: string;
  metaDescription: string;
  image: string | null;
  author: string;
  date: string;
  faq: Array<{ question: string; answer: string }>;
}

function BlogEditorForm({
  post,
  companySlug,
}: {
  post: SeoPageRow | null;
  companySlug: CompanySlug;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeProject } = useProject();
  const article = useMemo(() => (post ? readArticle(post) : null), [post]);

  const [title, setTitle] = useState(post?.title ?? '');
  const [slug, setSlug] = useState(post ? postSlug(post.path) : '');
  // New posts derive the slug from the title until the user edits it by hand.
  const [slugTouched, setSlugTouched] = useState(!!post);
  const [slugEditing, setSlugEditing] = useState(false);
  const [body, setBody] = useState(post?.bodyHtml ?? '');
  const [metaTitle, setMetaTitle] = useState(post?.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(post?.metaDescription ?? '');
  const [image, setImage] = useState<string | null>(article?.image ?? null);
  const [author, setAuthor] = useState(article?.author ?? '');
  const [date, setDate] = useState(toDateInput(article?.datePublished ?? null));
  const [faq, setFaq] = useState<FaqDraft[]>(() =>
    (post?.faq ?? []).map((f) => ({ key: newFaqKey(), ...f })),
  );
  const [saved, setSaved] = useState<Snapshot | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(post?.updatedAt ?? null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);

  // A new post starts in the title; opening the slug editor moves focus there.
  useEffect(() => {
    if (!post) titleRef.current?.focus();
  }, [post]);
  useEffect(() => {
    if (slugEditing) slugRef.current?.select();
  }, [slugEditing]);
  // Grow the title field with its content (field-sizing isn't in Safari yet).
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [title]);

  const status: SeoPageStatus = post?.status ?? 'draft';
  const isLive = status === 'live' || status === 'protected';
  const isProtected =
    status === 'protected' || (post?.gscPosition != null && Number(post.gscPosition) <= 5);
  const readOnly = isProtected;
  const domain = activeProject.domain;
  const themeClass = siteThemeClass(companySlug);
  const defaultAuthor = `${activeProject.name} Team`;

  // The slug input holds raw keystrokes; everything else sees the cleaned slug.
  // An existing slug is kept verbatim (it may predate these rules) — re-slugging
  // it would silently move a live URL.
  const originalSlug = post ? postSlug(post.path) : null;
  const effectiveSlug = !slugTouched
    ? slugify(title)
    : slug === originalSlug
      ? slug
      : slugify(slug);
  const faqClean = faq
    .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
    .filter((f) => f.question && f.answer);
  const bodyClean = body.trim() === EMPTY_DOC ? '' : body.trim();

  const current: Snapshot = {
    title: title.trim(),
    slug: effectiveSlug,
    body: bodyClean,
    metaTitle: metaTitle.trim(),
    metaDescription: metaDescription.trim(),
    image,
    author: author.trim(),
    date,
    faq: faqClean,
  };
  // `saved` is null until the editor reports its normalised baseline.
  const dirty = saved !== null && JSON.stringify(current) !== JSON.stringify(saved);

  const onBaseline = useCallback(
    (html: string) => {
      setBody(html);
      setSaved(
        (prev) =>
          prev ?? {
            title: post?.title?.trim() ?? '',
            slug: post ? postSlug(post.path) : '',
            body: html.trim() === EMPTY_DOC ? '' : html.trim(),
            metaTitle: post?.metaTitle?.trim() ?? '',
            metaDescription: post?.metaDescription?.trim() ?? '',
            image: article?.image ?? null,
            author: article?.author?.trim() ?? '',
            date: toDateInput(article?.datePublished ?? null),
            faq: (post?.faq ?? []).map((f) => ({
              question: f.question.trim(),
              answer: f.answer.trim(),
            })),
          },
      );
    },
    [post, article],
  );

  // --- derived: stats, checks ----------------------------------------------

  // Parsing the whole article per keystroke is cheap but not free; let typing win.
  const deferredBody = useDeferredValue(bodyClean);
  const stats = useMemo(() => {
    const text = htmlToText(deferredBody);
    const doc =
      typeof DOMParser !== 'undefined'
        ? new DOMParser().parseFromString(deferredBody, 'text/html')
        : null;
    const imgs = doc ? Array.from(doc.querySelectorAll('img')) : [];
    const links = doc ? Array.from(doc.querySelectorAll('a[href]')) : [];
    const internal = links.filter((a) => {
      const href = a.getAttribute('href') ?? '';
      return href.startsWith('/') || (!!domain && href.includes(domain));
    });
    const words = countWords(text);
    return {
      words,
      characters: text.replace(/\s+/g, ' ').trim().length,
      minutes: readingMinutes(words),
      h2: doc ? doc.querySelectorAll('h2').length : 0,
      images: imgs.length,
      imagesMissingAlt: imgs.filter((i) => !(i.getAttribute('alt') ?? '').trim()).length,
      internalLinks: internal.length,
    };
  }, [deferredBody, domain]);

  const effectiveMetaTitle = current.metaTitle || current.title;
  const titleOk = current.title.length > 0;
  const bodyOk = stats.words > 0;
  const imageOk = !!image;
  const slugOk = effectiveSlug === originalSlug || SLUG_RE.test(effectiveSlug);
  const canPublish = titleOk && bodyOk && imageOk && slugOk && !readOnly;

  const range = (n: number, r: { min: number; max: number }): CheckState =>
    n === 0 ? 'missing' : n < r.min || n > r.max ? 'warn' : 'ok';
  const seoChecks: Array<{ label: string; state: CheckState }> = [
    {
      label: t('blogEditor.checkMetaTitle', { n: effectiveMetaTitle.length, max: META_TITLE.max }),
      state: range(effectiveMetaTitle.length, META_TITLE),
    },
    {
      label: t('blogEditor.checkMetaDesc', {
        n: current.metaDescription.length,
        max: META_DESC.max,
      }),
      state: range(current.metaDescription.length, META_DESC),
    },
    {
      label: t('blogEditor.checkWords', { n: stats.words, min: MIN_WORDS }),
      state: stats.words === 0 ? 'missing' : stats.words < MIN_WORDS ? 'warn' : 'ok',
    },
    { label: t('blogEditor.checkH2'), state: stats.h2 > 0 ? 'ok' : 'warn' },
    {
      label: t('blogEditor.checkInternalLinks', { n: stats.internalLinks }),
      state: stats.internalLinks > 0 ? 'ok' : 'warn',
    },
    {
      label:
        stats.imagesMissingAlt > 0
          ? t('blogEditor.checkAltMissing', { n: stats.imagesMissingAlt })
          : t('blogEditor.checkAlt'),
      state: stats.imagesMissingAlt > 0 ? 'warn' : 'ok',
    },
  ];

  // --- save ----------------------------------------------------------------

  // Set right before a deliberate navigation (created → editor, deleted → list),
  // which happens before the cleared `dirty` state has re-rendered.
  const allowLeave = useRef(false);

  const saveMutation = useMutation({
    mutationFn: async (nextStatus: SeoPageStatus) => {
      const publishing = (nextStatus === 'live' || nextStatus === 'protected') && !isLive;
      const originalDate = article?.datePublished ?? null;
      let datePublished = date === toDateInput(originalDate) ? originalDate : date || null;
      if (publishing && !datePublished) datePublished = new Date().toISOString();

      const schemaJsonld = writeArticle(post?.schemaJsonld ?? null, {
        image,
        author: current.author || null,
        datePublished,
        headline: current.title,
        description: current.metaDescription,
      });
      const content = {
        title: current.title,
        path: `${BLOG_PATH_PREFIX}${effectiveSlug}`,
        metaTitle: current.metaTitle,
        metaDescription: current.metaDescription,
        bodyHtml: current.body,
        schemaJsonld,
        faq: current.faq,
      };
      if (!post) {
        return seoPagesAdminApi.create(companySlug, {
          type: 'blog',
          source: 'dashboard',
          status: nextStatus,
          ...content,
        });
      }
      // A protected page refuses content writes; only its status may change.
      const patch = readOnly
        ? { status: nextStatus }
        : { ...content, ...(nextStatus !== status ? { status: nextStatus } : {}) };
      return seoPagesAdminApi.update(companySlug, post.id, patch);
    },
    onSuccess: ({ page }, nextStatus) => {
      void queryClient.invalidateQueries({ queryKey: ['blog-pages', companySlug] });
      queryClient.setQueryData(['blog-page', companySlug, page.id], { page });
      // A first publish stamps the date (here or server-side); mirror it into the
      // field, or the next update would send the empty field and erase it.
      const savedDate = toDateInput(readArticle(page).datePublished);
      setDate(savedDate);
      setSaved({ ...current, date: savedDate });
      setSavedAt(page.updatedAt);
      setFormError(null);
      const wentLive = nextStatus === 'live' && !isLive;
      const wentDraft = nextStatus === 'draft' && isLive;
      toast.success(
        wentLive
          ? t('blog.publishedToast')
          : wentDraft
            ? t('blog.unpublishedToast')
            : t('blog.saved'),
      );
      if (!post) {
        allowLeave.current = true;
        navigate(`/blog/${page.id}/edit`, { replace: true });
      }
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409 && /path/i.test(err.message)) {
        setSlugError(t('blogEditor.slugTaken'));
        setSlug(effectiveSlug);
        setSlugTouched(true);
        setSlugEditing(true);
        return;
      }
      setFormError(errMessage(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => seoPagesAdminApi.remove(companySlug, post!.id),
    onSuccess: () => {
      toast.success(t('blog.deletedToast'));
      void queryClient.invalidateQueries({ queryKey: ['blog-pages', companySlug] });
      allowLeave.current = true;
      navigate('/blog');
    },
    onError: (err) => {
      setDeleteOpen(false);
      setFormError(errMessage(err));
    },
  });

  const busy = saveMutation.isPending || deleteMutation.isPending;

  function save(nextStatus: SeoPageStatus) {
    setFormError(null);
    setSlugError(null);
    if (!titleOk) {
      setFormError(t('blogEditor.titleRequired'));
      document.getElementById('post-title')?.focus();
      return;
    }
    if (!slugOk) {
      setSlugError(t('blogEditor.slugInvalid'));
      setSlug(effectiveSlug);
      setSlugTouched(true);
      setSlugEditing(true);
      return;
    }
    if (nextStatus === 'live' && !canPublish) {
      setFormError(t('blogEditor.publishBlocked'));
      return;
    }
    saveMutation.mutate(nextStatus);
  }

  // Latest save for the keyboard shortcut without re-binding on every keystroke.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!busy && !readOnly) saveRef.current(status);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, readOnly, status]);

  // --- leave guard ---------------------------------------------------------

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !allowLeave.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // --- render --------------------------------------------------------------

  const publicUrl = domain ? `https://${domain}/blog/${effectiveSlug}/` : null;
  const displayUrl = `${domain ?? ''}/blog/`;
  const dateLabel = date
    ? new Date(`${date}T12:00:00`).toLocaleDateString(bcp47, { dateStyle: 'long' })
    : null;

  const primaryAction = isLive ? (
    <Button onClick={() => save(status)} disabled={busy || readOnly || !dirty}>
      {saveMutation.isPending && saveMutation.variables === status ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : (
        <Save aria-hidden="true" />
      )}
      {t('blogEditor.update')}
    </Button>
  ) : (
    <Button onClick={() => save('live')} disabled={busy || !canPublish}>
      {saveMutation.isPending && saveMutation.variables === 'live' ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : (
        <CheckCircle2 aria-hidden="true" />
      )}
      {t('blog.publish')}
    </Button>
  );

  return (
    <div className="mx-auto w-full max-w-7xl">
      {/* Sticky action bar, flush under the app header. */}
      <div className="sticky top-16 z-30 -mx-3 -mt-3 mb-4 border-b border-border/70 bg-background/90 px-3 backdrop-blur-md sm:-mx-4 sm:-mt-4 sm:px-4 lg:-mx-6 lg:-mt-6 lg:mb-6 lg:px-6">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/blog" aria-label={t('blog.backToList')}>
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
          <div className="flex min-w-0 flex-col">
            <nav aria-label="Breadcrumb" className="hidden text-2xs text-muted-foreground sm:block">
              {activeProject.name} / {t('blog.title')}
            </nav>
            <h1 className="truncate font-serif text-lg font-semibold leading-tight sm:text-xl">
              {post ? t('blogEditor.editTitle') : t('blogEditor.newTitle')}
            </h1>
          </div>
          <StatusBadge
            label={t(STATUS_KEY[status])}
            tone={STATUS_TONE[status]}
            className="hidden sm:inline-flex"
          />
          <SaveState
            dirty={dirty}
            saving={saveMutation.isPending}
            savedAt={savedAt}
            bcp47={bcp47}
          />
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setPreviewOpen(true)}
              className="px-2.5 sm:px-3"
              aria-label={t('blogEditor.preview')}
            >
              <Eye aria-hidden="true" />
              <span className="hidden md:inline">{t('blogEditor.preview')}</span>
            </Button>
            {!isLive ? (
              <Button
                variant="outline"
                onClick={() => save('draft')}
                disabled={busy || readOnly || (!!post && !dirty)}
                className="px-2.5 sm:px-3"
                aria-label={t('blogEditor.saveDraft')}
              >
                {saveMutation.isPending && saveMutation.variables === 'draft' ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Save aria-hidden="true" />
                )}
                <span className="hidden md:inline">{t('blogEditor.saveDraft')}</span>
              </Button>
            ) : null}
            {primaryAction}
          </div>
        </div>
      </div>

      {isProtected ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm"
        >
          <Lock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span>{t('blogEditor.protectedNotice')}</span>
        </div>
      ) : null}
      {formError ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{formError}</span>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-ring sm:px-6 sm:py-4">
            <label htmlFor="post-title" className="sr-only">
              {t('blog.fieldTitle')}
            </label>
            {/* A textarea so long titles wrap; Enter is swallowed — titles are one line. */}
            <textarea
              id="post-title"
              value={title}
              onChange={(e) => setTitle(e.target.value.replace(/\s*\n\s*/g, ' '))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
              }}
              placeholder={t('blogEditor.titlePlaceholder')}
              readOnly={readOnly}
              maxLength={300}
              rows={1}
              ref={titleRef}
              className="block w-full resize-none overflow-hidden bg-transparent font-serif text-2xl font-semibold leading-tight tracking-tight placeholder:text-muted-foreground/60 focus:outline-none sm:text-display-sm"
            />
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1 text-2sm text-muted-foreground">
              <Link2 className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="shrink-0">{t('blogEditor.permalink')}:</span>
              <span className="min-w-0 truncate">{displayUrl}</span>
              {slugEditing && !readOnly ? (
                <span className="flex items-center gap-1">
                  <label htmlFor="post-slug" className="sr-only">
                    {t('blogEditor.slug')}
                  </label>
                  <Input
                    id="post-slug"
                    value={slug}
                    onChange={(e) => {
                      setSlugError(null);
                      setSlug(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setSlug(effectiveSlug);
                        setSlugEditing(false);
                      }
                    }}
                    className="h-8 w-56 font-mono sm:h-7 sm:text-2sm"
                    aria-invalid={!!slugError}
                    aria-describedby={slugError ? 'post-slug-error' : undefined}
                    ref={slugRef}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSlug(effectiveSlug);
                      setSlugEditing(false);
                    }}
                  >
                    {t('blogEditor.slugDone')}
                  </Button>
                </span>
              ) : (
                <>
                  <span className="font-mono font-medium text-foreground">
                    {effectiveSlug || '…'}
                  </span>
                  {!readOnly ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto px-1 py-0 text-2sm"
                      onClick={() => {
                        setSlug(effectiveSlug);
                        setSlugTouched(true);
                        setSlugEditing(true);
                      }}
                    >
                      {t('common.edit')}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
            {slugError ? (
              <p id="post-slug-error" role="alert" className="mt-1 text-xs text-destructive">
                {slugError}
              </p>
            ) : isLive && post && effectiveSlug !== postSlug(post.path) ? (
              <p className="mt-1 text-xs text-warning">{t('blogEditor.slugChangeWarning')}</p>
            ) : null}
          </div>

          <RichTextEditor
            companySlug={companySlug}
            initialHtml={post?.bodyHtml ?? ''}
            readOnly={readOnly}
            onChange={setBody}
            onBaseline={onBaseline}
            stickyTop="top-[7.5rem]"
            themeClass={themeClass}
            footer={
              <>
                <span>{t('blogEditor.words', { n: stats.words })}</span>
                <span>{t('blogEditor.characters', { n: stats.characters })}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" aria-hidden="true" />
                  {t('blogEditor.readingTime', { n: stats.minutes })}
                </span>
              </>
            }
          />

          <FaqPanel items={faq} onChange={setFaq} disabled={readOnly} />
        </div>

        {/* Sidebar */}
        <aside className="flex flex-col gap-4" aria-label={t('blogEditor.settings')}>
          <Panel
            title={t('blogEditor.publishPanel')}
            aside={<StatusBadge label={t(STATUS_KEY[status])} tone={STATUS_TONE[status]} />}
          >
            <dl className="flex flex-col gap-3 text-2sm">
              <MetaRow icon={Globe} label={t('blogEditor.visibility')}>
                {isLive ? (
                  <span className="text-success">
                    {t('blogEditor.visibilityLive', { domain: domain ?? '' })}
                  </span>
                ) : (
                  t('blogEditor.visibilityDraft')
                )}
              </MetaRow>
              {isLive && publicUrl ? (
                <MetaRow icon={ExternalLink} label={t('blogEditor.liveUrl')}>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-medium text-primary hover:underline"
                  >
                    {t('blog.viewOnSite')}
                  </a>
                </MetaRow>
              ) : null}
              {savedAt ? (
                <MetaRow icon={Clock} label={t('blogEditor.lastSaved')}>
                  {formatDateTime(savedAt, bcp47)}
                </MetaRow>
              ) : null}
            </dl>

            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="post-date" className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  {t('blogEditor.publishDate')}
                </Label>
                <Input
                  id="post-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={readOnly}
                />
                <p className="text-2xs text-muted-foreground">
                  {dateLabel
                    ? t('blogEditor.publishDateShown', { date: dateLabel })
                    : t('blogEditor.publishDateAuto')}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="post-author" className="flex items-center gap-1.5">
                  <User className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  {t('blogEditor.author')}
                </Label>
                <Input
                  id="post-author"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder={defaultAuthor}
                  disabled={readOnly}
                  maxLength={120}
                />
              </div>
            </div>

            {!isLive ? (
              <div className="mt-4 border-t border-border/70 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('blogEditor.readyToPublish')}
                </p>
                <Checklist
                  items={[
                    { label: t('blogEditor.checkTitle'), state: titleOk ? 'ok' : 'missing' },
                    { label: t('blogEditor.checkContent'), state: bodyOk ? 'ok' : 'missing' },
                    { label: t('blogEditor.checkImage'), state: imageOk ? 'ok' : 'missing' },
                  ]}
                />
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-4">
              {post ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                  disabled={busy}
                >
                  <Trash2 aria-hidden="true" />
                  {t('blog.deleteAction')}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex flex-wrap gap-2">
                {isLive ? (
                  <Button variant="outline" size="sm" onClick={() => save('draft')} disabled={busy}>
                    {saveMutation.isPending && saveMutation.variables === 'draft' ? (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Undo2 aria-hidden="true" />
                    )}
                    {t('blog.unpublish')}
                  </Button>
                ) : null}
                {primaryAction}
              </div>
            </div>
          </Panel>

          <FeaturedImagePanel
            companySlug={companySlug}
            image={image}
            onChange={setImage}
            disabled={readOnly}
          />

          <Panel title={t('blogEditor.seoPanel')}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="post-meta-title">{t('blog.fieldMetaTitle')}</Label>
                  <CounterBadge current={effectiveMetaTitle.length} {...META_TITLE} />
                </div>
                <Input
                  id="post-meta-title"
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  placeholder={current.title || t('blogEditor.metaTitlePlaceholder')}
                  disabled={readOnly}
                  maxLength={300}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="post-meta-desc">{t('blog.fieldMetaDescription')}</Label>
                  <CounterBadge current={current.metaDescription.length} {...META_DESC} />
                </div>
                <Textarea
                  id="post-meta-desc"
                  rows={4}
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  placeholder={t('blogEditor.metaDescPlaceholder')}
                  disabled={readOnly}
                  maxLength={500}
                />
                <p className="text-2xs text-muted-foreground">{t('blogEditor.metaDescHint')}</p>
              </div>

              <div className="rounded-lg border border-border/80 bg-background p-3">
                <p className="mb-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('blog.searchPreview')}
                </p>
                <p className="truncate text-2sm text-muted-foreground">
                  {domain} › blog › {effectiveSlug || '…'}
                </p>
                <p className="line-clamp-2 text-base font-medium leading-snug text-info">
                  {effectiveMetaTitle || t('blogEditor.untitled')}
                </p>
                <p className="mt-0.5 line-clamp-3 text-2sm text-muted-foreground">
                  {current.metaDescription || t('blog.noMetaDescription')}
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('blogEditor.seoCheck')}
                </p>
                <Checklist items={seoChecks} />
              </div>
            </div>
          </Panel>
        </aside>
      </div>

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        themeClass={themeClass}
        data={{
          title: current.title,
          description: current.metaDescription,
          author: current.author || defaultAuthor,
          date: date || article?.datePublished || null,
          image,
          html: bodyClean,
          faq: current.faq,
          readingMinutes: stats.minutes,
          url: publicUrl ?? `/blog/${effectiveSlug}`,
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('blog.deleteAction')}
        description={isLive ? t('blogEditor.confirmDeleteLive') : t('blog.confirmDelete')}
        confirmLabel={t('blog.deleteAction')}
        cancelLabel={t('common.cancel')}
        isDangerous
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(o) => {
          if (!o && blocker.state === 'blocked') blocker.reset();
        }}
        title={t('blogEditor.leaveTitle')}
        description={t('blogEditor.leaveDescription')}
        confirmLabel={t('blogEditor.leaveConfirm')}
        cancelLabel={t('blogEditor.leaveCancel')}
        isDangerous
        onConfirm={() => {
          if (blocker.state === 'blocked') blocker.proceed();
        }}
      />
    </div>
  );
}

function SaveState({
  dirty,
  saving,
  savedAt,
  bcp47,
}: {
  dirty: boolean;
  saving: boolean;
  savedAt: string | null;
  bcp47: string;
}) {
  const t = useT();
  let text: string | null = null;
  let tone = 'text-muted-foreground';
  if (saving) text = t('common.saving');
  else if (dirty) {
    text = t('blogEditor.unsaved');
    tone = 'text-warning';
  } else if (savedAt) {
    text = t('blogEditor.savedAt', {
      time: formatDateTime(savedAt, bcp47, { timeStyle: 'short' }),
    });
  }
  if (!text) return null;
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn('hidden items-center gap-1.5 text-xs font-medium lg:inline-flex', tone)}
    >
      {dirty && !saving ? (
        <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
      ) : null}
      {text}
    </span>
  );
}

function MetaRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Globe;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="inline font-medium">{label}: </dt>
        <dd className="inline text-foreground/80">{children}</dd>
      </div>
    </div>
  );
}

function EditorShellMessage({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        to="/blog"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('blog.backToList')}
      </Link>
      <div
        role="alert"
        className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
      >
        {children}
      </div>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-[32rem] w-full rounded-xl" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}
