import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleX,
  Copy,
  ExternalLink,
  Eye,
  Link2,
  Lock,
  MoreHorizontal,
  Newspaper,
  PanelRight,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Undo2,
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
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { newFaqKey, type FaqDraft } from '@/components/blog-editor/editor-utils';
import { demoteBodyH1 } from '@/components/blog-editor/extensions';
import { ImageField } from '@/components/blog-editor/image-field';
import { OutlinePanel } from '@/components/blog-editor/outline-panel';
import { FaqPanel } from '@/components/blog-editor/panels';
import { PreviewDialog } from '@/components/blog-editor/preview-dialog';
import { PublishDialog } from '@/components/blog-editor/publish-dialog';
import { RichTextEditor } from '@/components/blog-editor/rich-text-editor';
import { IssueList, PanelSection, SeoTab } from '@/components/blog-editor/seo-panel';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CountPill } from '@/components/count-pill';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { LeaveGuardDialog } from '@/components/leave-guard-dialog';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { StatusBadge } from '@/components/status-badge';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import { useAccessLevel } from '@/lib/access';
import {
  ApiError,
  apiErrorCode,
  errMessage,
  seoPagesAdminApi,
  type SeoPageMeta,
  type SeoPageRow,
  type SeoPageStatus,
} from '@/lib/api';
import {
  analyzePost,
  isInternalHref,
  suggestDescription,
  type FieldTarget,
  type SeoIssue,
} from '@/lib/blog-seo';
import {
  BLOG_PATH_PREFIX,
  canEditBlog,
  defaultSeoTitle,
  extractDocFacts,
  isPublic,
  postSlug,
  publicPostUrl,
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
import { useDebounced } from '@/lib/use-debounced';
import { useMediaQuery } from '@/lib/use-is-desktop';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';

import type { CompanySlug } from '@/contexts/project-context';
import type { Editor } from '@tiptap/react';

// Storefront typefaces, self-hosted so no request goes to Google Fonts.
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/dm-sans/wght-italic.css';
import '@fontsource-variable/lora';
import '@fontsource-variable/lora/wght-italic.css';

const EMPTY_DOC = '<p></p>';
const AUTOSAVE_MS = 2500;
const SIDEBAR_PREF = 'blog-editor-sidebar';

type Tab = 'post' | 'seo' | 'checks' | 'outline';

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: string }
  | { kind: 'error'; message: string; snapshot: string }
  | { kind: 'stale'; serverUpdatedAt: string | null };

const TARGETS: Record<FieldTarget, { tab?: Tab; id: string; open?: 'social' | 'advanced' }> = {
  title: { id: 'post-title' },
  content: { id: 'post-content' },
  slug: { tab: 'post', id: 'post-slug' },
  featuredImage: { tab: 'post', id: 'featured-image' },
  featuredImageAlt: { tab: 'post', id: 'featured-image-alt' },
  metaTitle: { tab: 'seo', id: 'seo-title' },
  metaDescription: { tab: 'seo', id: 'seo-description' },
  focusKeyphrase: { tab: 'seo', id: 'seo-keyphrase' },
  canonical: { tab: 'seo', id: 'seo-canonical', open: 'advanced' },
  indexing: { tab: 'seo', id: 'seo-index', open: 'advanced' },
  outline: { tab: 'outline', id: 'outline-tab' },
};

function isFieldTarget(value: string | null): value is FieldTarget {
  return !!value && value in TARGETS;
}

function readSidebarPref(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_PREF) !== 'closed';
  } catch {
    return true;
  }
}

function writeSidebarPref(open: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_PREF, open ? 'open' : 'closed');
  } catch {
    // Private mode: the toggle still works, it just isn't remembered.
  }
}

/** Mirrors the backend's normalizeMeta, so a saved snapshot compares equal to the server row. */
function cleanMeta(meta: SeoPageMeta): SeoPageMeta {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    const v = typeof value === 'string' ? value.trim() : value;
    if (v === undefined || v === '' || v === false) continue;
    out[key] = v;
  }
  return out as SeoPageMeta;
}

export function BlogEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === undefined;
  const numericId = Number(id);
  const location = useLocation();
  const { activeProject, isAllBrands } = useProject();
  const slug = activeProject.companySlug;
  const t = useT();

  const query = useQuery({
    queryKey: ['blog-page', slug, numericId] as const,
    enabled: !isNew && Number.isFinite(numericId) && !isAllBrands,
    queryFn: ({ signal }) => seoPagesAdminApi.get(slug, numericId, signal),
    // Once loaded the form owns the content; a refetch must not remount the editor mid-edit.
    refetchOnWindowFocus: false,
  });

  usePageTitle(isNew ? t('blogEditor.newTitle') : (query.data?.page.title ?? t('blog.title')));

  if (isAllBrands) {
    return (
      <EditorShellMessage title={isNew ? t('blogEditor.newTitle') : t('blogEditor.editTitle')}>
        <EmptyState
          variant="dashed"
          icon={<Newspaper aria-hidden="true" />}
          message={t('blog.selectBrandFirst')}
        />
      </EditorShellMessage>
    );
  }
  if (!isNew && query.isLoading) return <EditorSkeleton />;
  if (!isNew && (query.error || !query.data)) {
    return (
      <EditorShellMessage title={t('blogEditor.editTitle')}>
        <ErrorState
          error={
            new Error(query.error instanceof ApiError ? query.error.message : t('blog.notFound'))
          }
          onRetry={query.error ? () => void query.refetch() : undefined}
          retrying={query.isFetching}
        />
      </EditorShellMessage>
    );
  }

  const post = isNew ? null : query.data!.page;
  // A new post keeps its form instance when the URL switches to /blog/:id/edit after the first save.
  const editorKey =
    (location.state as { editorKey?: string } | null)?.editorKey ??
    (post ? `post-${post.id}` : 'new');
  return (
    <BlogEditorForm key={editorKey} editorKey={editorKey} initialPost={post} companySlug={slug} />
  );
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
  meta: SeoPageMeta;
}

