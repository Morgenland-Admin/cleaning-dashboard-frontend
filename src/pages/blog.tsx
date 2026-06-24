import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Newspaper,
  Pencil,
  RefreshCcw,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { BlogEditDialog } from '@/components/blog-edit-dialog';
import { BlogImageDialog } from '@/components/blog-image-dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageHeading } from '@/components/page-heading';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import { ApiError, seoPagesAdminApi, type SeoPageRow, type SeoPageStatus } from '@/lib/api';
import { featuredImageUrl, postSlug, STATUS_KEY, STATUS_TONE } from '@/lib/blog-utils';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';

const PAGE_SIZE = 50;

type StatusFilter = 'all' | 'draft' | 'live';
const STATUS_FILTERS: StatusFilter[] = ['all', 'draft', 'live'];

function apiMessage(err: unknown, t: ReturnType<typeof useT>): string | null {
  if (!err) return null;
  if (err instanceof ApiError) return err.message;
  return t('common.error');
}

export function BlogPage() {
  const { activeProject, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('blog.title'));

  const slug = activeProject.companySlug;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editTarget, setEditTarget] = useState<SeoPageRow | null>(null);
  const [imageTarget, setImageTarget] = useState<SeoPageRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SeoPageRow | null>(null);

  const listQuery = useInfiniteQuery({
    queryKey: ['blog-pages', slug, statusFilter] as const,
    enabled: !isAllBrands,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      seoPagesAdminApi.list(
        slug,
        {
          type: 'blog',
          status: statusFilter === 'all' ? undefined : statusFilter,
          limit: PAGE_SIZE,
          cursor: pageParam ?? undefined,
        },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const posts = useMemo<SeoPageRow[]>(
    () => (listQuery.data?.pages ?? []).flatMap((p) => p.pages),
    [listQuery.data],
  );

  const loadMore = useCallback(() => {
    if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) {
      void listQuery.fetchNextPage();
    }
  }, [listQuery]);

  const invalidate = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ['blog-pages', slug] }),
    [queryClient, slug],
  );

  const statusMutation = useMutation({
    mutationFn: (vars: { id: number; status: SeoPageStatus }) =>
      seoPagesAdminApi.update(slug, vars.id, { status: vars.status }),
    onSuccess: (_data, vars) => {
      invalidate();
      toast.success(vars.status === 'live' ? t('blog.publishedToast') : t('blog.unpublishedToast'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => seoPagesAdminApi.remove(slug, id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast.success(t('blog.deletedToast'));
    },
    onError: () => setDeleteTarget(null),
  });

  const listError = apiMessage(listQuery.error, t);
  const actionError = apiMessage(statusMutation.error, t) ?? apiMessage(deleteMutation.error, t);

  const busyId =
    (statusMutation.isPending ? statusMutation.variables?.id : null) ??
    (deleteMutation.isPending ? deleteMutation.variables : null);

  const heading = (
    <PageHeading
      breadcrumb={
        <span className="flex items-center gap-2">
          <span>{isAllBrands ? t('brandFilter.allBrands') : activeProject.name}</span>
          <span aria-hidden="true">/</span>
          <span className="text-foreground">{t('blog.title')}</span>
        </span>
      }
      title={t('blog.title')}
      subtitle={t('blog.subtitle')}
      actions={
        isAllBrands ? undefined : (
          <Button
            variant="outline"
            className="h-11"
            onClick={() => void listQuery.refetch()}
            disabled={listQuery.isFetching}
          >
            <RefreshCcw
              className={cn('size-4', listQuery.isFetching && 'animate-spin')}
              aria-hidden="true"
            />
            {t('common.refresh')}
          </Button>
        )
      }
    />
  );

  if (isAllBrands) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        {heading}
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<Newspaper className="size-8" aria-hidden="true" />}
              message={t('blog.selectBrandFirst')}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {heading}

      <div className="flex flex-col gap-6">
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label={t('blog.title')}
        >
          {STATUS_FILTERS.map((value) => (
            <FilterChip
              key={value}
              active={statusFilter === value}
              label={value === 'all' ? t('blog.filterAll') : t(STATUS_KEY[value as SeoPageStatus])}
              onClick={() => setStatusFilter(value)}
            />
          ))}
        </div>

        {listError ? <ErrorAlert message={listError} /> : null}
        {actionError ? <ErrorAlert message={actionError} /> : null}

        {listQuery.isLoading ? (
          <div className="flex flex-col gap-4" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : posts.length === 0 && !listError ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={<Newspaper className="size-8" aria-hidden="true" />}
                title={t('blog.empty')}
                message={t('blog.emptyHint')}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                t={t}
                bcp47={bcp47}
                disabled={busyId === post.id}
                onEdit={() => setEditTarget(post)}
                onImage={() => setImageTarget(post)}
                onPublish={() => statusMutation.mutate({ id: post.id, status: 'live' })}
                onUnpublish={() => statusMutation.mutate({ id: post.id, status: 'draft' })}
                onDelete={() => setDeleteTarget(post)}
              />
            ))}
            <InfiniteScrollSentinel
              hasMore={!!listQuery.hasNextPage}
              isLoading={listQuery.isFetchingNextPage}
              onIntersect={loadMore}
            />
          </div>
        )}
      </div>

      <BlogEditDialog
        key={editTarget ? `edit-${editTarget.id}` : 'edit-none'}
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        companySlug={slug}
        post={editTarget}
        onSuccess={invalidate}
      />
      <BlogImageDialog
        key={imageTarget ? `img-${imageTarget.id}` : 'img-none'}
        open={!!imageTarget}
        onOpenChange={(o) => !o && setImageTarget(null)}
        companySlug={slug}
        post={imageTarget}
        onSuccess={invalidate}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t('blog.deleteAction')}
        description={t('blog.confirmDelete')}
        confirmLabel={t('blog.deleteAction')}
        cancelLabel={t('common.cancel')}
        isDangerous
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        active
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground/80 hover:bg-muted',
      )}
    >
      {label}
    </button>
  );
}

