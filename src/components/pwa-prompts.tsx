import { Bell, Check, Download, Share, SquarePlus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useT } from '@/i18n';
import { isIos, isStandalonePwa, usePush } from '@/lib/use-push';
import { cn } from '@/lib/utils';

const INSTALL_SNOOZE_KEY = 'rp-pwa-install-snooze';
const PUSH_SNOOZE_KEY = 'rp-pwa-push-snooze';
const SNOOZE_DAYS = 14;
/** Don't flash a banner during the first seconds after login. */
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
    // storage unavailable (private mode) — banner just reappears next session
  }
}

/**
 * Bottom banner pair for the PWA experience:
 *  1. Install prompt — native beforeinstallprompt on Android/desktop, an
 *     "Add to Home Screen" guide on iOS Safari.
 *  2. Push nudge — one-tap notification opt-in once installable/installed.
 * One banner at a time, snoozed for 14 days on dismissal.
 */
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
    // iOS: no programmatic install — show the Add-to-Home-Screen guide.
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
        <SheetContent
          side="right"
          className="bg-card pb-[max(1.5rem,env(safe-area-inset-bottom))] text-foreground"
        >
          <div className="flex flex-col gap-1.5 text-left">
            <SheetTitle className="not-sr-only font-serif text-lg">{t('pwa.iosTitle')}</SheetTitle>
            <SheetDescription>{t('pwa.iosIntro')}</SheetDescription>
          </div>
          <ol className="mt-4 space-y-3">
            <IosStep n={1} icon={<Share className="size-4" aria-hidden="true" />}>
              {t('pwa.iosStep1')}
            </IosStep>
            <IosStep n={2} icon={<SquarePlus className="size-4" aria-hidden="true" />}>
              {t('pwa.iosStep2')}
            </IosStep>
            <IosStep n={3} icon={<Download className="size-4" aria-hidden="true" />}>
              {t('pwa.iosStep3')}
            </IosStep>
          </ol>
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
  icon: React.ReactNode;
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
        'fixed inset-x-3 z-40 mx-auto max-w-md rounded-2xl border bg-card p-4 shadow-lg',
        'bottom-[calc(4.25rem+env(safe-area-inset-bottom))] lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0',
        'duration-300 animate-in fade-in slide-in-from-bottom-4 motion-reduce:animate-none',
        tone === 'success' ? 'border-emerald-600/30' : 'border-border',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl',
            tone === 'success' ? 'bg-emerald-600/10 text-emerald-700' : 'bg-rust-soft/60 text-rust',
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {body ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          {actionLabel ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" className="h-9 px-4" onClick={onAction} disabled={busy}>
                {actionLabel}
              </Button>
              {laterLabel ? (
                <Button size="sm" variant="ghost" className="h-9 px-3" onClick={onLater}>
                  {laterLabel}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {dismissLabel && onLater ? (
          <button
            type="button"
            aria-label={dismissLabel}
            onClick={onLater}
            className="-m-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </section>
  );
}

function IosStep({
  n,
  icon,
  children,
}: {
  n: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 text-sm text-foreground">
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-rust-soft/60 font-mono text-xs font-semibold text-rust">
        {n}
      </span>
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}
