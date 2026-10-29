import { cn } from '@/lib/api';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-glow-gold">
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-ink-950" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="2.4" />
          <circle cx="18" cy="6" r="2.4" />
          <circle cx="12" cy="18" r="2.4" />
          <path d="M7.6 7.6 10.6 16M16.4 7.6 13.4 16M8 6h8" />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="font-bold text-[15px] tracking-tight text-white">
          Logic<span className="text-gold-400">Graph</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-medium">Argument Mining</div>
      </div>
    </div>
  );
}
