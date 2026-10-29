import { cn } from '@/lib/api';

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className || 'w-4 h-4')}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('glass card-hover', className)}>{children}</div>;
}

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  accent?: 'gold' | 'blue' | 'emerald' | 'rose' | 'neutral';
  hint?: string;
  loading?: boolean;
}

const accentRing: Record<NonNullable<StatCardProps['accent']>, string> = {
  gold: 'text-gold-400 bg-gold-500/10',
  blue: 'text-blue-400 bg-blue-500/10',
  emerald: 'text-emerald-400 bg-emerald-500/10',
  rose: 'text-rose-400 bg-rose-500/10',
  neutral: 'text-ink-200 bg-ink-600/40',
};

export function StatCard({ label, value, icon, accent = 'neutral', hint, loading }: StatCardProps) {
  return (
    <div className="stat-card card-hover">
      <div className="flex items-start justify-between">
        <span className="text-[11px] uppercase tracking-[0.14em] text-ink-300 font-semibold">{label}</span>
        {icon && (
          <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center', accentRing[accent])}>
            {icon}
          </span>
        )}
      </div>
      {loading ? (
        <div className="skeleton h-7 w-20 mt-1" />
      ) : (
        <div className="text-2xl font-bold text-white tabular-nums mt-1">{value}</div>
      )}
      {hint && <div className="text-[11px] text-ink-400 mt-0.5">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 animate-fade-in">
      {icon && <div className="w-14 h-14 rounded-2xl bg-ink-700/50 flex items-center justify-center text-ink-300 mb-4">{icon}</div>}
      <h3 className="text-base font-semibold text-ink-100">{title}</h3>
      {message && <p className="text-sm text-ink-400 mt-1 max-w-md">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Toast({
  message,
  variant = 'info',
}: {
  message: string;
  variant?: 'info' | 'success' | 'error';
}) {
  const styles = {
    info: 'bg-blue-500/15 border-blue-400/25 text-blue-200',
    success: 'bg-emerald-500/15 border-emerald-400/25 text-emerald-200',
    error: 'bg-rose-500/15 border-rose-400/25 text-rose-200',
  };
  return (
    <div className={cn('glass-strong px-4 py-3 rounded-xl border text-sm animate-slide-in', styles[variant])}>
      {message}
    </div>
  );
}
