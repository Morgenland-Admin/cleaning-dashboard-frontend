import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  ImageOff,
  MoreHorizontal,
  Newspaper,
  Pencil,
  Plus,
  Send,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { FilterChip } from '@/components/filter-chip';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { SearchInput } from '@/components/search-input';
import { StatusBadge } from '@/components/status-badge';
import { ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT, type DictKey } from '@/i18n';
import { useAccessLevel } from '@/lib/access';
import {
  apiErrorCode,
  errMessage,
  seoPagesAdminApi,
  type BlogListItem,
  type BlogSort,
  type SeoPageStatus,
} from '@/lib/api';
import {
  canEditBlog,
  isPublic,
  listBlockers,
  postSlug,
  publicPostUrl,
  STATUS_KEY,
  STATUS_TONE,
  type ListBlocker,
} from '@/lib/blog-utils';
import { useDebounced } from '@/lib/use-debounced';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';

const PAGE_SIZE = 25;

type StatusFilter = 'all' | SeoPageStatus;
const STATUS_FILTERS: StatusFilter[] = ['all', 'draft', 'live', 'protected'];
const SORTS: BlogSort[] = ['updated', 'published', 'created', 'title'];

const BLOCKER_FIX: Record<ListBlocker, { focus: string; label: DictKey }> = {
  image: { focus: 'featuredImage', label: 'blog.fixImage' },
  title: { focus: 'title', label: 'blog.fixTitle' },
  body: { focus: 'content', label: 'blog.fixBody' },
};

type Pending = { kind: 'publish' | 'unpublish' | 'delete'; post: BlogListItem } | null;

