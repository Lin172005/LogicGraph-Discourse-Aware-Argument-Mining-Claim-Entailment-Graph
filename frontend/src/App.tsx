import { useCallback, useEffect, useState } from 'react';
import { Sidebar, type ViewId } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { ToastContainer } from '@/components/ToastContainer';
import { useHealth } from '@/hooks/useHealth';
import { useToasts } from '@/hooks/useToasts';
import { IngestView } from '@/views/IngestView';
import { GraphExplorerView } from '@/views/GraphExplorerView';
import { DialecticStudioView } from '@/views/DialecticStudioView';
import { DocumentsView } from '@/views/DocumentsView';

export default function App() {
  const [view, setView] = useState<ViewId>('ingest');
  const [navOpen, setNavOpen] = useState(false);
  const { toasts, push, dismiss } = useToasts();
  const health = useHealth();
  const [docRefresh, setDocRefresh] = useState(0);
  const [dataKey, setDataKey] = useState(0);

  // When mock mode toggles, force every view to remount & refetch.
  useEffect(() => {
    const handler = () => {
      health.check();
      setDataKey((k) => k + 1);
      setDocRefresh((n) => n + 1);
    };
    window.addEventListener('mock-toggled', handler);
    return () => window.removeEventListener('mock-toggled', handler);
  }, [health]);

  const handleSelect = useCallback((id: ViewId) => {
    setView(id);
    if (id === 'documents') setDocRefresh((n) => n + 1);
  }, []);

  return (
    <div className="min-h-screen flex bg-grid">
      <Sidebar active={view} onSelect={handleSelect} open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col">
        <Header
          status={health.status}
          health={health.health}
          lastChecked={health.lastChecked}
          onRefresh={health.check}
          onMenu={() => setNavOpen(true)}
        />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1500px] w-full mx-auto">
          {view === 'ingest' && <IngestView key={`ingest-${dataKey}`} pushToast={push} />}
          {view === 'graph' && <GraphExplorerView key={`graph-${dataKey}`} pushToast={push} />}
          {view === 'dialectic' && <DialecticStudioView key={`dialectic-${dataKey}`} pushToast={push} />}
          {view === 'documents' && <DocumentsView key={`docs-${dataKey}`} pushToast={push} refreshKey={docRefresh} />}
        </main>

        <footer className="px-6 py-4 text-center text-[11px] text-ink-500">
          LogicGraph · Argument Mining & Dialectic Synthesis — frontend talks to{' '}
          <code className="font-mono text-ink-400">localhost:8000</code>
        </footer>
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
