import { Activity, AlertTriangle, CheckCircle2, Loader2, Menu, RefreshCw, FlaskConical } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { HealthState } from '@/hooks/useHealth';
import type { HealthResponse } from '@/lib/types';
import { cn, isMockMode, setMockMode } from '@/lib/api';
import { Logo } from './Logo';

interface HeaderProps {
  status: HealthState;
  health: HealthResponse | null;
  lastChecked: number | null;
  onRefresh: () => void;
  onMenu: () => void;
}

export function Header({ status, health, lastChecked, onRefresh, onMenu }: HeaderProps) {
  const ok = status === 'ok';
  const checking = status === 'checking';
  const [mock, setMock] = useState(isMockMode());

  useEffect(() => {
    const handler = () => setMock(isMockMode());
    window.addEventListener('mock-mode-change', handler);
    return () => window.removeEventListener('mock-mode-change', handler);
  }, []);

  const toggleMock = () => {
    const next = !mock;
    setMockMode(next);
    setMock(next);
    // reload health + data by refreshing the page state via a custom event
    window.dispatchEvent(new Event('mock-toggled'));
    setTimeout(onRefresh, 0);
  };

  return (
    <header className="sticky top-0 z-20 px-4 sm:px-6 lg:px-8 pt-4">
      <div className="glass-strong rounded-2xl px-4 sm:px-5 py-3 flex items-center gap-3">
        <button
          className="lg:hidden p-2 -ml-1 rounded-lg text-ink-200 hover:bg-ink-700/60"
          onClick={onMenu}
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="lg:hidden">
          <Logo />
        </div>

        <div className="hidden lg:flex items-center gap-2 text-sm text-ink-300">
          <span className="text-ink-400">Engine</span>
          <span className="text-ink-500">/</span>
          <span className="text-ink-100 font-medium">LogicGraph API</span>
          <span className="text-ink-500">·</span>
          <code className="text-[11px] text-ink-400 font-mono">localhost:8000</code>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors',
              ok && 'bg-emerald-500/10 border-emerald-400/25 text-emerald-300',
              checking && 'bg-amber-500/10 border-amber-400/25 text-amber-300',
              !ok && !checking && 'bg-rose-500/10 border-rose-400/25 text-rose-300',
            )}
            title={lastChecked ? `Last checked ${new Date(lastChecked).toLocaleTimeString()}` : undefined}
          >
            <span className="relative flex h-2 w-2">
              {(ok || !checking) && (
                <span
                  className={cn(
                    'absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping',
                    ok ? 'bg-emerald-400' : 'bg-rose-400',
                  )}
                />
              )}
              <span
                className={cn(
                  'relative inline-flex rounded-full h-2 w-2',
                  ok && 'bg-emerald-400',
                  checking && 'bg-amber-400',
                  !ok && !checking && 'bg-rose-400',
                )}
              />
            </span>
            {ok && (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Healthy</span>
              </>
            )}
            {checking && (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Checking</span>
              </>
            )}
            {!ok && !checking && (
              <>
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Offline</span>
              </>
            )}
          </div>

          {health?.version && (
            <span className="hidden sm:inline-flex chip border-white/10 text-ink-300 bg-ink-700/40">
              v{health.version}
            </span>
          )}

          <button
            onClick={toggleMock}
            title={mock ? 'Mock mode ON — using simulated data' : 'Mock mode OFF — using live API'}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[11px] font-medium transition-colors',
              mock
                ? 'bg-violet-500/15 border-violet-400/30 text-violet-200'
                : 'bg-ink-700/50 border-white/10 text-ink-400 hover:text-ink-200',
            )}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            Mock {mock ? 'On' : 'Off'}
          </button>

          <button
            onClick={onRefresh}
            className="p-2 rounded-lg text-ink-300 hover:text-white hover:bg-ink-700/60 transition-colors"
            aria-label="Refresh health"
            title="Refresh status"
          >
            <RefreshCw className={cn('w-4 h-4', checking && 'animate-spin')} />
          </button>
        </div>
      </div>

      {!ok && !checking && !mock && (
        <div className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-400/20 text-rose-200 text-xs animate-fade-in">
          <Activity className="w-3.5 h-3.5" />
          <span>
            Cannot reach the LogicGraph engine at <code className="font-mono">localhost:8000</code>. Start the API
            service, or enable Mock mode in the header to explore the dashboard with simulated data.
          </span>
        </div>
      )}

      {mock && (
        <div className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/10 border border-violet-400/20 text-violet-200 text-xs animate-fade-in">
          <FlaskConical className="w-3.5 h-3.5" />
          <span>
            Mock mode is active — the dashboard shows simulated argument-mining data. Toggle it off in the header to
            connect to a live LogicGraph engine at <code className="font-mono">localhost:8000</code>.
          </span>
        </div>
      )}
    </header>
  );
}
