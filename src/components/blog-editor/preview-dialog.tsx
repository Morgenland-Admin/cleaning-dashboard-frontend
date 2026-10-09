import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  Monitor,
  Plus,
  Smartphone,
  User,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

export interface PreviewData {
  title: string;
  description: string;
  author: string;
  date: string | null;
  image: string | null;
  html: string;
  faq: Array<{ question: string; answer: string }>;
  readingMinutes: number;
  url: string;
}

/**
 * Full-screen reproduction of the storefront article page (hero → image card →
 * body → FAQ), in the brand's own theme when it has one. The copy inside the
 * page is the storefront's (German), on purpose — this is what visitors see.
 * Content is the editor's schema-restricted HTML; the backend sanitises again.
 */
export function PreviewDialog({
  open,
  onOpenChange,
  data,
  themeClass,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PreviewData;
  themeClass: string | null;
}) {
  const t = useT();
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const mobile = device === 'mobile';
  const date = data.date
    ? new Date(data.date.length === 10 ? `${data.date}T12:00:00` : data.date)
    : null;
  const dateLabel =
    date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' })
      : null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col bg-muted focus:outline-none sm:inset-4 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-border sm:shadow-2xl"
          aria-describedby={undefined}
        >
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-3 sm:px-4">
            <DialogPrimitive.Title className="truncate text-sm font-semibold">
              {t('blogEditor.preview')}
            </DialogPrimitive.Title>
            <span className="hidden min-w-0 truncate rounded-md bg-muted px-2 py-1 font-mono text-2xs text-muted-foreground md:inline">
              {data.url}
            </span>
            <div
              role="group"
              aria-label={t('blogEditor.previewDevice')}
              className="ml-auto hidden rounded-lg border border-border bg-muted/60 p-0.5 sm:inline-flex"
            >
              {(['desktop', 'mobile'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={device === d}
                  aria-label={d === 'desktop' ? t('blogEditor.desktop') : t('blogEditor.mobile')}
                  onClick={() => setDevice(d)}
                  className={cn(
                    'inline-flex h-7 w-9 items-center justify-center rounded-md transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    device === d
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {d === 'desktop' ? (
                    <Monitor className="size-4" aria-hidden="true" />
                  ) : (
                    <Smartphone className="size-4" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
            <DialogPrimitive.Close
              className="ml-auto inline-flex size-9 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:ml-0"
              aria-label={t('common.close')}
            >
              <X className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto sm:p-6">
            <div
              className={cn(
                'blog-canvas mx-auto overflow-hidden transition-[max-width] duration-300 sm:rounded-xl sm:border sm:border-border sm:shadow-sm',
                themeClass,
                mobile ? 'max-w-[390px]' : 'max-w-6xl',
              )}
            >
              <section className="site-preview-hero">
                <span
                  aria-hidden="true"
                  className="site-preview-blob -right-32 -top-40 size-96 bg-parchment/10"
                />
                <span
                  aria-hidden="true"
                  className="site-preview-blob -bottom-40 -left-32 size-80 bg-parchment/10"
                />
                <div
                  className={cn(
                    'relative mx-auto max-w-6xl',
                    mobile ? 'px-5 pb-28 pt-12' : 'px-6 pb-32 pt-16 lg:pt-20',
                  )}
                >
                  <nav
                    aria-label="Brotkrumen"
                    className="mb-5 text-sm uppercase tracking-wider opacity-80"
                  >
                    <ol className="flex flex-wrap items-center gap-2">
                      <li>Home</li>
                      <li aria-hidden="true" className="opacity-60">
                        /
                      </li>
                      <li>Blog</li>
                      <li aria-hidden="true" className="opacity-60">
                        /
                      </li>
                      <li className="line-clamp-1">{data.title}</li>
                    </ol>
                  </nav>
                  <h1
                    className={cn(
                      'site-preview-title text-balance font-bold tracking-tight',
                      mobile ? 'text-3xl' : 'text-4xl lg:text-5xl',
                    )}
                  >
                    {data.title || t('blogEditor.untitled')}
                  </h1>
                  <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm opacity-80">
                    {dateLabel ? (
                      <span className="inline-flex items-center gap-2">
                        <Calendar className="size-4" aria-hidden="true" />
                        {dateLabel}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-2">
                      <User className="size-4" aria-hidden="true" />
                      {data.author}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Clock className="size-4" aria-hidden="true" />
                      {data.readingMinutes} Min. Lesezeit
                    </span>
                  </div>
                  {data.description ? (
                    <p
                      className={cn(
                        'mt-6 max-w-3xl text-pretty opacity-90',
                        mobile ? 'text-base' : 'text-lg',
                      )}
                    >
                      {data.description}
                    </p>
                  ) : null}
                </div>
                <svg
                  aria-hidden="true"
                  className="site-preview-wave absolute bottom-0 left-0 block h-12 w-full md:h-16"
                  viewBox="0 0 1440 80"
                  preserveAspectRatio="none"
                >
                  <path
                    fill="currentColor"
                    d="M0,80 C240,40 480,20 720,28 C960,36 1200,72 1440,56 L1440,80 L0,80 Z"
                  />
                </svg>
              </section>

              <section className={cn('mx-auto max-w-6xl', mobile ? 'px-5 py-12' : 'px-6 py-16')}>
                {data.image ? (
                  <figure
                    className={cn(
                      'site-preview-image mb-12 overflow-hidden rounded-3xl',
                      mobile ? '-mt-28' : '-mt-32 lg:-mt-40',
                    )}
                  >
                    <img
                      src={data.image}
                      alt={data.title}
                      className="aspect-video w-full object-cover"
                    />
                  </figure>
                ) : null}
                <div
                  className="blog-editor-content blog-preview"
                  dangerouslySetInnerHTML={{ __html: data.html }}
                />
                <div className="site-preview-border mt-12 flex flex-wrap items-center justify-between gap-4 border-t pt-8">
                  <span className="site-preview-link inline-flex items-center gap-2 text-sm font-semibold">
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Zur Blog-Übersicht
                  </span>
                  <span className="site-preview-button inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium shadow-md">
                    Beratung anfragen
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </span>
                </div>
              </section>

              {data.faq.length > 0 ? (
                <section className={cn('mx-auto max-w-3xl pb-16', mobile ? 'px-5' : 'px-6')}>
                  <div className="text-center">
                    <p className="site-preview-muted text-xs font-semibold uppercase tracking-[0.18em]">
                      FAQ
                    </p>
                    <h2 className="site-preview-title mt-3 text-3xl font-bold tracking-tight">
                      Häufige Fragen.
                    </h2>
                  </div>
                  <ul className="site-preview-border mt-10 border-t">
                    {data.faq.map((f, i) => {
                      const isOpen = openFaq === i;
                      return (
                        <li key={i} className="site-preview-border border-b">
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            onClick={() => setOpenFaq(isOpen ? null : i)}
                            className="flex w-full items-center justify-between gap-4 py-5 text-left text-base font-semibold tracking-tight"
                          >
                            <span className="flex-1">{f.question}</span>
                            <span
                              aria-hidden="true"
                              className={cn(
                                'site-preview-border grid size-7 shrink-0 place-items-center rounded-full border transition-transform',
                                isOpen ? 'site-preview-button rotate-45' : 'site-preview-link',
                              )}
                            >
                              <Plus className="size-4" strokeWidth={2.4} />
                            </span>
                          </button>
                          {isOpen ? (
                            <p className="site-preview-muted max-w-prose pb-5 text-base leading-relaxed">
                              {f.answer}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
            </div>
            <p className="mx-auto mt-3 max-w-4xl px-4 pb-6 text-center text-xs text-muted-foreground sm:px-0">
              {t('blogEditor.previewNote')}
            </p>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
