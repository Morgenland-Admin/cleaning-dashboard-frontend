import { useCallback, useEffect, useState } from 'react';

import { pushAdminApi } from '@/lib/api';

export type PushState =
  | 'unsupported'
  | 'needs-install'
  | 'denied'
  | 'default'
  | 'ready'
  | 'subscribed';

export interface UsePushResult {
  state: PushState;
  isBusy: boolean;
  isConfigured: boolean | null;
  error: string | null;
  endpoint: string | null;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  sendTest: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS uses navigator.standalone; others use display-mode media query.
  const navStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  if (navStandalone) return true;
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

function browserSupportsPush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const cleaned = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(cleaned);
  const out = new ArrayBuffer(raw.length);
  const view = new Uint8Array(out);
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i);
  return out;
}

export function usePush(): UsePushResult {
  const [state, setState] = useState<PushState>('default');
  const [isBusy, setIsBusy] = useState(false);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compute = useCallback(async () => {
    if (!browserSupportsPush()) {
      // iOS Safari outside PWA lacks PushManager — show "Add to Home Screen" guidance.
      setState(isIos() && !isStandalonePwa() ? 'needs-install' : 'unsupported');
      return;
    }
    const perm = Notification.permission;
    if (perm === 'denied') {
      setState('denied');
      return;
    }
    if (perm === 'default') {
      setState('default');
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      setEndpoint(sub.endpoint);
      setState('subscribed');
    } else {
      setEndpoint(null);
      setState('ready');
    }
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const status = await pushAdminApi.status();
      setIsConfigured(status.configured);
    } catch {
      // status is non-critical for UI rendering
    }
    await compute();
  }, [compute]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    setError(null);
    setIsBusy(true);
    try {
      if (!browserSupportsPush()) {
        throw new Error(
          isIos() && !isStandalonePwa()
            ? 'Bitte zuerst zum Home-Bildschirm hinzufügen, dann erneut versuchen.'
            : 'Push wird in diesem Browser nicht unterstützt.',
        );
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        await compute();
        return;
      }
      const { publicKey } = await pushAdminApi.vapidKey();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(publicKey),
      });
      const json = sub.toJSON();
      await pushAdminApi.subscribe({
        endpoint: sub.endpoint,
        keys: {
          p256dh: json.keys?.p256dh ?? '',
          auth: json.keys?.auth ?? '',
        },
        userAgent: navigator.userAgent,
      });
      setEndpoint(sub.endpoint);
      setState('subscribed');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  }, [compute]);

  const disable = useCallback(async () => {
    setError(null);
    setIsBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await pushAdminApi.unsubscribe(sub.endpoint).catch(() => null);
        await sub.unsubscribe();
      }
      setEndpoint(null);
      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    setError(null);
    setIsBusy(true);
    try {
      await pushAdminApi.test();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  }, []);

  return {
    state,
    isBusy,
    isConfigured,
    error,
    endpoint,
    enable,
    disable,
    sendTest,
    refresh,
  };
}
