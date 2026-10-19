import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Eye, EyeOff, Flag, Reply, Star, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ClaudeChatBox } from '@/components/claude-chat-box';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { FilterChip } from '@/components/filter-chip';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { SectionLabel } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useProject, type CompanySlug } from '@/contexts/project-context';
import { useLocale, useT, type DictKey } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import { ApiError, reviewsAdminApi, type ReviewRow, type ReviewStatus } from '@/lib/api';
import { useClaudeAssist } from '@/lib/use-claude-assist';
import { useIsDesktop } from '@/lib/use-is-desktop';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime, isNonContactableEmail } from '@/lib/utils';

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

type PendingAction = 'published' | 'hidden' | 'delete' | null;

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
  // Viewers and `seo` read reviews; moderation is manager+ (the backend rejects the rest).
  const readOnly = !useCanWrite();

  const slug = activeProject.companySlug;
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | 'all'>('all');

  const listScrollRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
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

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [statusFilter, flaggedOnly, slug]);

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
    onError: () => setDeleteTarget(null),
  });

  const listError = apiMessage(listQuery.error, t);
  // Flag/respond errors surface inside their dialogs; this alert covers the rest.
  const actionError = apiMessage(statusMutation.error, t) ?? apiMessage(deleteMutation.error, t);

  function pendingFor(id: number): PendingAction {
    if (statusMutation.isPending && statusMutation.variables?.id === id) {
      return statusMutation.variables.status === 'hidden' ? 'hidden' : 'published';
    }
    if (deleteMutation.isPending && deleteMutation.variables === id) return 'delete';
    return null;
  }

  const heading = (
    <PageHeading
      breadcrumb={[
        { label: isAllBrands ? t('brandFilter.allBrands') : activeProject.name },
        { label: t('reviews.title') },
      ]}
      title={t('reviews.title')}
      subtitle={t('reviews.subtitle')}
      actions={
        isAllBrands ? undefined : (
          <RefreshButton onClick={() => void listQuery.refetch()} fetching={listQuery.isFetching} />
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
          icon={<Star aria-hidden="true" />}
          message={t('reviews.selectBrandFirst')}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="full">
      {heading}

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label={t('reviews.filterStatus')}
            value={statusFilter}
            onValueChange={setStatusFilter}
            overflow="scroll"
            options={STATUS_FILTERS.map((value) => ({
              value,
              label: value === 'all' ? t('reviews.filterAll') : t(STATUS_KEY[value]),
            }))}
          />
          <FilterChip
            pressed={flaggedOnly}
            onPressedChange={setFlaggedOnly}
            icon={<Flag aria-hidden="true" />}
          >
            {t('reviews.onlyFlagged')}
          </FilterChip>
        </div>

        {listError ? (
          <ErrorState
            error={new Error(listError)}
            onRetry={() => void listQuery.refetch()}
            retrying={listQuery.isFetching}
          />
        ) : null}

        {actionError ? (
          <Alert
            tone="destructive"
            onDismiss={() => {
              statusMutation.reset();
              deleteMutation.reset();
            }}
          >
            {actionError}
          </Alert>
        ) : null}

        {listQuery.isLoading ? (
          <SkeletonRows label={t('common.loading')} />
        ) : reviews.length === 0 ? (
          listError ? null : (
            <EmptyState
              variant="dashed"
              icon={<Star aria-hidden="true" />}
              title={t('reviews.empty')}
              message={t('reviews.emptyHint')}
            />
          )
        ) : (
          <div
            ref={listScrollRef}
            className="rounded-lg border border-border bg-card lg:max-h-[calc(100svh-15rem)] lg:overflow-y-auto lg:overscroll-contain"
          >
            <ul className="divide-y divide-border">
              {reviews.map((review) => (
                <ReviewListItem
                  key={review.id}
                  review={review}
                  t={t}
                  bcp47={bcp47}
                  pending={pendingFor(review.id)}
                  readOnly={readOnly}
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
            </ul>
            <InfiniteScrollSentinel
              hasMore={!!listQuery.hasNextPage}
              isLoading={listQuery.isFetchingNextPage}
              onIntersect={loadMore}
              // Root only when the box scrolls (lg+); otherwise the sentinel stays inside it and loads every page.
              rootRef={isDesktop ? listScrollRef : undefined}
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
          t={t}
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
          aiAssist={respondTarget ? { companySlug: slug, reviewId: respondTarget.id } : undefined}
          t={t}
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
    </PageContainer>
  );
}

function StarRating({ rating, label }: { rating: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={cn('size-4', i <= rating ? 'fill-rating text-rating' : 'text-input')}
        />
      ))}
    </span>
  );
}

function ReviewListItem({
  review,
  t,
  bcp47,
  pending,
  readOnly,
  onPublish,
  onHide,
  onFlag,
  onRespond,
  onDelete,
}: {
  review: ReviewRow;
  t: ReturnType<typeof useT>;
  bcp47: string;
  pending: PendingAction;
  readOnly: boolean;
  onPublish: () => void;
  onHide: () => void;
  onFlag: () => void;
  onRespond: () => void;
  onDelete: () => void;
}) {
  const disabled = pending !== null;
  const name =
    review.customerName && review.customerName.trim() !== ''
      ? review.customerName
      : t('reviews.anonymous');
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StarRating rating={review.rating} label={t('reviews.ratingAria', { n: review.rating })} />
        <span className="min-w-0 truncate text-2sm font-semibold">{name}</span>
        {review.customerEmail && !isNonContactableEmail(review.customerEmail) ? (
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {review.customerEmail}
          </span>
        ) : null}
        <time dateTime={review.createdAt} className="text-xs tabular-nums text-muted-foreground">
          {formatDateTime(review.createdAt, bcp47)}
        </time>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <StatusBadge
            label={(STATUS_KEY[review.status] && t(STATUS_KEY[review.status])) || review.status}
            tone={STATUS_TONE[review.status] ?? 'neutral'}
          />
          {review.flagged ? (
            <Badge variant="destructive">
              <Flag aria-hidden="true" />
              {t('reviews.flaggedBadge')}
            </Badge>
          ) : null}
        </span>
      </div>

      {review.comment ? <ExpandableComment text={review.comment} /> : null}

      {review.flagged && review.flagReason ? (
        <Alert tone="warning" icon={<Flag aria-hidden="true" />} title={t('reviews.flagReason')}>
          <p className="whitespace-pre-wrap">{review.flagReason}</p>
        </Alert>
      ) : null}

      {review.partnerResponse ? (
        <blockquote className="border-l-2 border-primary/40 pl-3">
          <div className="mb-0.5 flex flex-wrap items-center gap-2">
            <SectionLabel as="span">{t('reviews.responded')}</SectionLabel>
            {review.respondedAt ? (
              <time
                dateTime={review.respondedAt}
                className="text-xs tabular-nums text-muted-foreground"
              >
                {formatDateTime(review.respondedAt, bcp47)}
              </time>
            ) : null}
          </div>
          <p className="whitespace-pre-wrap text-2sm leading-relaxed text-foreground/90">
            {review.partnerResponse}
          </p>
        </blockquote>
      ) : null}

      {readOnly ? null : (
        <div className="-ml-2 flex flex-wrap items-center gap-1">
          {review.status !== 'published' ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={onPublish}
              disabled={disabled}
              loading={pending === 'published'}
            >
              <Eye aria-hidden="true" />
              {t('reviews.publish')}
            </Button>
          ) : null}
          {review.status !== 'hidden' ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={onHide}
              disabled={disabled}
              loading={pending === 'hidden'}
            >
              <EyeOff aria-hidden="true" />
              {t('reviews.hide')}
            </Button>
          ) : null}
          <Button variant="ghost" size="xs" onClick={onRespond} disabled={disabled}>
            <Reply aria-hidden="true" />
            {t('reviews.respond')}
          </Button>
          {!review.flagged ? (
            <Button variant="ghost" size="xs" onClick={onFlag} disabled={disabled}>
              <Flag aria-hidden="true" />
              {t('reviews.flag')}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="xs"
            className="text-destructive hover:bg-destructive-soft hover:text-destructive"
            onClick={onDelete}
            disabled={disabled}
            loading={pending === 'delete'}
          >
            <Trash2 aria-hidden="true" />
            {t('reviews.deleteAction')}
          </Button>
        </div>
      )}
    </li>
  );
}

const LONG_COMMENT_CHARS = 280;

function ExpandableComment({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > LONG_COMMENT_CHARS || text.split('\n').length > 4;

  if (!isLong) {
    return <p className="whitespace-pre-wrap text-2sm leading-relaxed">{text}</p>;
  }

  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={() => setExpanded((v) => !v)}
      className="-mx-1 rounded-md px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <p
        className={cn('whitespace-pre-wrap text-2sm leading-relaxed', !expanded && 'line-clamp-4')}
      >
        {text}
      </p>
      <span className="mt-1 inline-flex min-h-6 items-center gap-1 text-xs font-medium text-primary">
        <ChevronDown
          aria-hidden="true"
          className={cn('size-3.5 transition-transform duration-fast', expanded && 'rotate-180')}
        />
        <span aria-hidden="true">…</span>
      </span>
    </button>
  );
}

function SkeletonRows({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="divide-y divide-border rounded-lg border border-border bg-card"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2.5 px-4 py-3 sm:px-5" aria-hidden="true">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="ml-auto h-5 w-20" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-7 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ReviewResponseAssistant({
  companySlug,
  reviewId,
  value,
  setValue,
  t,
}: {
  companySlug: CompanySlug;
  reviewId: number;
  value: string;
  setValue: (text: string) => void;
  t: ReturnType<typeof useT>;
}) {
  const assist = useClaudeAssist({
    kind: 'review_response',
    companySlug,
    refId: reviewId,
    getCurrent: () => value,
    apply: setValue,
    updatedLabel: t('ai.updated'),
  });
  return (
    <ClaudeChatBox
      editablePrompt={{ kind: 'review_response', companySlug }}
      busy={assist.busy}
      history={assist.history}
      placeholder={t('ai.placeholder')}
      idleHint={value.trim() ? t('ai.idleRefine') : t('ai.idleFresh')}
      busyHint={t('ai.writing')}
      sendLabel={t('ai.send')}
      quickActions={[
        {
          label: t('ai.draftReply'),
          run: () => assist.run(undefined, t('ai.draftReply'), { fresh: true }),
        },
        {
          label: t('ai.shorter'),
          run: () => assist.run('Deutlich kürzer formulieren.', t('ai.shorter')),
        },
        {
          label: t('ai.thankful'),
          run: () => assist.run('Dankbarer und wertschätzender formulieren.', t('ai.thankful')),
        },
      ]}
      onSend={(instruction) => assist.run(instruction, instruction)}
    />
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
  aiAssist,
  t,
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
  aiAssist?: { companySlug: CompanySlug; reviewId: number };
  t: ReturnType<typeof useT>;
}) {
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className={cn(aiAssist && 'max-w-lg')}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed !== '') onSubmit(trimmed);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={textareaId}>{label}</Label>
            {aiAssist ? (
              <div className="overflow-hidden rounded-md border border-input bg-card shadow-xs transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
                <Textarea
                  id={textareaId}
                  rows={6}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  required
                  disabled={isPending}
                  className="block min-h-[120px] resize-none rounded-none border-0 leading-relaxed shadow-none focus-visible:ring-0"
                />
                <ReviewResponseAssistant
                  companySlug={aiAssist.companySlug}
                  reviewId={aiAssist.reviewId}
                  value={value}
                  setValue={setValue}
                  t={t}
                />
              </div>
            ) : (
              <Textarea
                id={textareaId}
                rows={5}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                disabled={isPending}
              />
            )}
          </div>
          {errorText ? <Alert tone="destructive">{errorText}</Alert> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {cancelLabel}
              </Button>
            </DialogClose>
            <Button type="submit" loading={isPending} disabled={trimmed === ''}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