export function BlogPage() {
  const { activeProject, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const t = useT();
  const { bcp47 } = useLocale();
  const canEdit = canEditBlog(useAccessLevel());
  usePageTitle(t('blog.title'));

  const slug = activeProject.companySlug;
  const domain = activeProject.domain ?? '';

  // Filters live in the URL so returning from the editor restores the same view.
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status') as StatusFilter | null;
  const status: StatusFilter = rawStatus && STATUS_FILTERS.includes(rawStatus) ? rawStatus : 'all';
  const attention = params.get('attention') === '1';
  const rawSort = params.get('sort') as BlogSort | null;
  const sort: BlogSort = rawSort && SORTS.includes(rawSort) ? rawSort : 'updated';
  const [search, setSearch] = useState(() => params.get('q') ?? '');
  const q = useDebounced(search.trim(), 300);

  function setParam(key: string, value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  useEffect(() => {
    if ((params.get('q') ?? '') === q) return;
    setParam('q', q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const list = useInfiniteQuery({
    queryKey: ['blog-posts', slug, { status, attention, sort, q }] as const,
    enabled: !isAllBrands,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      seoPagesAdminApi.listPosts(
        slug,
        {
          q: q || undefined,
          status: status === 'all' ? undefined : status,
          attention,
          sort,
          offset: pageParam,
          limit: PAGE_SIZE,
        },
        signal,
      ),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.posts.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    placeholderData: keepPreviousData,
  });

  const posts = useMemo(() => list.data?.pages.flatMap((p) => p.posts) ?? [], [list.data]);
  const first = list.data?.pages[0];
  const counts = first?.counts;
  const total = first?.total ?? 0;
  const isFiltered = status !== 'all' || attention || q !== '';

  const [pending, setPending] = useState<Pending>(null);
  const [working, setWorking] = useState<number | null>(null);

  function refresh(id?: number) {
    void queryClient.invalidateQueries({ queryKey: ['blog-posts', slug] });
    if (id) void queryClient.invalidateQueries({ queryKey: ['blog-page', slug, id] });
  }

  async function runPending() {
    if (!pending) return;
    const { kind, post } = pending;
    setWorking(post.id);
    try {
      if (kind === 'delete') {
        await seoPagesAdminApi.remove(slug, post.id);
        queryClient.removeQueries({ queryKey: ['blog-page', slug, post.id] });
        toast.success(t('blog.deletedToast'));
      } else {
        await seoPagesAdminApi.update(slug, post.id, {
          status: kind === 'publish' ? 'live' : 'draft',
          expectedUpdatedAt: post.updatedAt,
        });
        toast.success(kind === 'publish' ? t('blog.publishedToast') : t('blog.unpublishedToast'));
      }
      refresh(post.id);
    } catch (err) {
      toast.error(apiErrorCode(err) === 'STALE' ? t('blog.staleToast') : errMessage(err));
      refresh(post.id);
    } finally {
      setWorking(null);
      setPending(null);
    }
  }

  async function duplicate(post: BlogListItem) {
    setWorking(post.id);
    try {
      const { page } = await seoPagesAdminApi.duplicate(slug, post.id);
      refresh();
      toast.success(t('blog.duplicatedToast'));
      navigate(`/blog/${page.id}/edit`);
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setWorking(null);
    }
  }

  function resetFilters() {
    setSearch('');
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const key of ['status', 'attention', 'q']) next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  const heading = (
    <PageHeading
      breadcrumb={[
        { label: isAllBrands ? t('brandFilter.allBrands') : activeProject.name },
        { label: t('blog.title') },
      ]}
      title={t('blog.title')}
      subtitle={domain ? t('blog.subtitleDomain', { domain }) : t('blog.subtitle')}
      actions={
        isAllBrands || !canEdit ? undefined : (
          <Button size="sm" asChild>
            <Link to="/blog/new">
              <Plus aria-hidden="true" />
              {t('blog.newPost')}
            </Link>
          </Button>
        )
      }
    />
  );

  if (isAllBrands) {
    return (
      <PageContainer width="full">
        {heading}
        <EmptyState
          variant="dashed"
          icon={<Newspaper aria-hidden="true" />}
          message={t('blog.selectBrandFirst')}
        />
      </PageContainer>
    );
  }

  const rowProps = (post: BlogListItem) => ({
    post,
    domain,
    canEdit,
    busy: working === post.id,
    t,
    bcp47,
    onPublish: () => setPending({ kind: 'publish', post }),
    onUnpublish: () => setPending({ kind: 'unpublish', post }),
    onDelete: () => setPending({ kind: 'delete', post }),
    onDuplicate: () => void duplicate(post),
  });

  const emptyBlog = counts?.all === 0 && !q;

  return (
    <PageContainer width="full" className="gap-4">
      {heading}

      {emptyBlog ? null : (
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SegmentedControl
              label={t('blog.filterStatus')}
              value={status}
              onValueChange={(v) => setParam('status', v === 'all' ? '' : v)}
              overflow="scroll"
              options={STATUS_FILTERS.filter(
                (v) => v !== 'protected' || (counts?.protected ?? 0) > 0 || status === 'protected',
              ).map((value) => ({
                value,
                label: value === 'all' ? t('blog.filterAll') : t(STATUS_KEY[value]),
                count: counts ? (value === 'all' ? counts.all : counts[value]) : undefined,
              }))}
            />
            {(counts?.attention ?? 0) > 0 || attention ? (
              <FilterChip
                pressed={attention}
                onPressedChange={(p) => setParam('attention', p ? '1' : '')}
                icon={<AlertTriangle aria-hidden="true" />}
              >
                {t('blog.needsAttention')}
                {counts ? <span className="tabular-nums">{counts.attention}</span> : null}
              </FilterChip>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput
              value={search}
              onValueChange={setSearch}
              placeholder={t('blog.searchPlaceholder')}
              label={t('blog.searchLabel')}
              searching={list.isFetching && !list.isFetchingNextPage && q !== ''}
              containerClassName="sm:flex-1 xl:w-72 xl:flex-none"
            />
            <Select<BlogSort>
              value={sort}
              onValueChange={(v) => setParam('sort', v === 'updated' ? '' : v)}
              aria-label={t('blog.sortLabel')}
              className="sm:w-52"
              options={SORTS.map((s) => ({ value: s, label: t(`blog.sort.${s}` as DictKey) }))}
            />
          </div>
        </div>
      )}

      {list.isLoading ? (
        <ListSkeletonRows label={t('common.loading')} />
      ) : list.error ? (
        <ErrorState
          error={list.error}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : emptyBlog ? (
        <EmptyState
          variant="dashed"
          icon={<Newspaper aria-hidden="true" />}
          title={t('blog.empty')}
          message={t('blog.emptyHint')}
          action={
            canEdit ? (
              <Button size="sm" asChild>
                <Link to="/blog/new">
                  <Plus aria-hidden="true" />
                  {t('blog.createFirst')}
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : posts.length === 0 ? (
        <EmptyState
          variant="dashed"
          icon={<Newspaper aria-hidden="true" />}
          message={t('blog.emptyFiltered')}
          action={
            <Button variant="outline" size="sm" onClick={resetFilters}>
              {t('blog.resetFilters')}
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-live="polite">
            <span className="tabular-nums">
              {total === 1 ? t('blog.resultCountOne') : t('blog.resultCount', { n: total })}
            </span>
            {isFiltered ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs sm:h-auto"
                onClick={resetFilters}
              >
                {t('blog.resetFilters')}
              </Button>
            ) : null}
          </div>
          <div
            className={cn(
              'overflow-clip rounded-lg border border-border bg-card',
              list.isPlaceholderData && 'opacity-60',
            )}
          >
            <ul className="divide-y divide-border md:hidden">
              {posts.map((post) => (
                <li key={post.id}>
                  <PostCompactRow {...rowProps(post)} />
                </li>
              ))}
            </ul>
            <Table containerClassName="hidden w-full md:block">
              <caption className="sr-only">{t('blog.tableCaption')}</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('blog.col.post')}</TableHead>
                  <TableHead className="w-36">{t('blog.col.status')}</TableHead>
                  <TableHead className="hidden w-44 lg:table-cell">
                    {sort === 'published'
                      ? t('blog.col.published')
                      : sort === 'created'
                        ? t('blog.col.created')
                        : t('blog.col.updated')}
                  </TableHead>
                  <TableHead className="w-px text-right">
                    <span className="sr-only">{t('blog.col.actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => (
                  <PostTableRow key={post.id} sort={sort} {...rowProps(post)} />
                ))}
              </TableBody>
            </Table>
            <InfiniteScrollSentinel
              hasMore={!!list.hasNextPage}
              isLoading={list.isFetchingNextPage}
              onIntersect={() => {
                if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
              }}
            />
          </div>
        </>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => (!o ? setPending(null) : undefined)}
        title={
          pending?.kind === 'publish'
            ? t('blog.publishConfirmTitle')
            : pending?.kind === 'unpublish'
              ? t('blog.unpublishConfirmTitle')
              : t('blog.deleteAction')
        }
        description={
          pending?.kind === 'publish'
            ? t('blog.publishConfirmBody', {
                title: pending.post.title ?? postSlug(pending.post.path),
                url: publicPostUrl(domain, postSlug(pending.post.path)) ?? '',
              })
            : pending?.kind === 'unpublish'
              ? t('blog.unpublishConfirmBody', { domain })
              : pending && isPublic(pending.post.status)
                ? t('blogEditor.confirmDeleteLive')
                : t('blog.confirmDelete')
        }
        confirmLabel={
          pending?.kind === 'publish'
            ? t('blog.publish')
            : pending?.kind === 'unpublish'
              ? t('blog.unpublish')
              : t('blog.deleteAction')
        }
        cancelLabel={t('common.cancel')}
        isDangerous={pending?.kind === 'delete'}
        isPending={working !== null && pending !== null}
        onConfirm={() => void runPending()}
      />
    </PageContainer>
  );
}

interface RowProps {
  post: BlogListItem;
  domain: string;
  canEdit: boolean;
  busy: boolean;
  t: ReturnType<typeof useT>;
  bcp47: string;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

function Thumb({ src, className }: { src: string | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex aspect-video shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground',
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <ImageOff className="size-4" />
      )}
    </span>
  );
}

function shortDate(iso: string | null, bcp47: string): string | null {
  return iso ? formatDateTime(iso, bcp47, { dateStyle: 'medium' }) : null;
}

/** One clear next step: the first blocker as a direct fix, otherwise Publish (drafts) or View (live). */
function PrimaryAction({ post, domain, canEdit, busy, t, onPublish }: RowProps) {
  const blockers = listBlockers(post);
  const live = isPublic(post.status);
  if (blockers.length > 0 && canEdit) {
    const fix = BLOCKER_FIX[blockers[0]!];
    const label = blockers.length === 1 ? t(fix.label) : t('blog.fixMany', { n: blockers.length });
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="xs"
            className="text-warning hover:bg-warning-soft hover:text-warning"
            asChild
          >
            <Link to={`/blog/${post.id}/edit?focus=${fix.focus}`}>
              <AlertTriangle aria-hidden="true" />
              {label}
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          {live ? t('blog.liveBlockers') : t('blog.publishBlockers')}{' '}
          {blockers.map((b) => t(`blog.blocker.${b}` as DictKey)).join(', ')}
        </TooltipContent>
      </Tooltip>
    );
  }
  if (live) {
    const url = publicPostUrl(domain, postSlug(post.path));
    return url ? (
      <Button variant="ghost" size="xs" asChild>
        <a href={url} target="_blank" rel="noreferrer">
          <ExternalLink aria-hidden="true" />
          {t('blog.view')}
        </a>
      </Button>
    ) : null;
  }
  if (!canEdit) return null;
  return (
    <Button variant="ghost" size="xs" onClick={onPublish} disabled={busy}>
      <Send aria-hidden="true" />
      {t('blog.publish')}
    </Button>
  );
}

function RowMenu({
  post,
  domain,
  canEdit,
  busy,
  t,
  onPublish,
  onUnpublish,
  onDelete,
  onDuplicate,
}: RowProps) {
  const live = isPublic(post.status);
  const ready = listBlockers(post).length === 0;
  const title = post.title ?? postSlug(post.path);
  const url = publicPostUrl(domain, postSlug(post.path));
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild disabled={busy}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('blog.moreActions', { title })}
              loading={busy}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('blog.moreActionsShort')}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <Link to={`/blog/${post.id}/edit`}>
            <Pencil aria-hidden="true" />
            {canEdit ? t('common.edit') : t('blog.open')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={`/blog/${post.id}/edit?preview=1`}>
            <Eye aria-hidden="true" />
            {t('blogEditor.preview')}
          </Link>
        </DropdownMenuItem>
        {live && url ? (
          <DropdownMenuItem asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" />
              {t('blog.viewOnSite')}
            </a>
          </DropdownMenuItem>
        ) : null}
        {canEdit ? (
          <>
            <DropdownMenuSeparator />
            {live ? (
              <DropdownMenuItem onSelect={onUnpublish}>
                <Undo2 aria-hidden="true" />
                {t('blog.unpublish')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={onPublish} disabled={!ready}>
                <Send aria-hidden="true" />
                {t('blog.publish')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy aria-hidden="true" />
              {t('blog.duplicate')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-destructive focus:bg-destructive-soft focus:text-destructive"
            >
              <Trash2 aria-hidden="true" />
              {t('blog.deleteAction')}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusCell({ post, t }: Pick<RowProps, 'post' | 't'>) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <StatusBadge label={t(STATUS_KEY[post.status])} tone={STATUS_TONE[post.status]} />
      {post.noindex ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" tabIndex={0} className="gap-1">
              <EyeOff className="size-3" aria-hidden="true" />
              noindex
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{t('blog.noindexHint')}</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}

function PostTableRow(props: RowProps & { sort: BlogSort }) {
  const { post, t, bcp47, sort } = props;
  const title = post.title?.trim() || t('blogEditor.untitled');
  const dateIso =
    sort === 'published'
      ? post.datePublished
      : sort === 'created'
        ? post.createdAt
        : post.updatedAt;
  const published =
    isPublic(post.status) && sort !== 'published' ? shortDate(post.datePublished, bcp47) : null;
  return (
    <TableRow>
      <TableCell className="py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Thumb src={post.image} className="w-16" />
          <div className="min-w-0">
            <Link
              to={`/blog/${post.id}/edit`}
              className={cn(
                'line-clamp-1 rounded-sm text-2sm font-medium hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                !post.title?.trim() && 'italic text-muted-foreground',
              )}
            >
              {title}
            </Link>
            <p className="truncate text-xs text-muted-foreground">/blog/{postSlug(post.path)}/</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <StatusCell post={post} t={t} />
      </TableCell>
      <TableCell className="hidden whitespace-nowrap text-xs tabular-nums text-muted-foreground lg:table-cell">
        {dateIso ? (
          <time dateTime={dateIso} title={formatDateTime(dateIso, bcp47)}>
            {shortDate(dateIso, bcp47)}
          </time>
        ) : (
          '—'
        )}
        {published ? (
          <p className="text-2xs">{t('blog.publishedOn', { date: published })}</p>
        ) : null}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-1">
          <PrimaryAction {...props} />
          <RowMenu {...props} />
        </div>
      </TableCell>
    </TableRow>
  );
}

function PostCompactRow(props: RowProps) {
  const { post, t, bcp47 } = props;
  const title = post.title?.trim() || t('blogEditor.untitled');
  return (
    <div className="flex gap-3 px-3 py-3">
      <Thumb src={post.image} className="w-20" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          to={`/blog/${post.id}/edit`}
          className={cn(
            'line-clamp-2 rounded-sm text-2sm font-medium leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            !post.title?.trim() && 'italic text-muted-foreground',
          )}
        >
          {title}
        </Link>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <StatusCell post={post} t={t} />
          <time dateTime={post.updatedAt} className="tabular-nums">
            {shortDate(post.updatedAt, bcp47)}
          </time>
        </div>
        <div className="-ml-2 flex items-center gap-1">
          <PrimaryAction {...props} />
        </div>
      </div>
      <div className="shrink-0">
        <RowMenu {...props} />
      </div>
    </div>
  );
}

function ListSkeletonRows({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="divide-y divide-border rounded-lg border border-border bg-card"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3" aria-hidden="true">
          <Skeleton className="aspect-video w-16 shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="hidden h-5 w-20 md:block" />
          <Skeleton className="h-7 w-20" />
        </div>
      ))}
    </div>
  );
}