function PostCard({
  post,
  t,
  bcp47,
  disabled,
  onEdit,
  onImage,
  onPublish,
  onUnpublish,
  onDelete,
}: {
  post: SeoPageRow;
  t: ReturnType<typeof useT>;
  bcp47: string;
  disabled: boolean;
  onEdit: () => void;
  onImage: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
}) {
  const image = featuredImageUrl(post);
  const isLive = post.status === 'live' || post.status === 'protected';
  const detailHref = `/blog/${post.id}`;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:p-6">
        <Link
          to={detailHref}
          aria-label={post.title ?? postSlug(post.path)}
          className="aspect-16/10 relative w-full shrink-0 overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-44"
        >
          {image ? (
            <img
              src={image}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
              <ImagePlus className="size-5" aria-hidden="true" />
              {t('blog.noImage')}
            </span>
          )}
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={t(STATUS_KEY[post.status])} tone={STATUS_TONE[post.status]} />
            <time dateTime={post.updatedAt} className="text-xs tabular-nums text-muted-foreground">
              {formatDateTime(post.updatedAt, bcp47)}
            </time>
            {!image ? (
              <span className="text-xs font-medium text-amber-600">{t('blog.needsImage')}</span>
            ) : null}
          </div>

          <h3 className="text-lg font-bold tracking-tight">
            <Link
              to={detailHref}
              className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {post.title ?? postSlug(post.path)}
            </Link>
          </h3>
          <p className="truncate text-sm text-muted-foreground">/{post.path}</p>
          {post.metaDescription ? (
            <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {post.metaDescription}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" className="h-11" onClick={onEdit} disabled={disabled}>
              <Pencil className="size-4" aria-hidden="true" />
              {t('common.edit')}
            </Button>
            <Button variant="outline" className="h-11" onClick={onImage} disabled={disabled}>
              <ImagePlus className="size-4" aria-hidden="true" />
              {image ? t('blog.replaceImage') : t('blog.uploadImage')}
            </Button>
            {isLive ? (
              <Button variant="outline" className="h-11" onClick={onUnpublish} disabled={disabled}>
                {disabled ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Undo2 className="size-4" aria-hidden="true" />
                )}
                {t('blog.unpublish')}
              </Button>
            ) : (
              <Button
                className="h-11"
                onClick={onPublish}
                disabled={disabled || !image}
                title={!image ? t('blog.needImageBeforePublish') : undefined}
              >
                {disabled ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                )}
                {t('blog.publish')}
              </Button>
            )}
            <Button
              variant="outline"
              className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onDelete}
              disabled={disabled}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {t('blog.deleteAction')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:p-6">
        <Skeleton className="aspect-16/10 w-full shrink-0 rounded-lg sm:w-44" />
        <div className="flex flex-1 flex-col gap-3" aria-hidden="true">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-11 w-28" />
            <Skeleton className="h-11 w-28" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
