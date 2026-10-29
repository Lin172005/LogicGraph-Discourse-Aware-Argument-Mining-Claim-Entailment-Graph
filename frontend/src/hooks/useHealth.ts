import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '@/lib/api';
import type { HealthResponse } from '@/lib/types';

export type HealthState = 'ok' | 'down' | 'checking';

export function useHealth(pollMs = 30000) {
  const [status, setStatus] = useState<HealthState>('checking');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const check = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setStatus('checking');
    try {
      const data = await apiGet<HealthResponse>('/health', ac.signal);
      setHealth(data);
      setStatus(data?.status === 'ok' ? 'ok' : 'down');
      setLastChecked(Date.now());
    } catch {
      setHealth(null);
      setStatus('down');
      setLastChecked(Date.now());
    }
  }, []);

  useEffect(() => {
    check();
    const t = setInterval(check, pollMs);
    return () => {
      clearInterval(t);
      abortRef.current?.abort();
    };
  }, [check, pollMs]);

  return { status, health, lastChecked, check };
}