function initialSnapshot(post: SeoPageRow | null, body: string): Snapshot {
  const article = post ? readArticle(post) : null;
  return {
    title: post?.title?.trim() ?? '',
    slug: post ? postSlug(post.path) : '',
    body,
    metaTitle: post?.metaTitle?.trim() ?? '',
    metaDescription: post?.metaDescription?.trim() ?? '',
    image: article?.image ?? null,
    author: article?.author?.trim() ?? '',
    date: toDateInput(article?.datePublished ?? null),
    faq: (post?.faq ?? []).map((f) => ({ question: f.question.trim(), answer: f.answer.trim() })),
    meta: cleanMeta(post?.meta ?? {}),
  };
}

function BlogEditorForm({
  editorKey,
  initialPost,
  companySlug,
}: {
  editorKey: string;
  initialPost: SeoPageRow | null;
  companySlug: CompanySlug;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { activeProject } = useProject();
  const accessLevel = useAccessLevel();
  const isXl = useMediaQuery('(min-width: 1280px)');

  const initialArticle = useMemo(
    () => (initialPost ? readArticle(initialPost) : null),
    [initialPost],
  );
  const [serverPost, setServerPost] = useState<SeoPageRow | null>(initialPost);
  const serverRef = useRef<SeoPageRow | null>(initialPost);

  const [title, setTitle] = useState(initialPost?.title ?? '');
  const [slugInput, setSlugInput] = useState(initialPost ? postSlug(initialPost.path) : '');
  // A draft whose slug still matches its title keeps following the title; anything else is fixed.
  const [slugTouched, setSlugTouched] = useState(
    () =>
      !!initialPost &&
      (isPublic(initialPost.status) ||
        postSlug(initialPost.path) !== slugify(initialPost.title ?? '')),
  );
  const [body, setBody] = useState(initialPost?.bodyHtml ?? '');
  const [metaTitle, setMetaTitle] = useState(initialPost?.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(initialPost?.metaDescription ?? '');
  const [image, setImage] = useState<string | null>(initialArticle?.image ?? null);
  const [author, setAuthor] = useState(initialArticle?.author ?? '');
  const [date, setDate] = useState(toDateInput(initialArticle?.datePublished ?? null));
  const [faq, setFaq] = useState<FaqDraft[]>(() =>
    (initialPost?.faq ?? []).map((f) => ({ key: newFaqKey(), ...f })),
  );
  const [meta, setMetaState] = useState<SeoPageMeta>(initialPost?.meta ?? {});
  const [saved, setSaved] = useState<Snapshot | null>(null);
  const [saveState, setSaveState] = useState<SaveState>(
    initialPost ? { kind: 'saved', at: initialPost.updatedAt } : { kind: 'idle' },
  );
  // The slug a save was refused for (409 path); stops counting once the slug changes.
  const [slugRefused, setSlugRefused] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  // Deep links from the list (?focus=featuredImage, ?preview=1) seed the initial panel state.
  const [deepLink] = useState(() => {
    const focus = searchParams.get('focus');
    return {
      focus: isFieldTarget(focus) ? focus : null,
      preview: searchParams.get('preview') === '1',
    };
  });
  const deepSpec = deepLink.focus ? TARGETS[deepLink.focus] : null;
  const [tab, setTab] = useState<Tab>(deepSpec?.tab ?? 'post');
  const [sidebarOpen, setSidebarOpen] = useState(() => readSidebarPref() || !!deepSpec?.tab);
  const [sheetOpen, setSheetOpen] = useState(() => !!deepSpec?.tab && !isXl);
  const [socialOpen, setSocialOpen] = useState(deepSpec?.open === 'social');
  const [advancedOpen, setAdvancedOpen] = useState(deepSpec?.open === 'advanced');
  const [previewOpen, setPreviewOpen] = useState(deepLink.preview);
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [slugConfirmOpen, setSlugConfirmOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<
    'publish' | 'update' | 'unpublish' | 'delete' | 'duplicate' | null
  >(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const pendingFocus = useRef<string | null>(deepSpec?.tab ? deepSpec.id : null);

  const setMeta = useCallback(
    <K extends keyof SeoPageMeta>(key: K, value: SeoPageMeta[K]) =>
      setMetaState((prev) => ({ ...prev, [key]: value })),
    [],
  );

  useEffect(() => {
    if (!initialPost) titleRef.current?.focus();
  }, [initialPost]);
  // Auto-grow the title: CSS field-sizing isn't in Safari yet.
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    // Width changes and the late-loading storefront font both change the wrap.
    const observer = new ResizeObserver(fit);
    if (el.parentElement) observer.observe(el.parentElement);
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, [title]);

  const status: SeoPageStatus = serverPost?.status ?? 'draft';
  const isLive = isPublic(status);
  const isProtected =
    status === 'protected' ||
    (serverPost?.gscPosition != null && Number(serverPost.gscPosition) <= 5);
  const canEdit = canEditBlog(accessLevel);
  const readOnly = !canEdit || isProtected;
  const domain = activeProject.domain ?? '';
  const brand = activeProject.name;
  const themeClass = siteThemeClass(companySlug);
  const defaultAuthor = `${brand} Team`;

  const serverSlug = serverPost ? postSlug(serverPost.path) : null;
  const publishedSlug = isLive ? serverSlug : null;
  const effectiveSlug = !slugTouched
    ? slugify(title)
    : slugInput === serverSlug
      ? slugInput
      : slugify(slugInput);
  const slugFormatOk =
    !!effectiveSlug && (effectiveSlug === serverSlug || SLUG_RE.test(effectiveSlug));
  const debouncedSlug = useDebounced(effectiveSlug, 400);
  const slugCheck = useQuery({
    queryKey: ['blog-slug-check', companySlug, debouncedSlug, serverPost?.id ?? 0] as const,
    enabled:
      canEdit && slugFormatOk && debouncedSlug === effectiveSlug && effectiveSlug !== serverSlug,
    queryFn: ({ signal }) =>
      seoPagesAdminApi.checkPath(
        companySlug,
        `${BLOG_PATH_PREFIX}${debouncedSlug}`,
        serverPost?.id,
        signal,
      ),
    staleTime: 15_000,
  });
  const slugTaken =
    slugRefused === effectiveSlug ||
    (effectiveSlug !== serverSlug && slugCheck.data?.available === false);
  const slugStatus = !effectiveSlug
    ? title.trim()
      ? 'invalid'
      : 'unknown'
    : !slugFormatOk
      ? 'invalid'
      : slugTaken
        ? 'taken'
        : 'ok';

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
    meta: cleanMeta(meta),
  };
  const snapshotKey = JSON.stringify(current);
  const savedKey = saved ? JSON.stringify(saved) : null;
  // Not dirty until the editor has reported its normalised baseline.
  const dirty = savedKey !== null && snapshotKey !== savedKey;

  const onBaseline = useCallback(
    (html: string) => {
      const normalised = html.trim() === EMPTY_DOC ? '' : html.trim();
      setBody(html);
      setSaved((prev) => prev ?? initialSnapshot(initialPost, normalised));
    },
    [initialPost],
  );

  const deferredBody = useDeferredValue(bodyClean);
  const facts = useMemo(() => extractDocFacts(deferredBody), [deferredBody]);
  const stats = {
    words: facts.words,
    minutes: readingMinutes(facts.words),
    internalLinks: facts.links.filter((l) => isInternalHref(l.href, domain || null)).length,
    images: facts.images.length,
  };

  const ownUrl = publicPostUrl(domain, effectiveSlug);
  const seoTitleDefault = defaultSeoTitle(current.title, brand);
  const excerpt = current.meta.excerpt ?? '';
  const issues = useMemo(
    () =>
      analyzePost({
        title: current.title,
        slug: effectiveSlug,
        slugStatus,
        doc: facts,
        seoTitle: current.metaTitle || seoTitleDefault,
        metaDescription: current.metaDescription,
        featuredImage: image,
        featuredImageAlt: current.meta.imageAlt ?? '',
        canonicalUrl: current.meta.canonicalUrl ?? '',
        noindex: !!current.meta.noindex,
        focusKeyphrase: current.meta.focusKeyphrase ?? '',
        ownUrl,
        siteHost: domain || null,
      }),
    // snapshotKey covers every field of `current`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshotKey, facts, slugStatus, seoTitleDefault, ownUrl, domain],
  );
  const errors = issues.filter((i) => i.level === 'error');
  const advisoryCount = issues.length - errors.length;

  // ── Saving ────────────────────────────────────────────────────────────────
  const { blocker, allowLeave, allowNextNavigation } = useLeaveGuard(
    dirty || saveState.kind === 'saving',
  );

  const currentRef = useRef(current);
  const savedRef = useRef(saved);
  const protectedRef = useRef(isProtected);
  useLayoutEffect(() => {
    currentRef.current = current;
    savedRef.current = saved;
    protectedRef.current = isProtected;
  });

  function buildContent(snap: Snapshot, nextStatus: SeoPageStatus | undefined) {
    const server = serverRef.current;
    const original = server ? readArticle(server).datePublished : null;
    const goingPublic =
      !!nextStatus && isPublic(nextStatus) && !(server && isPublic(server.status));
    // A picked date is stored as local noon in ISO form, so it carries a timezone and never slips a day.
    let datePublished =
      snap.date === toDateInput(original)
        ? original
        : snap.date
          ? new Date(`${snap.date}T12:00:00`).toISOString()
          : null;
    if (goingPublic && !datePublished) datePublished = new Date().toISOString();
    const schemaJsonld = writeArticle(server?.schemaJsonld ?? null, {
      image: snap.image,
      author: snap.author || null,
      datePublished,
      headline: snap.title,
      description: snap.metaDescription || snap.meta.excerpt || '',
    });
    return {
      title: snap.title,
      path: `${BLOG_PATH_PREFIX}${snap.slug}`,
      metaTitle: snap.metaTitle,
      metaDescription: snap.metaDescription,
      bodyHtml: snap.body,
      schemaJsonld,
      faq: snap.faq,
      meta: snap.meta,
    };
  }

  const doSave = useRef<
    (opts: { status?: SeoPageStatus; auto?: boolean }) => Promise<SeoPageRow | null>
  >(async () => null);
  useLayoutEffect(() => {
    doSave.current = async ({ status: nextStatus, auto }) => {
      const snap = currentRef.current;
      const server = serverRef.current;
      const key = JSON.stringify(snap);
      if (auto && (!savedRef.current || key === JSON.stringify(savedRef.current))) return null;
      setSaveState({ kind: 'saving' });
      try {
        let page: SeoPageRow;
        if (!server) {
          ({ page } = await seoPagesAdminApi.create(companySlug, {
            type: 'blog',
            source: 'dashboard',
            status: nextStatus ?? 'draft',
            ...buildContent(snap, nextStatus),
          }));
        } else {
          const statusChange =
            nextStatus && nextStatus !== server.status ? { status: nextStatus } : {};
          // A protected page refuses content writes; only its status may change.
          const patch = protectedRef.current
            ? statusChange
            : { ...buildContent(snap, nextStatus), ...statusChange };
          ({ page } = await seoPagesAdminApi.update(companySlug, server.id, {
            ...patch,
            expectedUpdatedAt: server.updatedAt,
          }));
        }
        serverRef.current = page;
        setServerPost(page);
        queryClient.setQueryData(['blog-page', companySlug, page.id], { page });
        void queryClient.invalidateQueries({ queryKey: ['blog-posts', companySlug] });

        // A first publish stamps the date server-side; mirror it unless the author typed one meanwhile.
        const stamped = toDateInput(readArticle(page).datePublished);
        const sent = snap.date ? snap : { ...snap, date: stamped };
        if (!snap.date && stamped && !currentRef.current.date) setDate(stamped);
        setSaved(sent);
        setSaveState({ kind: 'saved', at: page.updatedAt });
        if (!server) {
          allowNextNavigation();
          navigate(`/blog/${page.id}/edit`, { replace: true, state: { editorKey } });
        }
        return page;
      } catch (err) {
        const code = apiErrorCode(err);
        if (code === 'STALE') {
          const body = (err as ApiError).body as { updatedAt?: string } | undefined;
          setSaveState({ kind: 'stale', serverUpdatedAt: body?.updatedAt ?? null });
        } else if (err instanceof ApiError && err.status === 409 && /path/i.test(err.message)) {
          setSlugRefused(snap.slug);
          setSaveState({ kind: 'error', message: t('blogEditor.slugTaken'), snapshot: key });
        } else {
          setSaveState({ kind: 'error', message: errMessage(err), snapshot: key });
        }
        return null;
      }
    };
  });

  // Saves run one after another, each with the version the previous one returned.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const save = useCallback((opts: { status?: SeoPageStatus; auto?: boolean } = {}) => {
    const run = chain.current.then(() => doSave.current(opts));
    chain.current = run.catch(() => undefined);
    return run;
  }, []);

  // Drafts autosave; published posts only change on an explicit Update.
  const autosaveOn =
    !readOnly &&
    status === 'draft' &&
    !!current.title &&
    slugStatus === 'ok' &&
    saveState.kind !== 'stale';
  useEffect(() => {
    if (!autosaveOn || !dirty || saveState.kind === 'saving') return;
    if (saveState.kind === 'error' && saveState.snapshot === snapshotKey) return;
    const timer = window.setTimeout(() => void save({ auto: true }), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [autosaveOn, dirty, snapshotKey, saveState, save]);

  // ── Focus + panels ────────────────────────────────────────────────────────
  const focusById = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
    return true;
  }, []);

  const focusField = useCallback(
    (target: FieldTarget) => {
      const spec = TARGETS[target];
      if (target === 'content') {
        editor?.commands.focus();
        document
          .getElementById('post-content')
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      if (!spec.tab) {
        focusById(spec.id);
        return;
      }
      setTab(spec.tab);
      if (spec.open === 'advanced') setAdvancedOpen(true);
      if (spec.open === 'social') setSocialOpen(true);
      pendingFocus.current = spec.id;
      if (isXl) {
        setSidebarOpen(true);
        window.setTimeout(() => {
          if (pendingFocus.current && focusById(pendingFocus.current)) pendingFocus.current = null;
        }, 60);
      } else {
        setSheetOpen(true);
      }
    },
    [editor, focusById, isXl],
  );

  const openPanel = useCallback(
    (next?: Tab) => {
      if (next) setTab(next);
      if (isXl) {
        setSidebarOpen((open) => {
          const value = next ? true : !open;
          writeSidebarPref(value);
          return value;
        });
      } else {
        setSheetOpen(true);
      }
    },
    [isXl],
  );

  function generateDescription() {
    const draft = suggestDescription(facts.firstParagraph || facts.text);
    if (!draft) return;
    setMetaDescription(draft);
    focusField('metaDescription');
  }

  function fixIssue(issue: SeoIssue) {
    setPublishOpen(false);
    if (issue.fix === 'demoteH1' && editor) {
      demoteBodyH1(editor);
      toast.success(t('blogSeo.fixed.demoteH1'));
      return;
    }
    if (issue.fix === 'generateDescription') {
      generateDescription();
      return;
    }
    focusField(issue.target);
  }

  // Once the editor is ready: move focus to the deep-linked field and drop the params.
  const handledDeepLink = useRef(false);
  useEffect(() => {
    if (handledDeepLink.current || saved === null) return;
    handledDeepLink.current = true;
    if (!deepLink.focus && !deepLink.preview) return;
    if (deepLink.focus === 'content') editor?.commands.focus();
    else if (deepSpec && !deepSpec.tab) focusById(deepSpec.id);
    else if (isXl && pendingFocus.current) {
      const id = pendingFocus.current;
      pendingFocus.current = null;
      window.setTimeout(() => focusById(id), 60);
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('focus');
        next.delete('preview');
        return next;
      },
      { replace: true, state: location.state },
    );
  }, [saved, deepLink, deepSpec, editor, isXl, focusById, setSearchParams, location.state]);

  // ── Actions ───────────────────────────────────────────────────────────────
  async function publish() {
    setBusyAction('publish');
    const page = await save({ status: 'live' });
    setBusyAction(null);
    if (page) {
      setPublishOpen(false);
      toast.success(t('blog.publishedToast'));
    }
  }

  async function update(confirmed = false) {
    if (errors.length > 0) {
      setPublishOpen(true);
      return;
    }
    if (!confirmed && publishedSlug && effectiveSlug !== publishedSlug) {
      setSlugConfirmOpen(true);
      return;
    }
    setBusyAction('update');
    const page = await save();
    setBusyAction(null);
    setSlugConfirmOpen(false);
    if (page) toast.success(t('blogEditor.updatedToast'));
  }

  async function unpublish() {
    setBusyAction('unpublish');
    const page = await save({ status: 'draft' });
    setBusyAction(null);
    setUnpublishOpen(false);
    if (page) toast.success(t('blog.unpublishedToast'));
  }

  async function removePost() {
    if (!serverPost) return;
    setBusyAction('delete');
    try {
      await seoPagesAdminApi.remove(companySlug, serverPost.id);
      toast.success(t('blog.deletedToast'));
      void queryClient.invalidateQueries({ queryKey: ['blog-posts', companySlug] });
      queryClient.removeQueries({ queryKey: ['blog-page', companySlug, serverPost.id] });
      allowLeave();
      navigate('/blog');
    } catch (err) {
      toast.error(errMessage(err));
      setDeleteOpen(false);
    } finally {
      setBusyAction(null);
    }
  }

  async function duplicate() {
    if (!serverPost) return;
    setBusyAction('duplicate');
    try {
      const { page } = await seoPagesAdminApi.duplicate(companySlug, serverPost.id);
      void queryClient.invalidateQueries({ queryKey: ['blog-posts', companySlug] });
      toast.success(t('blog.duplicatedToast'));
      navigate(`/blog/${page.id}/edit`);
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setBusyAction(null);
    }
  }

  function reloadLatest() {
    if (!serverPost) return;
    queryClient.removeQueries({ queryKey: ['blog-page', companySlug, serverPost.id] });
    allowLeave();
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: { editorKey: `reload-${Date.now()}` },
    });
  }

  function overwrite() {
    if (saveState.kind !== 'stale' || !serverRef.current || !saveState.serverUpdatedAt) return;
    serverRef.current = { ...serverRef.current, updatedAt: saveState.serverUpdatedAt };
    void save();
  }

  const saveDraft = () => void save();
  const primary = isLive ? () => void update() : () => setPublishOpen(true);

  const actionsRef = useRef({ isLive, readOnly, update, saveDraft });
  useLayoutEffect(() => {
    actionsRef.current = { isLive, readOnly, update, saveDraft };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const a = actionsRef.current;
        if (a.readOnly) return;
        if (a.isLive) void a.update();
        else a.saveDraft();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const dateLabel = date
    ? new Date(`${date}T12:00:00`).toLocaleDateString(bcp47, { dateStyle: 'long' })
    : null;
  const busy = busyAction !== null;

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const sidebar = (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex min-h-0 flex-col">
      <TabsList
        variant="line"
        overflow="scroll"
        className="sticky top-0 z-10 shrink-0 bg-card px-4 pt-2"
      >
        <TabsTrigger value="post">{t('blogEditor.tabPost')}</TabsTrigger>
        <TabsTrigger value="seo">{t('blogEditor.tabSeo')}</TabsTrigger>
        <TabsTrigger value="checks">
          {t('blogEditor.tabChecks')}
          {issues.length > 0 ? (
            <CountPill tone={errors.length > 0 ? 'solid' : 'muted'}>{issues.length}</CountPill>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="outline">{t('blogEditor.tabOutline')}</TabsTrigger>
      </TabsList>

      <TabsContent value="post" className="mt-0 px-4 pb-8">
        <div className="flex flex-col divide-y divide-border">
          <PanelSection
            title={isLive ? t('blogEditor.publishedSection') : t('blogEditor.readinessSection')}
            action={<StatusBadge label={t(STATUS_KEY[status])} tone={STATUS_TONE[status]} />}
          >
            {isLive ? (
              <div className="flex flex-col gap-1.5 text-2sm">
                <p className="text-muted-foreground">
                  {dateLabel
                    ? t('blogEditor.publishedOn', { date: dateLabel })
                    : t('blogEditor.visibilityLive', { domain })}
                </p>
                {publicPostUrl(domain, publishedSlug ?? '') ? (
                  <a
                    href={publicPostUrl(domain, publishedSlug ?? '')!}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 self-start rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    {t('blog.viewOnSite')}
                  </a>
                ) : null}
              </div>
            ) : errors.length === 0 ? (
              <p className="flex items-start gap-2 text-2sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                {t('blogEditor.readyToPublish')}
              </p>
            ) : (
              <>
                <p className="text-2sm text-muted-foreground">
                  {t('blogEditor.itemsLeft', { n: errors.length })}
                </p>
                <IssueList issues={errors} onFix={fixIssue} levels={['error']} />
              </>
            )}
            {advisoryCount > 0 ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto self-start p-0 text-xs sm:h-auto"
                onClick={() => setTab('checks')}
              >
                {advisoryCount === 1
                  ? t('blogEditor.adviceCountOne')
                  : t('blogEditor.adviceCount', { n: advisoryCount })}
              </Button>
            ) : null}
          </PanelSection>

          <PanelSection
            title={t('blog.featuredImage')}
            description={t('blogEditor.featuredImageHint')}
          >
            <ImageField
              id="featured-image"
              companySlug={companySlug}
              value={image}
              onChange={setImage}
              disabled={readOnly}
              invalid={!image}
            />
            {image ? (
              <>
                <FormField
                  label={t('blogEditor.imageAlt')}
                  htmlFor="featured-image-alt"
                  hint={t('blogEditor.featuredAltHint')}
                >
                  <Input
                    value={meta.imageAlt ?? ''}
                    onChange={(e) => setMeta('imageAlt', e.target.value)}
                    placeholder={t('blogEditor.imageAltPlaceholder')}
                    disabled={readOnly}
                    maxLength={300}
                  />
                </FormField>
                {!readOnly && !meta.imageAlt?.trim() && current.title ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="-mt-1 self-start"
                    onClick={() => {
                      setMeta('imageAlt', current.title);
                      focusById('featured-image-alt');
                    }}
                  >
                    {t('blogEditor.altFromTitle')}
                  </Button>
                ) : null}
                <FormField label={t('blogEditor.imageCaption')} htmlFor="featured-image-caption">
                  <Input
                    value={meta.imageCaption ?? ''}
                    onChange={(e) => setMeta('imageCaption', e.target.value)}
                    disabled={readOnly}
                    maxLength={300}
                  />
                </FormField>
              </>
            ) : null}
          </PanelSection>

          <PanelSection title={t('blogEditor.excerpt')} description={t('blogEditor.excerptHint')}>
            <Label htmlFor="post-excerpt" className="sr-only">
              {t('blogEditor.excerpt')}
            </Label>
            <Textarea
              id="post-excerpt"
              rows={3}
              value={meta.excerpt ?? ''}
              onChange={(e) => setMeta('excerpt', e.target.value)}
              placeholder={t('blogEditor.excerptPlaceholder')}
              disabled={readOnly}
              maxLength={500}
            />
          </PanelSection>

          <PanelSection title={t('blogEditor.urlSection')}>
            <FormField
              label={t('blogEditor.slug')}
              htmlFor="post-slug"
              error={
                slugStatus === 'invalid'
                  ? t('blogEditor.slugInvalid')
                  : slugStatus === 'taken'
                    ? t('blogEditor.slugTaken')
                    : null
              }
              hint={slugTouched ? t('blogEditor.slugHintFixed') : t('blogEditor.slugHintAuto')}
            >
              <Input
                value={slugTouched ? slugInput : effectiveSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlugInput(e.target.value);
                }}
                onBlur={() => {
                  if (slugTouched && effectiveSlug) setSlugInput(effectiveSlug);
                }}
                disabled={readOnly}
                spellCheck={false}
                autoCapitalize="off"
                className="font-mono"
              />
            </FormField>
            {slugStatus === 'taken' && slugCheck.data?.suggestion ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="self-start"
                onClick={() => {
                  setSlugTouched(true);
                  setSlugInput(postSlug(slugCheck.data!.suggestion!));
                }}
              >
                {t('blogEditor.useSlug', { slug: postSlug(slugCheck.data.suggestion) })}
              </Button>
            ) : null}
            {ownUrl ? <p className="break-all text-xs text-muted-foreground">{ownUrl}</p> : null}
            {publishedSlug && effectiveSlug !== publishedSlug ? (
              <Alert tone="warning">{t('blogEditor.slugChangeWarning')}</Alert>
            ) : null}
            {slugTouched &&
            !readOnly &&
            !isLive &&
            effectiveSlug !== slugify(title) &&
            title.trim() ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="self-start"
                onClick={() => {
                  setSlugTouched(false);
                  setSlugInput(slugify(title));
                }}
              >
                <RefreshCw aria-hidden="true" />
                {t('blogEditor.slugFromTitle')}
              </Button>
            ) : null}
          </PanelSection>

          <PanelSection title={t('blogEditor.detailsSection')}>
            <FormField
              label={t('blogEditor.author')}
              htmlFor="post-author"
              hint={t('blogEditor.authorHint', { name: defaultAuthor })}
            >
              <Input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder={defaultAuthor}
                disabled={readOnly}
                maxLength={120}
              />
            </FormField>
            <FormField
              label={t('blogEditor.publishDate')}
              htmlFor="post-date"
              hint={
                dateLabel
                  ? t('blogEditor.publishDateShown', { date: dateLabel })
                  : t('blogEditor.publishDateAuto')
              }
            >
              <DatePicker value={date} onValueChange={setDate} disabled={readOnly} />
            </FormField>
          </PanelSection>
        </div>
      </TabsContent>

      <TabsContent value="seo" className="mt-0 px-4 pb-8">
        <SeoTab
          disabled={readOnly}
          companySlug={companySlug}
          brand={brand}
          domain={domain}
          ownUrl={ownUrl}
          slug={effectiveSlug}
          seoTitleDefault={seoTitleDefault}
          metaTitle={metaTitle}
          onMetaTitle={setMetaTitle}
          metaDescription={metaDescription}
          onMetaDescription={setMetaDescription}
          descriptionFallback={excerpt}
          onGenerateDescription={generateDescription}
          canGenerate={facts.words > 0}
          meta={meta}
          setMeta={setMeta}
          featuredImage={image}
          socialOpen={socialOpen}
          onSocialOpen={setSocialOpen}
          advancedOpen={advancedOpen}
          onAdvancedOpen={setAdvancedOpen}
        />
      </TabsContent>

      <TabsContent value="checks" className="mt-0 px-4 pb-8">
        <div className="flex flex-col gap-4 pt-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('blogSeo.checksIntro')}
          </p>
          {issues.length === 0 ? (
            <p className="flex items-start gap-2 text-2sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              {t('blogSeo.allClear')}
            </p>
          ) : (
            <IssueList issues={issues} onFix={fixIssue} />
          )}
        </div>
      </TabsContent>

      <TabsContent value="outline" id="outline-tab" className="mt-0 px-4 pb-8">
        <OutlinePanel editor={editor} stats={stats} />
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="flex min-h-[calc(100svh-3.5rem)] flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <TopBar
        title={current.title || (serverPost ? t('blogEditor.untitled') : t('blogEditor.newTitle'))}
        status={status}
        saveIndicator={
          <SaveIndicator
            state={saveState}
            dirty={dirty}
            autosave={autosaveOn}
            bcp47={bcp47}
            onRetry={() => void save()}
            onReload={reloadLatest}
            readOnly={readOnly}
          />
        }
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreviewOpen(true)}
                  aria-label={t('blogEditor.preview')}
                >
                  <Eye aria-hidden="true" />
                  <span className="hidden xl:inline">{t('blogEditor.preview')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="xl:hidden">
                {t('blogEditor.preview')}
              </TooltipContent>
            </Tooltip>
            {!readOnly && !isLive ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden sm:inline-flex"
                    aria-label={t('blogEditor.saveDraft')}
                    onClick={saveDraft}
                    disabled={
                      busy ||
                      saveState.kind === 'saving' ||
                      (!!serverPost && !dirty) ||
                      !current.title
                    }
                  >
                    <Save aria-hidden="true" />
                    <span className="hidden xl:inline">{t('blogEditor.saveDraft')}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="xl:hidden">
                  {t('blogEditor.saveDraft')}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {!readOnly ? (
              <Button
                size="sm"
                onClick={primary}
                disabled={busy || (isLive && !dirty)}
                loading={busyAction === 'update'}
                aria-keyshortcuts={isLive ? 'Meta+S Control+S' : undefined}
                aria-label={isLive ? t('blogEditor.update') : t('blogEditor.publishEllipsis')}
              >
                {isLive ? <Save aria-hidden="true" /> : <Send aria-hidden="true" />}
                <span className="hidden sm:inline">
                  {isLive ? t('blogEditor.update') : t('blogEditor.publishEllipsis')}
                </span>
              </Button>
            ) : null}
            {serverPost || (!readOnly && !isLive) ? (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild disabled={busy}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('blog.moreActionsShort')}
                        loading={busyAction === 'duplicate' || busyAction === 'unpublish'}
                      >
                        <MoreHorizontal aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t('blog.moreActionsShort')}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-52">
                  {!readOnly && !isLive ? (
                    <DropdownMenuItem
                      className="sm:hidden"
                      disabled={(!!serverPost && !dirty) || !current.title}
                      onSelect={saveDraft}
                    >
                      <Save aria-hidden="true" />
                      {t('blogEditor.saveDraft')}
                    </DropdownMenuItem>
                  ) : null}
                  {isLive && publishedSlug && domain ? (
                    <DropdownMenuItem asChild>
                      <a
                        href={publicPostUrl(domain, publishedSlug)!}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink aria-hidden="true" />
                        {t('blog.viewOnSite')}
                      </a>
                    </DropdownMenuItem>
                  ) : null}
                  {isLive && canEdit ? (
                    <DropdownMenuItem onSelect={() => setUnpublishOpen(true)}>
                      <Undo2 aria-hidden="true" />
                      {t('blog.unpublish')}
                    </DropdownMenuItem>
                  ) : null}
                  {serverPost && canEdit ? (
                    <DropdownMenuItem onSelect={() => void duplicate()}>
                      <Copy aria-hidden="true" />
                      {t('blog.duplicate')}
                    </DropdownMenuItem>
                  ) : null}
                  {serverPost && canEdit ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setDeleteOpen(true)}
                        className="text-destructive focus:bg-destructive-soft focus:text-destructive"
                      >
                        <Trash2 aria-hidden="true" />
                        {t('blog.deleteAction')}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="relative"
                  onClick={() => openPanel()}
                  aria-label={t('blogEditor.settings')}
                  aria-expanded={isXl ? sidebarOpen : sheetOpen}
                  aria-controls="blog-editor-panel"
                >
                  <PanelRight aria-hidden="true" />
                  {errors.length > 0 ? (
                    <span
                      className="absolute right-1 top-1 size-2 rounded-full bg-highlight"
                      aria-hidden="true"
                    />
                  ) : null}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t('blogEditor.settings')}
                {errors.length > 0 ? ` · ${t('blogEditor.itemsLeft', { n: errors.length })}` : ''}
              </TooltipContent>
            </Tooltip>
          </>
        }
      />

      <div className="flex flex-1 items-stretch">
        <div className={cn('blog-canvas min-w-0 flex-1', themeClass)}>
          <div className="mx-auto w-full max-w-[46rem] px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
            {isProtected || !canEdit || saveState.kind === 'stale' ? (
              <div className="mb-6 flex flex-col gap-3 text-foreground">
                {isProtected ? (
                  <Alert tone="warning" icon={<Lock aria-hidden="true" />}>
                    {t('blogEditor.protectedNotice')}
                  </Alert>
                ) : null}
                {!canEdit ? <Alert tone="info">{t('blogEditor.readOnlyNotice')}</Alert> : null}
                {saveState.kind === 'stale' ? (
                  <Alert
                    tone="warning"
                    title={t('blogEditor.staleTitle')}
                    action={
                      <div className="flex flex-wrap gap-2">
                        <Button size="xs" variant="outline" onClick={reloadLatest}>
                          {t('blogEditor.staleReload')}
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={overwrite}
                          disabled={!saveState.serverUpdatedAt}
                        >
                          {t('blogEditor.staleOverwrite')}
                        </Button>
                      </div>
                    }
                  >
                    {t('blogEditor.staleBody')}
                  </Alert>
                ) : null}
              </div>
            ) : null}

            <Label htmlFor="post-title" className="sr-only">
              {t('blog.fieldTitle')}
            </Label>
            <textarea
              id="post-title"
              value={title}
              onChange={(e) => setTitle(e.target.value.replace(/\s*\n\s*/g, ' '))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  editor?.commands.focus('start');
                }
              }}
              placeholder={t('blogEditor.titlePlaceholder')}
              readOnly={readOnly}
              maxLength={300}
              rows={1}
              ref={titleRef}
              aria-invalid={!current.title && dirty ? true : undefined}
              style={{ fontFamily: 'var(--bp-heading-font)', color: 'var(--bp-fg)' }}
              className="block w-full resize-none overflow-hidden rounded-sm bg-transparent text-3xl font-bold leading-tight tracking-tight outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-transparent sm:text-4xl"
            />
            <div
              className="mt-3 flex min-w-0 items-center gap-x-1.5 text-2sm"
              style={{ color: 'var(--bp-muted)' }}
            >
              <Link2 className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">
                {domain}/blog/
                <span className="font-medium" style={{ color: 'var(--bp-fg)' }}>
                  {effectiveSlug || '…'}
                </span>
                /
              </span>
              {!readOnly ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto min-h-6 shrink-0 px-1 py-0 text-2sm sm:h-auto"
                  onClick={() => focusField('slug')}
                >
                  {t('blogEditor.editSlug')}
                </Button>
              ) : null}
            </div>
            <div className="flex min-h-0 flex-wrap items-center gap-2 empty:hidden">
              {slugStatus === 'taken' ? (
                <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-destructive">
                  <CircleX className="size-3.5" aria-hidden="true" />
                  {t('blogEditor.slugTakenShort')}
                </span>
              ) : publishedSlug && effectiveSlug !== publishedSlug ? (
                <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-warning">
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                  {t('blogEditor.slugChangedShort')}
                </span>
              ) : null}
            </div>

            <div className="mt-8">
              <RichTextEditor
                companySlug={companySlug}
                initialHtml={initialPost?.bodyHtml ?? ''}
                readOnly={readOnly}
                onChange={setBody}
                onBaseline={onBaseline}
                onReady={setEditor}
                stickyTop="top-[7.5rem]"
                status={
                  <>
                    {t('blogEditor.words', { n: stats.words })} ·{' '}
                    {t('blogEditor.readingTime', { n: stats.minutes })}
                  </>
                }
              />
            </div>

            <div className="mt-10">
              <FaqPanel items={faq} onChange={setFaq} disabled={readOnly} />
            </div>
          </div>
        </div>

        {isXl && sidebarOpen ? (
          <aside
            id="blog-editor-panel"
            aria-label={t('blogEditor.settings')}
            className="sticky top-28 h-[calc(100svh-7rem)] w-[23rem] shrink-0 overflow-y-auto overscroll-contain border-l border-border bg-card"
          >
            {sidebar}
          </aside>
        ) : null}
      </div>

      {!isXl ? (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            id="blog-editor-panel"
            side="right"
            variant="content"
            className="gap-0 overflow-y-auto p-0 pb-[env(safe-area-inset-bottom)] pt-12 sm:max-w-md"
            onOpenAutoFocus={(e) => {
              const id = pendingFocus.current;
              if (!id) return;
              e.preventDefault();
              pendingFocus.current = null;
              window.setTimeout(() => focusById(id), 80);
            }}
          >
            <SheetTitle>{t('blogEditor.settings')}</SheetTitle>
            <SheetDescription>{t('blogEditor.settingsHint')}</SheetDescription>
            {sidebar}
          </SheetContent>
        </Sheet>
      ) : null}

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        themeClass={themeClass}
        data={{
          title: current.title,
          description: excerpt || current.metaDescription,
          author: current.author || defaultAuthor,
          date: date || null,
          image,
          imageAlt: current.meta.imageAlt ?? '',
          imageCaption: current.meta.imageCaption ?? '',
          html: bodyClean,
          faq: current.faq,
          readingMinutes: stats.minutes,
          url: ownUrl ?? `/blog/${effectiveSlug}/`,
        }}
      />
      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        issues={issues}
        url={ownUrl}
        dateLabel={dateLabel}
        noindex={!!current.meta.noindex}
        publishing={busyAction === 'publish' || busyAction === 'update'}
        onPublish={() => (isLive ? void update() : void publish())}
        onFix={fixIssue}
        onReview={() => {
          setPublishOpen(false);
          openPanel('checks');
        }}
      />
      <ConfirmDialog
        open={slugConfirmOpen}
        onOpenChange={setSlugConfirmOpen}
        title={t('blogEditor.slugConfirmTitle')}
        description={t('blogEditor.slugConfirmBody', {
          old: `/blog/${publishedSlug ?? ''}/`,
          next: `/blog/${effectiveSlug}/`,
        })}
        confirmLabel={t('blogEditor.update')}
        cancelLabel={t('common.cancel')}
        isPending={busyAction === 'update'}
        onConfirm={() => void update(true)}
      />
      <ConfirmDialog
        open={unpublishOpen}
        onOpenChange={setUnpublishOpen}
        title={t('blog.unpublishConfirmTitle')}
        description={t('blog.unpublishConfirmBody', { domain })}
        confirmLabel={t('blog.unpublish')}
        cancelLabel={t('common.cancel')}
        isPending={busyAction === 'unpublish'}
        onConfirm={() => void unpublish()}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('blog.deleteAction')}
        description={isLive ? t('blogEditor.confirmDeleteLive') : t('blog.confirmDelete')}
        confirmLabel={t('blog.deleteAction')}
        cancelLabel={t('common.cancel')}
        isDangerous
        isPending={busyAction === 'delete'}
        onConfirm={() => void removePost()}
      />
      <LeaveGuardDialog blocker={blocker} />
    </div>
  );
}

