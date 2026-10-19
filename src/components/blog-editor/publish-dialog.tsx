import { CheckCircle2, EyeOff, Globe, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '@/i18n';

import { IssueList } from './seo-panel';

import type { SeoIssue } from '@/lib/blog-seo';

/** Pre-publish check: errors block with a fix per item; warnings are summarised, never blocking. */
export function PublishDialog({
  open,
  onOpenChange,
  issues,
  url,
  dateLabel,
  noindex,
  publishing,
  onPublish,
  onFix,
  onReview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issues: SeoIssue[];
  url: string | null;
  dateLabel: string | null;
  noindex: boolean;
  publishing: boolean;
  onPublish: () => void;
  onFix: (issue: SeoIssue) => void;
  onReview: () => void;
}) {
  const t = useT();
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning').length;
  const suggestions = issues.filter((i) => i.level === 'suggestion').length;

  return (
    <Dialog open={open} onOpenChange={(o) => (publishing ? null : onOpenChange(o))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {errors.length > 0 ? t('blogPublish.blockedTitle') : t('blogPublish.title')}
          </DialogTitle>
          <DialogDescription>
            {errors.length > 0
              ? t('blogPublish.blockedHint', { n: errors.length })
              : t('blogPublish.hint')}
          </DialogDescription>
        </DialogHeader>

        {errors.length > 0 ? (
          <IssueList issues={errors} onFix={onFix} levels={['error']} />
        ) : (
          <div className="flex flex-col gap-3 text-2sm">
            <p className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              {t('blogPublish.ready')}
            </p>
            {url ? (
              <p className="flex items-start gap-2">
                <Globe
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 break-all">
                  {t('blogPublish.liveAt')} <span className="font-medium">{url}</span>
                </span>
              </p>
            ) : null}
            <p className="text-muted-foreground">
              {dateLabel
                ? t('blogPublish.dateSet', { date: dateLabel })
                : t('blogPublish.dateToday')}
            </p>
            {noindex ? (
              <p className="flex items-start gap-2 text-warning">
                <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t('blogPublish.noindex')}
              </p>
            ) : null}
            {warnings + suggestions > 0 ? (
              <p className="text-muted-foreground">
                {t('blogPublish.advice', { w: warnings, s: suggestions })}{' '}
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-2sm sm:h-auto"
                  onClick={onReview}
                >
                  {t('blogPublish.review')}
                </Button>
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={publishing}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={onPublish}
            disabled={errors.length > 0}
            loading={publishing}
          >
            <Send aria-hidden="true" />
            {t('blog.publish')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
