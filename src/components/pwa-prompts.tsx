import { Bell, Check, Download, Share, SquarePlus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useT } from '@/i18n';
import { isIos, isStandalonePwa, usePush } from '@/lib/use-push';
import { cn } from '@/lib/utils';

const INSTALL_SNOOZE_KEY = 'rp-pwa-install-snooze';
const PUSH_SNOOZE_KEY = 'rp-pwa-push-snooze';
const SNOOZE_DAYS = 14;
const SHOW_DELAY_MS = 6_000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isSnoozed(key: string): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    return Date.now() - Number(raw) < SNOOZE_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

function snooze(key: string) {
  try {
    window.localStorage.setItem(key, String(Date.now()));
  } catch {
    // Private mode: storage is unavailable, the banner just reappears next session.
  }
}

/** Install prompt plus push nudge; one banner at a time, snoozed 14 days on dismissal. */
export function PwaPrompts() {
  const t = useT();
  const push = usePush();
  const [delayDone, setDelayDone] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installSnoozed, setInstallSnoozed] = useState(() => isSnoozed(INSTALL_SNOOZE_KEY));
  const [pushSnoozed, setPushSnoozed] = useState(() => isSnoozed(PUSH_SNOOZE_KEY));
  const [iosGuideOpen, setIosGuideOpen] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDelayDone(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const standalone = isStandalonePwa();
  const showInstall =
    delayDone && !standalone && !installSnoozed && (installEvent !== null || isIos());
  const showPush =
    delayDone &&
    !showInstall &&
    !pushSnoozed &&
    push.isConfigured !== false &&
    (push.state === 'ready' || push.state === 'default' || justEnabled);

  const onInstall = useCallback(async () => {
    if (installEvent) {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      setInstallEvent(null);
      if (choice.outcome === 'dismissed') {
        snooze(INSTALL_SNOOZE_KEY);
        setInstallSnoozed(true);
      }
      return;
    }
    // iOS has no programmatic install: show the Add-to-Home-Screen guide.
    setIosGuideOpen(true);
  }, [installEvent]);

  const onInstallLater = useCallback(() => {
    snooze(INSTALL_SNOOZE_KEY);
    setInstallSnoozed(true);
  }, []);

  const onEnablePush = useCallback(async () => {
    await push.enable();
    setJustEnabled(true);
    hideTimer.current = setTimeout(() => {
      setJustEnabled(false);
      snooze(PUSH_SNOOZE_KEY);
      setPushSnoozed(true);
    }, 4_000);
  }, [push]);

  const onPushLater = useCallback(() => {
    snooze(PUSH_SNOOZE_KEY);
    setPushSnoozed(true);
  }, []);

  if (!showInstall && !showPush) return null;

  return (
    <>
      {showInstall ? (
        <Banner
          icon={<Download className="size-5" aria-hidden="true" />}
          title={t('pwa.installTitle')}
          body={t('pwa.installBody')}
          actionLabel={t('pwa.installAction')}
          laterLabel={t('pwa.installLater')}
          dismissLabel={t('pwa.installDismiss')}
          onAction={() => void onInstall()}
          onLater={onInstallLater}
        />
      ) : showPush && (push.state === 'subscribed' || justEnabled) ? (
        <Banner
          tone="success"
          icon={<Check className="size-5" aria-hidden="true" />}
          title={t('pwa.pushDone')}
        />
      ) : showPush ? (
        <Banner
          icon={<Bell className="size-5" aria-hidden="true" />}
          title={t('pwa.pushTitle')}
          body={t('pwa.pushBody')}
          actionLabel={t('pwa.pushAction')}
          laterLabel={t('pwa.pushLater')}
          dismissLabel={t('pwa.installDismiss')}
          onAction={() => void onEnablePush()}
          onLater={onPushLater}
          busy={push.isBusy}
          error={push.error}
        />
      ) : null}

      <Sheet open={iosGuideOpen} onOpenChange={setIosGuideOpen}>
        <SheetContent side="right" variant="content" className="sm:max-w-sm">
          {/* SheetTitle/Description name the dialog (sr-only); the visible copy repeats them. */}
          <SheetTitle>{t('pwa.iosTitle')}</SheetTitle>
          <SheetDescription>{t('pwa.iosIntro')}</SheetDescription>
          <div className="flex flex-col gap-1 pr-10 text-left" aria-hidden="true">
            <p className="text-base font-semibold text-foreground">{t('pwa.iosTitle')}</p>
            <p className="text-2sm text-muted-foreground">{t('pwa.iosIntro')}</p>
          </div>
          <IosInstallSteps
            className="mt-2"
            steps={[t('pwa.iosStep1'), t('pwa.iosStep2'), t('pwa.iosStep3')]}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

function Banner({
  icon,
  title,
  body,
  actionLabel,
  laterLabel,
  dismissLabel,
  onAction,
  onLater,
  busy,
  error,
  tone = 'default',
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  actionLabel?: string;
  laterLabel?: string;
  dismissLabel?: string;
  onAction?: () => void;
  onLater?: () => void;
  busy?: boolean;
  error?: string | null;
  tone?: 'default' | 'success';
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        'fixed inset-x-3 z-40 mx-auto max-w-md rounded-xl border bg-card p-4 shadow-lg',
        'bottom-[calc(4.25rem+env(safe-area-inset-bottom))] lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0',
        'duration-base animate-in fade-in slide-in-from-bottom-4 motion-reduce:animate-none',
        tone === 'success' ? 'border-success/30' : 'border-border',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md [&_svg]:size-5',
            tone === 'success' ? 'bg-success-soft text-success' : 'bg-primary-soft text-primary',
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {body ? <p className="mt-1 text-xs text-muted-foreground">{body}</p> : null}
          {error ? (
            <p role="alert" className="mt-1 text-xs font-medium text-destructive">
              {error}
            </p>
          ) : null}
          {actionLabel ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={onAction} loading={busy}>
                {actionLabel}
              </Button>
              {laterLabel ? (
                <Button size="sm" variant="ghost" onClick={onLater}>
                  {laterLabel}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {dismissLabel && onLater ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={dismissLabel}
            onClick={onLater}
            className="-m-1 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </section>
  );
}

const IOS_STEP_ICONS = [Share, SquarePlus, Download] as const;

export function IosInstallSteps({
  steps,
  className,
}: {
  steps: [ReactNode, ReactNode, ReactNode];
  className?: string;
}) {
  return (
    <ol className={cn('space-y-3', className)}>
      {steps.map((step, i) => {
        const Icon = IOS_STEP_ICONS[i];
        return (
          <li key={i} className="flex items-center gap-3 text-2sm text-foreground">
            <span
              aria-hidden="true"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold tabular-nums text-primary"
            >
              {i + 1}
            </span>
            <span
              aria-hidden="true"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
            >
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
