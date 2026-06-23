import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ChevronDown,
  Eye,
  EyeOff,
  Flag,
  Loader2,
  RefreshCcw,
  Reply,
  Star,
  Trash2,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageHeading } from '@/components/page-heading';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useProject } from '@/contexts/project-context';
import { useLocale, useT, type DictKey } from '@/i18n';
import { ApiError, reviewsAdminApi, type ReviewRow, type ReviewStatus } from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';

const PAGE_SIZE = 50;

const STATUS_KEY: Record<ReviewStatus, DictKey> = {
  new: 'reviews.status.new',
  published: 'reviews.status.published',
  flagged: 'reviews.status.flagged',
  hidden: 'reviews.status.hidden',
};

const STATUS_TONE: Record<ReviewStatus, 'info' | 'success' | 'warning' | 'neutral'> = {
  new: 'info',
  published: 'success',
  flagged: 'warning',
  hidden: 'neutral',
};

const STATUS_FILTERS: (ReviewStatus | 'all')[] = ['all', 'new', 'published', 'flagged', 'hidden'];

function apiMessage(err: unknown, t: ReturnType<typeof useT>): string | null {
  if (!err) return null;
  if (err instanceof ApiError) return err.message;
  return t('common.error');
}

export function ReviewsPage() {
  const { activeProject, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('reviews.title'));

  const slug = activeProject.companySlug;
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | 'all'>('all');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [flagTarget, setFlagTarget] = useState<ReviewRow | null>(null);
  const [respondTarget, setRespondTarget] = useState<ReviewRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReviewRow | null>(null);

  const listQuery = useInfiniteQuery({
    queryKey: ['reviews', slug, statusFilter, flaggedOnly] as const,
    enabled: !isAllBrands,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      reviewsAdminApi.list(
        slug,
        {
          limit: PAGE_SIZE,
          cursor: pageParam ?? undefined,
          status: statusFilter === 'all' ? undefined : statusFilter,
          flagged: flaggedOnly ? true : undefined,
        },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const reviews = useMemo<ReviewRow[]>(
    () => (listQuery.data?.pages ?? []).flatMap((p) => p.reviews),
    [listQuery.data],
  );

  const loadMore = useCallback(() => {
    if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) {
      void listQuery.fetchNextPage();
    }
  }, [listQuery]);

  const invalidate = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ['reviews', slug] }),
    [queryClient, slug],
  );

  const statusMutation = useMutation({
    mutationFn: (vars: { id: number; status: ReviewStatus }) =>
      reviewsAdminApi.setStatus(slug, vars.id, vars.status),
    onSuccess: invalidate,
  });

  const flagMutation = useMutation({
    mutationFn: (vars: { id: number; reason: string }) =>
      reviewsAdminApi.flag(slug, vars.id, vars.reason),
    onSuccess: () => {
      invalidate();
      setFlagTarget(null);
    },
  });

  const respondMutation = useMutation({
    mutationFn: (vars: { id: number; response: string }) =>
      reviewsAdminApi.respond(slug, vars.id, vars.response),
    onSuccess: () => {
      invalidate();
      setRespondTarget(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => reviewsAdminApi.remove(slug, id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
    },
    // Close the confirm dialog so the error alert underneath is visible.
    onError: () => setDeleteTarget(null),
  });

  const listError = apiMessage(listQuery.error, t);
  // Flag/respond errors are surfaced inside their dialogs; this alert covers the rest.
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
          <span className="text-foreground">{t('reviews.title')}</span>
        </span>
      }
      title={t('reviews.title')}
      subtitle={t('reviews.subtitle')}
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
              icon={<Star className="size-8" aria-hidden="true" />}
              message={t('reviews.selectBrandFirst')}
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
        {/* Filters: status chips + flagged-only toggle */}
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label={t('reviews.filterStatus')}
        >
          {STATUS_FILTERS.map((value) => (
            <FilterChip
              key={value}
              active={statusFilter === value}
              label={value === 'all' ? t('reviews.filterAll') : t(STATUS_KEY[value])}
              onClick={() => setStatusFilter(value)}
            />
          ))}
          <span aria-hidden="true" className="h-6 w-px bg-border" />
          <FilterChip
            active={flaggedOnly}
            label={t('reviews.onlyFlagged')}
            icon={<Flag className="size-3.5" aria-hidden="true" />}
            onClick={() => setFlaggedOnly((v) => !v)}
          />
        </div>

        {listError ? (
          <div
            role="alert"
            aria-live="assertive"
            className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{listError}</span>
            </span>
            <Button
              variant="outline"
              className="h-11 shrink-0"
              onClick={() => void listQuery.refetch()}
              disabled={listQuery.isFetching}
            >
              <RefreshCcw className="size-4" aria-hidden="true" />
              {t('common.refresh')}
            </Button>
          </div>
        ) : null}

        {actionError ? (
          <div
            role="alert"
            aria-live="assertive"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{actionError}</span>
          </div>
        ) : null}

        {listQuery.isLoading ? (
          <div className="flex flex-col gap-4" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : reviews.length === 0 && !listError ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={<Star className="size-8" aria-hidden="true" />}
                title={t('reviews.empty')}
                message={t('reviews.emptyHint')}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {reviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                t={t}
                bcp47={bcp47}
                disabled={busyId === review.id}
                onPublish={() => statusMutation.mutate({ id: review.id, status: 'published' })}
                onHide={() => statusMutation.mutate({ id: review.id, status: 'hidden' })}
                onFlag={() => {
                  flagMutation.reset();
                  setFlagTarget(review);
                }}
                onRespond={() => {
                  respondMutation.reset();
                  setRespondTarget(review);
                }}
                onDelete={() => setDeleteTarget(review)}
              />
            ))}
            <InfiniteScrollSentinel
              hasMore={!!listQuery.hasNextPage}
              isLoading={listQuery.isFetchingNextPage}
              onIntersect={loadMore}
            />
          </div>
        )}

        <ReviewTextDialog
          key={flagTarget ? `flag-${flagTarget.id}` : 'flag-none'}
          open={!!flagTarget}
          onOpenChange={(open) => {
            if (!open) setFlagTarget(null);
          }}
          title={t('reviews.flag')}
          label={t('reviews.flagReason')}
          submitLabel={t('reviews.flag')}
          cancelLabel={t('common.cancel')}
          textareaId="review-flag-reason"
          initialValue=""
          isPending={flagMutation.isPending}
          errorText={apiMessage(flagMutation.error, t)}
          onSubmit={(value) => {
            if (flagTarget) flagMutation.mutate({ id: flagTarget.id, reason: value });
          }}
        />

        <ReviewTextDialog
          key={respondTarget ? `respond-${respondTarget.id}` : 'respond-none'}
          open={!!respondTarget}
          onOpenChange={(open) => {
            if (!open) setRespondTarget(null);
          }}
          title={t('reviews.respond')}
          label={t('reviews.responseLabel')}
          submitLabel={t('reviews.respondSave')}
          cancelLabel={t('common.cancel')}
          textareaId="review-response-text"
          initialValue={respondTarget?.partnerResponse ?? ''}
          isPending={respondMutation.isPending}
          errorText={apiMessage(respondMutation.error, t)}
          onSubmit={(value) => {
            if (respondTarget) respondMutation.mutate({ id: respondTarget.id, response: value });
          }}
        />

        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title={t('reviews.deleteAction')}
          description={t('reviews.confirmDelete')}
          confirmLabel={t('reviews.deleteAction')}
          cancelLabel={t('common.cancel')}
          isDangerous
          isPending={deleteMutation.isPending}
          onConfirm={() => {
            if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
          }}
        />
      </div>
    </div>
  );
}

