import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Search,
  Trash2,
  Eye,
  AlertTriangle,
  Loader2,
  X,
  Database,
  Plus,
  RefreshCw,
  Clock,
} from 'lucide-react';
import {
  apiDelete,
  apiGet,
  cn,
  formatNumber,
  timeAgo,
} from '@/lib/api';
import type { DocumentDetail, DocumentListResponse, DocumentSummary } from '@/lib/types';
import { Card, EmptyState, StatCard } from '@/components/ui';
import { Badge } from '@/components/Badge';
import type { ToastPush } from '@/hooks/useToasts';

export function DocumentsView({ pushToast, refreshKey }: { pushToast: ToastPush; refreshKey: number }) {
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<DocumentListResponse>('/api/documents');
      const list = res.documents ?? res.items ?? (Array.isArray(res) ? (res as DocumentSummary[]) : []);
      setDocs(list);
    } catch (e) {
      pushToast(`Failed to load documents: ${e instanceof Error ? e.message : 'unknown'}`, 'error');
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => {
      const title = (d.title || d.filename || d.name || '').toLowerCase();
      return title.includes(q);
    });
  }, [docs, search]);

  const viewDoc = useCallback(async (id: string) => {
    setDetailId(id);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await apiGet<DocumentDetail>(`/api/document/${id}`);
      setDetail(res);
    } catch (e) {
      pushToast(`Failed to load document: ${e instanceof Error ? e.message : 'unknown'}`, 'error');
    } finally {
      setDetailLoading(false);
    }
  }, [pushToast]);

  const deleteDoc = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await apiDelete(`/api/document/${id}`);
        setDocs((prev) => prev.filter((d) => String(d.document_id || d.id) !== id));
        pushToast('Document deleted', 'success');
        if (detailId === id) setDetail(null);
      } catch (e) {
        pushToast(`Delete failed: ${e instanceof Error ? e.message : 'unknown'}`, 'error');
      } finally {
        setDeletingId(null);
      }
    },
    [pushToast, detailId],
  );

  const clearAll = useCallback(async () => {
    setClearing(true);
    try {
      await apiDelete('/api/graph/clear');
      setDocs([]);
      setDetail(null);
      setConfirmClear(false);
      pushToast('All graph data cleared', 'success');
    } catch (e) {
      pushToast(`Clear failed: ${e instanceof Error ? e.message : 'unknown'}`, 'error');
    } finally {
      setClearing(false);
    }
  }, [pushToast]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Document Manager</h1>
          <p className="text-sm text-ink-400 mt-1">Inspect, filter, and remove ingested documents from the corpus.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-ghost" disabled={loading}>
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Refresh
          </button>
          <button onClick={() => setConfirmClear(true)} className="btn-danger">
            <Trash2 className="w-4 h-4" />
            Clear All Graph Data
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Documents" value={formatNumber(docs.length)} icon={<FileText className="w-4 h-4" />} accent="neutral" loading={loading} />
        <StatCard label="Showing" value={formatNumber(filtered.length)} icon={<Search className="w-4 h-4" />} accent="blue" />
        <StatCard label="Total Claims" value={formatNumber(sumKey(docs, 'claims'))} icon={<Database className="w-4 h-4" />} accent="gold" />
        <StatCard label="Total Relations" value={formatNumber(sumKey(docs, 'relations'))} icon={<Database className="w-4 h-4" />} accent="emerald" />
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or filename…"
            className="input-field !pl-10"
          />
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-10 flex items-center justify-center gap-3 text-ink-300">
            <Loader2 className="w-5 h-5 animate-spin text-gold-400" />
            <span className="text-sm">Loading documents…</span>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-7 h-7" />}
            title={search ? 'No matching documents' : 'No documents yet'}
            message={
              search
                ? `No documents match "${search}".`
                : 'Ingest documents from the Ingest tab to populate your corpus.'
            }
            action={
              !search ? (
                <span className="text-xs text-ink-400 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Use the Ingest workspace to add documents
                </span>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-ink-400 font-semibold border-b border-white/[0.06] bg-ink-850/60">
                  <th className="px-5 py-3">Document</th>
                  <th className="px-4 py-3 text-right">Sentences</th>
                  <th className="px-4 py-3 text-right">Claims</th>
                  <th className="px-4 py-3 text-right">Premises</th>
                  <th className="px-4 py-3 text-right">Relations</th>
                  <th className="px-4 py-3">Ingested</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map((d) => {
                  const id = String(d.document_id || d.id || '');
                  const title = d.title || d.filename || d.name || id;
                  return (
                    <tr
                      key={id}
                      className="group hover:bg-ink-800/50 transition-colors cursor-pointer"
                      onClick={() => viewDoc(id)}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-ink-700/60 group-hover:bg-gold-500/15 group-hover:text-gold-400 text-ink-300 flex items-center justify-center transition-colors shrink-0">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-ink-100 truncate max-w-[320px]">{title}</div>
                            <code className="text-[10px] text-ink-500 font-mono">{id.slice(0, 24)}</code>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-200">{formatNumber(d.sentences)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gold-300">{formatNumber(d.claims)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-blue-300">{formatNumber(d.premises)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-300">{formatNumber(d.relations)}</td>
                      <td className="px-4 py-3 text-ink-400 text-xs whitespace-nowrap">
                        <Clock className="w-3 h-3 inline mr-1 align-text-bottom" />
                        {timeAgo(d.created_at || d.ingested_at || d.timestamp)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="p-1.5 rounded-lg text-ink-300 hover:text-white hover:bg-ink-700/60 transition-colors"
                            onClick={() => viewDoc(id)}
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            className="p-1.5 rounded-lg text-ink-300 hover:text-rose-300 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                            onClick={() => deleteDoc(id)}
                            disabled={deletingId === id}
                            title="Delete document"
                          >
                            {deletingId === id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detail modal */}
      {detailId && (
        <DetailModal
          id={detailId}
          detail={detail}
          loading={detailLoading}
          onClose={() => {
            setDetailId(null);
            setDetail(null);
          }}
        />
      )}

      {/* Clear confirmation */}
      {confirmClear && (
        <ConfirmModal
          title="Clear all graph data?"
          message="This permanently removes every document, claim, premise, and relation from the engine. This cannot be undone."
          confirmLabel="Clear everything"
          busy={clearing}
          onCancel={() => setConfirmClear(false)}
          onConfirm={clearAll}
        />
      )}
    </div>
  );
}

function DetailModal({
  id,
  detail,
  loading,
  onClose,
}: {
  id: string;
  detail: DocumentDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/70 backdrop-blur-sm animate-fade-in">
      <div className="glass-strong w-full max-w-3xl max-h-[85vh] flex flex-col animate-slide-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gold-500/15 text-gold-400 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-white truncate">
                {detail?.title || detail?.filename || 'Document detail'}
              </h3>
              <code className="text-[10px] text-ink-400 font-mono">{id}</code>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-300 hover:text-white p-1.5 rounded-lg hover:bg-ink-700/60">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-12 text-ink-300">
              <Loader2 className="w-7 h-7 animate-spin text-gold-400" />
              <p className="text-sm">Loading document…</p>
            </div>
          ) : !detail ? (
            <p className="text-sm text-ink-400 text-center py-8">No detail returned for this document.</p>
          ) : (
            <>
              {detail.metadata || detail.filename || detail.title ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Meta label="Sentences" value={formatNumber(detail.sentences?.length)} />
                  <Meta label="Relations" value={formatNumber(detail.relations?.length)} />
                  <Meta label="Created" value={timeAgo(detail.created_at)} />
                  <Meta label="Status" value={String(detail.status || 'processed')} />
                </div>
              ) : null}

              {(detail.content || detail.text) && (
                <div>
                  <SectionLabel>Source Text</SectionLabel>
                  <div className="rounded-xl bg-ink-800/60 border border-white/[0.05] p-4 max-h-52 overflow-y-auto text-sm text-ink-100 leading-relaxed whitespace-pre-wrap">
                    {detail.content || detail.text}
                  </div>
                </div>
              )}

              {detail.sentences && detail.sentences.length > 0 && (
                <div>
                  <SectionLabel>Extracted Sentences</SectionLabel>
                  <ul className="space-y-2 max-h-60 overflow-y-auto">
                    {detail.sentences.map((s, i) => (
                      <li
                        key={s.id || i}
                        className="flex gap-3 text-sm rounded-lg bg-ink-800/50 border border-white/[0.05] p-3"
                      >
                        <Badge
                          variant={s.type === 'Claim' || s.type === 'claim' ? 'gold' : 'info'}
                          className="shrink-0"
                        >
                          {(s.type as string) || '—'}
                        </Badge>
                        <span className="flex-1 text-ink-100 leading-relaxed">{s.text}</span>
                        {typeof s.confidence === 'number' && (
                          <span className="text-[11px] text-ink-400 tabular-nums shrink-0">
                            {Math.round(s.confidence * 100)}%
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.relations && detail.relations.length > 0 && (
                <div>
                  <SectionLabel>Relations</SectionLabel>
                  <ul className="space-y-1.5 max-h-44 overflow-y-auto">
                    {detail.relations.map((r, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-3 text-xs rounded-lg bg-ink-800/50 border border-white/[0.05] px-3 py-2"
                      >
                        <code className="text-ink-400 font-mono truncate">{String(r.source).slice(0, 14)}</code>
                        <span
                          className={cn(
                            'font-semibold px-2 py-0.5 rounded',
                            (r.type as string) === 'CONTRADICTS' || (r.type as string) === 'contradicts'
                              ? 'text-rose-300 bg-rose-500/10'
                              : 'text-emerald-300 bg-emerald-500/10',
                          )}
                        >
                          {String(r.type).toUpperCase()}
                        </span>
                        <code className="text-ink-400 font-mono truncate">{String(r.target).slice(0, 14)}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/70 backdrop-blur-sm animate-fade-in">
      <div className="glass-strong w-full max-w-md p-6 animate-slide-in">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-base">{title}</h3>
            <p className="text-sm text-ink-300 mt-1.5 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-6">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-ink-800/60 border border-white/[0.05] p-3">
      <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">{label}</div>
      <div className="text-sm text-ink-100 mt-1 truncate">{value}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold mb-2">{children}</div>
  );
}

function sumKey(docs: DocumentSummary[], key: keyof DocumentSummary): number {
  let t = 0;
  for (const d of docs) {
    const v = d[key];
    if (typeof v === 'number') t += v;
  }
  return t;
}
