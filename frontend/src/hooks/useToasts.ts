import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastVariant = 'info' | 'success' | 'error';
export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant = 'info', duration = 3800) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, variant }]);
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  return { toasts, push, dismiss };
}

export type ToastPush = ReturnType<typeof useToasts>['push'];
