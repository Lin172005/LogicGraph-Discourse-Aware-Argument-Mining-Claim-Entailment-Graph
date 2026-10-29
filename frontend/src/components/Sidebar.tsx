import { Activity, Layers, Network, MessagesSquare, FileText, X } from 'lucide-react';
import { cn } from '@/lib/api';
import { Logo } from './Logo';

export type ViewId = 'ingest' | 'graph' | 'dialectic' | 'documents';

export interface NavItem {
  id: ViewId;
  label: string;
  description: string;
  icon: typeof Activity;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'ingest', label: 'Ingest', description: 'Upload & parse', icon: Layers },
  { id: 'graph', label: 'Graph Explorer', description: 'Visualize relations', icon: Network },
  { id: 'dialectic', label: 'Dialectic Studio', description: 'Synthesize debate', icon: MessagesSquare },
  { id: 'documents', label: 'Document Manager', description: 'Manage corpus', icon: FileText },
];

interface SidebarProps {
  active: ViewId;
  onSelect: (id: ViewId) => void;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ active, onSelect, open, onClose }: SidebarProps) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-ink-950/70 backdrop-blur-sm z-30 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          'fixed lg:sticky top-0 left-0 z-40 h-screen w-72 shrink-0',
          'glass-strong rounded-none lg:rounded-r-2xl border-y-0 border-l-0',
          'flex flex-col transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <Logo />
          <button
            className="lg:hidden text-ink-300 hover:text-white p-1 rounded-lg"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 pt-1 text-[10px] uppercase tracking-[0.16em] text-ink-400 font-semibold">
            Workspace
          </div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelect(item.id);
                  onClose();
                }}
                className={cn(
                  'group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200',
                  isActive
                    ? 'bg-gold-500/10 border border-gold-400/20 text-white shadow-glow-gold'
                    : 'text-ink-200 hover:bg-ink-700/50 hover:text-white border border-transparent',
                )}
              >
                <span
                  className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
                    isActive ? 'bg-gold-500/15 text-gold-400' : 'bg-ink-700/40 text-ink-300 group-hover:text-ink-100',
                  )}
                >
                  <Icon className="w-[18px] h-[18px]" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium leading-tight">{item.label}</span>
                  <span className="block text-[11px] text-ink-400 leading-tight">{item.description}</span>
                </span>
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse-soft" />}
              </button>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-white/[0.05]">
          <div className="flex items-center gap-2 text-[11px] text-ink-400">
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse-soft" />
            <span>Engine online</span>
          </div>
          <p className="text-[10px] text-ink-500 mt-1.5 leading-relaxed">
            LogicGraph · Argument Mining & Dialectic Synthesis
          </p>
        </div>
      </aside>
    </>
  );
}
