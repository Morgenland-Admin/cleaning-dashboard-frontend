import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Loader2,
  Pencil,
  Trash2,
  Undo2,
  User,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { BlogImageDialog } from '@/components/blog-image-dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeading } from '@/components/page-heading';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import { ApiError, seoPagesAdminApi, type SeoPageStatus } from '@/lib/api';
import {
  articleMeta,
  featuredImageUrl,
  postSlug,
  siteThemeClass,
  STATUS_KEY,
  STATUS_TONE,
} from '@/lib/blog-utils';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';

// Same storefront typefaces as the editor, so the body reads like the live site.
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/dm-sans/wght-italic.css';
import '@fontsource-variable/lora';
import '@fontsource-variable/lora/wght-italic.css';

export function BlogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const numericId = Number(id);
  const { activeProject } = useProject();
  const slug = activeProject.companySlug;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const t = useT();
  const { bcp47 } = useLocale();

  const [imageOpen, setImageOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['blog-page', slug, numericId] as const,
    enabled: Number.isFinite(numericId),
    queryFn: ({ signal }) => seoPagesAdminApi.get(slug, numericId, signal),
  });

  const post = detailQuery.data?.page ?? null;
  usePageTitle(post?.title ?? t('blog.title'));

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['blog-page', slug, numericId] });
    void queryClient.invalidateQueries({ queryKey: ['blog-pages', slug] });
  };

  const statusMutation = useMutation({
    mutationFn: (status: SeoPageStatus) => seoPagesAdminApi.update(slug, numericId, { status }),
    onSuccess: (_data, status) => {
      invalidate();
      toast.success(status === 'live' ? t('blog.publishedToast') : t('blog.unpublishedToast'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => seoPagesAdminApi.remove(slug, numericId),
    onSuccess: () => {
      toast.success(t('blog.deletedToast'));
      void queryClient.invalidateQueries({ queryKey: ['blog-pages', slug] });
      navigate('/blog');
    },
    onError: () => setDeleteOpen(false),
  });

  const backLink = (
    <Link
      to="/blog"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('blog.backToList')}
    </Link>
  );

  if (detailQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        {backLink}
        <div className="mt-4 flex flex-col gap-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="aspect-[1200/630] w-full rounded-xl" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    );
  }

  if (detailQuery.error || !post) {
    const msg =
      detailQuery.error instanceof ApiError ? detailQuery.error.message : t('blog.notFound');
    return (
      <div className="mx-auto w-full max-w-3xl">
        {backLink}
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{msg}</span>
        </div>
      </div>
    );
  }

  const image = featuredImageUrl(post);
  const isLive = post.status === 'live' || post.status === 'protected';
  const meta = articleMeta(post);
  const viewUrl = activeProject.domain ? `https://${activeProject.domain}/${post.path}` : null;
  const busy = statusMutation.isPending;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {backLink}

      <PageHeading
        className="mt-3"
        title={post.title ?? postSlug(post.path)}
        subtitle={`/${post.path}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11" asChild>
              <Link to={`/blog/${post.id}/edit`}>
                <Pencil className="size-4" aria-hidden="true" />
                {t('common.edit')}
              </Link>
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setImageOpen(true)}>
              <ImagePlus className="size-4" aria-hidden="true" />
              {image ? t('blog.replaceImage') : t('blog.uploadImage')}
            </Button>
            {isLive ? (
              <Button
                variant="outline"
                className="h-11"
                onClick={() => statusMutation.mutate('draft')}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Undo2 className="size-4" aria-hidden="true" />
                )}
                {t('blog.unpublish')}
              </Button>
            ) : (
              <Button
                className="h-11"
                onClick={() => statusMutation.mutate('live')}
                disabled={busy || !image}
                title={!image ? t('blog.needImageBeforePublish') : undefined}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                )}
                {t('blog.publish')}
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <StatusBadge label={t(STATUS_KEY[post.status])} tone={STATUS_TONE[post.status]} />
          {meta.author ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <User className="size-4" aria-hidden="true" />
              {meta.author}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden="true" />
            {formatDateTime(meta.datePublished ?? post.updatedAt, bcp47)}
          </span>
          {viewUrl ? (
            <a
              href={viewUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {t('blog.viewOnSite')}
            </a>
          ) : null}
        </div>

        <div className="relative aspect-[1200/630] w-full overflow-hidden rounded-xl border border-border bg-muted">
          {image ? (
            <img src={image} alt={post.title ?? ''} className="size-full object-cover" />
          ) : (
            <button
              type="button"
              onClick={() => setImageOpen(true)}
              className="flex size-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <ImagePlus className="size-7" aria-hidden="true" />
              {t('blog.uploadImage')}
            </button>
          )}
        </div>

        {/* SEO snippet preview */}
        <Card>
          <CardContent className="flex flex-col gap-1 p-4 sm:p-6">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('blog.searchPreview')}
            </span>
            {/* Deliberately off-palette: this block previews how the page looks
                in Google's result list, so it uses Google's own link/URL colours
                rather than the app's tokens. */}
            <p className="truncate text-base font-medium text-[#1a0dab] dark:text-blue-400">
              {post.metaTitle ?? post.title ?? postSlug(post.path)}
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-500">
              {activeProject.domain}/{post.path}
            </p>
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {post.metaDescription ?? t('blog.noMetaDescription')}
            </p>
          </CardContent>
        </Card>

        {/* Article body, in the storefront's look (see .site-theme-* in index.css). */}
        <div
          className={cn(
            'blog-canvas overflow-hidden rounded-xl border border-border p-4 shadow-sm sm:p-8',
            siteThemeClass(slug),
          )}
        >
          {post.bodyHtml ? (
            <div
              className="blog-editor-content blog-preview"
              dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
            />
          ) : (
            <p className="text-sm">{t('blog.noBody')}</p>
          )}
        </div>

        {/* FAQ */}
        {post.faq.length > 0 ? (
          <Card>
            <CardContent className="p-4 sm:p-6">
              <h2 className="text-lg font-semibold">{t('blog.faqHeading')}</h2>
              <dl className="mt-4 divide-y divide-border/60">
                {post.faq.map((f, i) => (
                  <div key={i} className="py-3">
                    <dt className="font-medium">{f.question}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {f.answer}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ) : null}

        <div className="flex justify-end">
          <Button
            variant="outline"
            className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {t('blog.deleteAction')}
          </Button>
        </div>
      </div>

      <BlogImageDialog
        key={`img-${imageOpen}`}
        open={imageOpen}
        onOpenChange={setImageOpen}
        companySlug={slug}
        post={post}
        onSuccess={invalidate}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('blog.deleteAction')}
        description={t('blog.confirmDelete')}
        confirmLabel={t('blog.deleteAction')}
        cancelLabel={t('common.cancel')}
        isDangerous
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