function TopBar({
  title,
  status,
  saveIndicator,
  actions,
}: {
  title: string;
  status: SeoPageStatus;
  saveIndicator: ReactNode;
  actions: ReactNode;
}) {
  const t = useT();
  return (
    <div className="sticky top-14 z-20 border-b border-border bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
      <div className="flex h-14 items-center gap-1.5 px-2 sm:gap-2 sm:px-4 lg:px-6">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="shrink-0" asChild>
              <Link to="/blog" aria-label={t('blog.backToList')}>
                <ArrowLeft aria-hidden="true" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('blog.backToList')}</TooltipContent>
        </Tooltip>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <h1 className="truncate text-sm font-semibold leading-5">{title}</h1>
          <div className="flex min-w-0 items-center gap-2">
            <StatusBadge
              label={t(STATUS_KEY[status])}
              tone={STATUS_TONE[status]}
              className="hidden shrink-0 py-0 text-2xs md:inline-flex"
            />
            {saveIndicator}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">{actions}</div>
      </div>
    </div>
  );
}

function SaveIndicator({
  state,
  dirty,
  autosave,
  bcp47,
  readOnly,
  onRetry,
  onReload,
}: {
  state: SaveState;
  dirty: boolean;
  autosave: boolean;
  bcp47: string;
  readOnly: boolean;
  onRetry: () => void;
  onReload: () => void;
}) {
  const t = useT();
  if (readOnly) return null;
  let content: ReactNode = null;
  let tone = 'text-muted-foreground';
  if (state.kind === 'saving') {
    content = <span>{t('common.saving')}</span>;
  } else if (state.kind === 'error') {
    tone = 'text-destructive';
    content = (
      <>
        <CircleX className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{t('blogEditor.saveFailed')}</span>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-sm font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('common.retry')}
        </button>
      </>
    );
  } else if (state.kind === 'stale') {
    tone = 'text-warning';
    content = (
      <>
        <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{t('blogEditor.staleShort')}</span>
        <button
          type="button"
          onClick={onReload}
          className="shrink-0 rounded-sm font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('blogEditor.staleReload')}
        </button>
      </>
    );
  } else if (dirty) {
    tone = 'text-warning';
    content = (
      <>
        <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
        <span>{autosave ? t('blogEditor.unsavedAuto') : t('blogEditor.unsaved')}</span>
      </>
    );
  } else if (state.kind === 'saved') {
    content = (
      <>
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
        <span>
          {t('blogEditor.savedAt', {
            time: formatDateTime(
              state.at,
              bcp47,
              new Date(state.at).toDateString() === new Date().toDateString()
                ? { timeStyle: 'short' }
                : { dateStyle: 'short', timeStyle: 'short' },
            ),
          })}
        </span>
      </>
    );
  }
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium [&>span]:truncate',
        tone,
      )}
    >
      {content}
    </div>
  );
}

function EditorShellMessage({ title, children }: { title: string; children: ReactNode }) {
  const t = useT();
  return (
    <PageContainer width="narrow" className="px-4 pt-4 sm:px-5 sm:pt-5 lg:px-8 lg:pt-6">
      <BackLink to="/blog" className="mb-2 self-start">
        {t('blog.backToList')}
      </BackLink>
      <PageHeading title={title} />
      {children}
    </PageContainer>
  );
}

function EditorSkeleton() {
  const t = useT();
  return (
    <div className="flex flex-col" role="status" aria-label={t('common.loading')}>
      <div className="flex h-14 items-center gap-3 border-b border-border px-4">
        <Skeleton className="size-8" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="ml-auto h-8 w-24" />
      </div>
      <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-4 px-4 pt-10 sm:px-8">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-6 h-10 w-full rounded-lg" />
        <Skeleton className="h-[28rem] w-full rounded-lg" />
      </div>
    </div>
  );
}
