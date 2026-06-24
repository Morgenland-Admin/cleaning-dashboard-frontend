import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Loader2, Save } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import { errMessage, seoPagesAdminApi, type SeoPageRow } from '@/lib/api';
import { cn } from '@/lib/utils';

import type { CompanySlug } from '@/contexts/project-context';

// Soft SEO targets — over these we warn (amber) but never block saving.
const META_TITLE_REC = 60;
const META_DESC_REC = 160;

export function BlogEditDialog({
  open,
  onOpenChange,
  companySlug,
  post,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companySlug: CompanySlug;
  post: SeoPageRow | null;
  onSuccess: () => void;
}) {
  const t = useT();
  // Initialised from props; call sites remount via `key` on each open so these
  // re-seed from the latest post (matches the dialog convention elsewhere).
  const [title, setTitle] = useState(post?.title ?? '');
  const [h1, setH1] = useState(post?.h1 ?? '');
  const [metaTitle, setMetaTitle] = useState(post?.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(post?.metaDescription ?? '');
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: () =>
      seoPagesAdminApi.update(companySlug, post!.id, {
        title: title.trim(),
        h1: h1.trim(),
        metaTitle: metaTitle.trim(),
        metaDescription: metaDescription.trim(),
      }),
    onSuccess: () => {
      toast.success(t('blog.saved'));
      onSuccess();
      onOpenChange(false);
    },
    onError: (err) => setError(errMessage(err)),
  });

  const busy = saveMutation.isPending;
  const canSave = title.trim().length > 0 && !busy;

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? null : onOpenChange(o))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('blog.editTitle')}</DialogTitle>
          <DialogDescription>{t('blog.editSubtitle')}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) saveMutation.mutate();
          }}
        >
          <Field
            id="blog-edit-title"
            label={t('blog.fieldTitle')}
            required
            value={title}
            onChange={setTitle}
            disabled={busy}
          />
          <Field
            id="blog-edit-h1"
            label={t('blog.fieldH1')}
            value={h1}
            onChange={setH1}
            disabled={busy}
            hint={t('blog.fieldH1Hint')}
          />
          <Field
            id="blog-edit-meta-title"
            label={t('blog.fieldMetaTitle')}
            value={metaTitle}
            onChange={setMetaTitle}
            disabled={busy}
            counter={{ current: metaTitle.length, rec: META_TITLE_REC }}
          />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="blog-edit-meta-desc">{t('blog.fieldMetaDescription')}</Label>
              <CounterBadge current={metaDescription.length} rec={META_DESC_REC} />
            </div>
            <Textarea
              id="blog-edit-meta-desc"
              rows={3}
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              disabled={busy}
            />
          </div>

          {error ? (
            <p
              role="alert"
              aria-live="assertive"
              className="flex items-start gap-1.5 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="h-11" disabled={!canSave}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  disabled,
  required,
  hint,
  counter,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  required?: boolean;
  hint?: string;
  counter?: { current: number; rec: number };
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </Label>
        {counter ? <CounterBadge current={counter.current} rec={counter.rec} /> : null}
      </div>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function CounterBadge({ current, rec }: { current: number; rec: number }) {
  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        current > rec ? 'text-amber-600' : 'text-muted-foreground',
      )}
    >
      {current}/{rec}
    </span>
  );
}
