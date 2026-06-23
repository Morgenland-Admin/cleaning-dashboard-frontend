import * as React from 'react';

import type { ToastProps } from '@/components/ui/toast';

// Lightweight module-level toast store (shadcn pattern): a reducer + listeners
// so any component can call `toast(...)` without prop-drilling a provider.

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 6000;

// Omit the HTML global `title` attribute (string) inherited from the Radix
// Toast.Root element props — it collides with our richer ReactNode `title`.
type ToasterToast = Omit<ToastProps, 'title'> & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
};

type Action =
  | { type: 'ADD'; toast: ToasterToast }
  | { type: 'DISMISS'; toastId?: string }
  | { type: 'REMOVE'; toastId?: string };

interface State {
  toasts: ToasterToast[];
}

let count = 0;
function genId(): string {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return String(count);
}

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };
const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD':
      return { toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) };
    case 'DISMISS':
      return {
        toasts: state.toasts.map((t) =>
          action.toastId === undefined || t.id === action.toastId ? { ...t, open: false } : t,
        ),
      };
    case 'REMOVE':
      return { toasts: state.toasts.filter((t) => t.id !== action.toastId) };
    default:
      return state;
  }
}

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  for (const l of listeners) l(memoryState);
}

function scheduleRemove(toastId: string) {
  if (timeouts.has(toastId)) return;
  const t = setTimeout(() => {
    timeouts.delete(toastId);
    dispatch({ type: 'REMOVE', toastId });
  }, TOAST_REMOVE_DELAY);
  timeouts.set(toastId, t);
}

export interface ToastOptions {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastProps['variant'];
  duration?: number;
}

export function toast(opts: ToastOptions) {
  const id = genId();
  dispatch({
    type: 'ADD',
    toast: {
      ...opts,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) {
          dispatch({ type: 'DISMISS', toastId: id });
          scheduleRemove(id);
        }
      },
    },
  });
  scheduleRemove(id);
  return id;
}

/** Convenience helpers for the two most common cases. */
toast.error = (description: React.ReactNode, title: React.ReactNode = 'Fehler') =>
  toast({ title, description, variant: 'destructive' });
toast.success = (description: React.ReactNode, title?: React.ReactNode) =>
  toast({ title, description, variant: 'success' });

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState);
  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const i = listeners.indexOf(setState);
      if (i > -1) listeners.splice(i, 1);
    };
  }, []);
  return {
    toasts: state.toasts,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS', toastId }),
  };
}
