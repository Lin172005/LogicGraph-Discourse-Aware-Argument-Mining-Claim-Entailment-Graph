import { cn } from '@/lib/api';
import type { LucideIcon } from 'lucide-react';

interface BadgeProps {
  variant?: 'ok' | 'warn' | 'error' | 'neutral' | 'info' | 'gold';
  children: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
  pulse?: boolean;
}

const variants: Record<NonNullable<BadgeProps['variant']>, string> = {
  ok: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/25',
  warn: 'bg-amber-500/10 text-amber-300 border-amber-400/25',
  error: 'bg-rose-500/10 text-rose-300 border-rose-400/25',
  neutral: 'bg-ink-600/40 text-ink-200 border-white/10',
  info: 'bg-blue-500/10 text-blue-300 border-blue-400/25',
  gold: 'bg-gold-500/10 text-gold-400 border-gold-400/25',
};

export function Badge({ variant = 'neutral', children, icon: Icon, className, pulse }: BadgeProps) {
  return (
    <span
      className={cn(
        'chip',
        variants[variant],
        'tracking-wide',
        pulse && 'animate-pulse-soft',
        className,
      )}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
}