function FilterChip({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon?: React.ReactNode;
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
      {icon}
      {label}
    </button>
  );
}

function StarRating({ rating, label }: { rating: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={cn(
            'size-4',
            i <= rating ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground/40',
          )}
        />
      ))}
    </span>
  );
}

function ReviewCard({
  review,
  t,
  bcp47,
  disabled,
  onPublish,
  onHide,
  onFlag,
  onRespond,
  onDelete,
}: {
  review: ReviewRow;
  t: ReturnType<typeof useT>;
  bcp47: string;
  disabled: boolean;
  onPublish: () => void;
  onHide: () => void;
  onFlag: () => void;
  onRespond: () => void;
  onDelete: () => void;
}) {
  const name =
    review.customerName && review.customerName.trim() !== ''
      ? review.customerName
      : t('reviews.anonymous');
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StarRating
            rating={review.rating}
            label={t('reviews.ratingAria', { n: review.rating })}
          />
          <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
          {review.customerEmail ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {review.customerEmail}
            </span>
          ) : null}
          <time dateTime={review.createdAt} className="text-xs tabular-nums text-muted-foreground">
            {formatDateTime(review.createdAt, bcp47)}
          </time>
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            <StatusBadge label={t(STATUS_KEY[review.status])} tone={STATUS_TONE[review.status]} />
            {review.flagged ? (
              <Badge variant="destructive" className="gap-1">
                <Flag className="size-3" aria-hidden="true" />
                {t('reviews.flaggedBadge')}
              </Badge>
            ) : null}
          </span>
        </div>

        {review.comment ? <ExpandableComment text={review.comment} /> : null}

        {review.flagged && review.flagReason ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
            <span className="mb-0.5 block text-xs font-medium uppercase tracking-wide text-destructive">
              {t('reviews.flagReason')}
            </span>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {review.flagReason}
            </p>
          </div>
        ) : null}

        {review.partnerResponse ? (
          <blockquote className="ml-2 border-l-2 border-primary/40 pl-3 sm:ml-4">
            <div className="mb-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium uppercase tracking-wide">{t('reviews.responded')}</span>
              {review.respondedAt ? (
                <time dateTime={review.respondedAt} className="tabular-nums">
                  {formatDateTime(review.respondedAt, bcp47)}
                </time>
              ) : null}
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {review.partnerResponse}
            </p>
          </blockquote>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          {review.status !== 'published' ? (
            <Button variant="outline" className="h-11" onClick={onPublish} disabled={disabled}>
              <Eye className="size-4" aria-hidden="true" />
              {t('reviews.publish')}
            </Button>
          ) : null}
          {review.status !== 'hidden' ? (
            <Button variant="outline" className="h-11" onClick={onHide} disabled={disabled}>
              <EyeOff className="size-4" aria-hidden="true" />
              {t('reviews.hide')}
            </Button>
          ) : null}
          <Button variant="outline" className="h-11" onClick={onRespond} disabled={disabled}>
            <Reply className="size-4" aria-hidden="true" />
            {t('reviews.respond')}
          </Button>
          {!review.flagged ? (
            <Button variant="outline" className="h-11" onClick={onFlag} disabled={disabled}>
              <Flag className="size-4" aria-hidden="true" />
              {t('reviews.flag')}
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
            disabled={disabled}
          >
            {disabled ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="size-4" aria-hidden="true" />
            )}
            {t('reviews.deleteAction')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const LONG_COMMENT_CHARS = 280;

function ExpandableComment({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > LONG_COMMENT_CHARS || text.split('\n').length > 4;

  if (!isLong) {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>;
  }

  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={() => setExpanded((v) => !v)}
      className={cn(
        '-mx-1 rounded-md px-1 py-0.5 text-left',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
    >
      <p className={cn('whitespace-pre-wrap text-sm leading-relaxed', !expanded && 'line-clamp-4')}>
        {text}
      </p>
      <span className="mt-1 inline-flex min-h-6 items-center gap-1 text-xs font-medium text-primary">
        <ChevronDown
          aria-hidden="true"
          className={cn('size-3.5 transition-transform', expanded && 'rotate-180')}
        />
        <span aria-hidden="true">…</span>
      </span>
    </button>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="space-y-3" aria-hidden="true">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="ml-auto h-5 w-20" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-11 w-28" />
            <Skeleton className="h-11 w-28" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewTextDialog({
  open,
  onOpenChange,
  title,
  label,
  submitLabel,
  cancelLabel,
  textareaId,
  initialValue,
  isPending,
  errorText,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  submitLabel: string;
  cancelLabel: string;
  textareaId: string;
  initialValue: string;
  isPending: boolean;
  errorText: string | null;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 grid w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-card p-6 shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (trimmed !== '') onSubmit(trimmed);
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={textareaId}>{label}</Label>
              <Textarea
                id={textareaId}
                rows={5}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
            {errorText ? (
              <div
                role="alert"
                aria-live="assertive"
                className="flex items-start gap-1.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{errorText}</span>
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="outline" className="h-11" disabled={isPending}>
                  {cancelLabel}
                </Button>
              </DialogPrimitive.Close>
              <Button type="submit" className="h-11" disabled={isPending || trimmed === ''}>
                {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {submitLabel}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
