import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import type { ToastItem } from '@/hooks/useToasts';
import { cn } from '@/lib/api';

const styles: Record<ToastItem['variant'], { icon: typeof Info; cls: string }> = {
  success: { icon: CheckCircle2, cls: 'bg-emerald-500/15 border-emerald-400/25 text-emerald-200' },
  error: { icon: AlertCircle, cls: 'bg-rose-500/15 border-rose-400/25 text-rose-200' },
  info: { icon: Info, cls: 'bg-blue-500/15 border-blue-400/25 text-blue-200' },
};

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 w-[min(360px,calc(100vw-2.5rem))]">
      {toasts.map((t) => {
        const s = styles[t.variant];
        const Icon = s.icon;
        return (
          <div
            key={t.id}
            className={cn('glass-strong px-4 py-3 rounded-xl border text-sm flex items-start gap-2.5 animate-slide-in', s.cls)}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              onClick={() => onDismiss(t.id)}
              className="opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
