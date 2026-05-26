import { useEffect, useRef } from 'react';

import type { ChatMessage } from '@/lib/api';

// Mirrors the backend hub's discriminated union — kept inline for FE/BE decoupling.
export type ChatSocketEvent =
  | { type: 'hello'; slug: string; partnerUserId: string; role: 'admin' | 'partner' }
  | { type: 'message'; conversationId: number; message: ChatMessage }
  | { type: 'typing'; conversationId: number; from: 'admin' | 'partner'; isTyping: boolean }
  | { type: 'read'; conversationId: number; by: 'admin' | 'partner'; readAt: string };

interface Options {
  baseUrl: string;
  slug: string;
  partnerUserId: string;
  onEvent: (event: ChatSocketEvent) => void;
  onStatusChange?: (status: 'connecting' | 'open' | 'closed') => void;
  enabled?: boolean;
}

export function useChatSocket({
  baseUrl,
  slug,
  partnerUserId,
  onEvent,
  onStatusChange,
  enabled = true,
}: Options) {
  // Callbacks in refs so re-renders don't tear down the socket.
  const eventRef = useRef(onEvent);
  const statusRef = useRef(onStatusChange);
  eventRef.current = onEvent;
  statusRef.current = onStatusChange;

  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled || !slug || !partnerUserId) return;

    // Exponential backoff capped at 30s; reset on clean OPEN.
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      statusRef.current?.('connecting');
      const wsBase = baseUrl.replace(/^http/, 'ws').replace(/\/$/, '');
      const url = `${wsBase}/ws/chat?slug=${encodeURIComponent(slug)}&partnerUserId=${encodeURIComponent(partnerUserId)}`;
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.addEventListener('open', () => {
        attempt = 0;
        statusRef.current?.('open');
      });
      ws.addEventListener('message', (msg) => {
        try {
          const evt = JSON.parse(msg.data) as ChatSocketEvent;
          eventRef.current(evt);
        } catch {
          // Non-JSON frame — drop. Server only sends JSON.
        }
      });
      ws.addEventListener('close', () => {
        statusRef.current?.('closed');
        socketRef.current = null;
        if (cancelled) return;
        const delay = Math.min(30_000, 500 * 2 ** attempt);
        attempt++;
        timer = setTimeout(connect, delay);
      });
      ws.addEventListener('error', () => {
        // close handler will fire next and own the retry.
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      });
    }

    connect();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      const ws = socketRef.current;
      socketRef.current = null;
      if (ws && ws.readyState === ws.OPEN) ws.close(1000, 'unmount');
    };
  }, [enabled, baseUrl, slug, partnerUserId]);

  function sendTyping(isTyping: boolean) {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== ws.OPEN) return;
    try {
      ws.send(JSON.stringify({ type: 'typing', isTyping }));
    } catch {
      /* ignore */
    }
  }

  return { sendTyping };
}
