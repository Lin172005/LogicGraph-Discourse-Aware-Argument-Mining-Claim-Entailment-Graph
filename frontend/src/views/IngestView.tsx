import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileUp,
  Files,
  UploadCloud,
  CheckCircle2,
  Clock,
  ListTree,
  GitBranch,
  Loader2,
  FileText,
  X,
} from 'lucide-react';
import { apiPostForm } from '@/lib/api';
import type { IngestBatchResponse, IngestMetrics, IngestSingleResponse } from '@/lib/types';
import { cn, formatDuration, formatNumber } from '@/lib/api';
import { Card, EmptyState, StatCard } from '@/components/ui';
import type { ToastPush } from '@/hooks/useToasts';

interface FileEntry {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  message?: string;
}

interface MetricsState {
  processing_time_ms?: number;
  parsed_sentences?: number;
  stored_relations?: number;
}

export function IngestView({ pushToast }: { pushToast: ToastPush }) {
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [singleDragging, setSingleDragging] = useState(false);
  const [singleLoading, setSingleLoading] = useState(false);

  const [batchFiles, setBatchFiles] = useState<FileEntry[]>([]);
  const [batchDragging, setBatchDragging] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);

  const [metrics, setMetrics] = useState<MetricsState>({});
  const [history, setHistory] = useState<
    Array<{ id: string; filename: string; sentences: number; relations: number; ms: number; at: number }>
  >([]);

  const singleInput = useRef<HTMLInputElement>(null);
  const batchInput = useRef<HTMLInputElement>(null);

  const isText = (f: File) =>
    /\.(txt|md|markdown|pdf|docx?|rtf|json|csv|html?|tex|log)$/i.test(f.name) || f.type.startsWith('text/');

  // ----- Single ingest -----
  const ingestSingle = useCallback(
    async (file: File) => {
      setSingleLoading(true);
      const fd = new FormData();
      fd.append('file', file);
      try {
        const res = await apiPostForm<IngestSingleResponse>('/api/ingest/file', fd);
        const m: MetricsState = {
          processing_time_ms: pickNum(res, ['processing_time_ms', 'duration_ms', 'elapsed_ms']),
          parsed_sentences: pickNum(res, ['parsed_sentences', 'sentences']),
          stored_relations: pickNum(res, ['stored_relations', 'relations']),
        };
        setMetrics((prev) => ({
          processing_time_ms: m.processing_time_ms ?? prev.processing_time_ms,
          parsed_sentences: (prev.parsed_sentences ?? 0) + (m.parsed_sentences ?? 0),
          stored_relations: (prev.stored_relations ?? 0) + (m.stored_relations ?? 0),
        }));
        setHistory((h) =>
          [
            {
              id: res.document_id || cryptoId(),
              filename: file.name,
              sentences: m.parsed_sentences ?? 0,
              relations: m.stored_relations ?? 0,
              ms: m.processing_time_ms ?? 0,
              at: Date.now(),
            },
            ...h,
          ].slice(0, 8),
        );
        pushToast(`Ingested "${file.name}" — ${m.parsed_sentences ?? 0} sentences, ${m.stored_relations ?? 0} relations`, 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Ingestion failed';
        pushToast(`Single ingest failed: ${msg}`, 'error');
      } finally {
        setSingleLoading(false);
        setSingleFile(null);
      }
    },
    [pushToast],
  );

  // ----- Batch ingest -----
  const ingestBatch = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setBatchFiles(files.map((f) => ({ file: f, status: 'pending' as const })));
      setBatchLoading(true);
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      try {
        const res = await apiPostForm<IngestBatchResponse>('/api/ingest/batch', fd);
        const totalSents = pickNum(res, ['total_sentences']) ?? sum(res.results, 'parsed_sentences') ?? sum(res.files, 'sentences') ?? 0;
        const totalRels = pickNum(res, ['total_relations']) ?? sum(res.results, 'stored_relations') ?? sum(res.files, 'relations') ?? 0;
        const totalMs = pickNum(res, ['total_processing_time_ms']) ?? pickNum(res, ['processing_time_ms']) ?? 0;

        setMetrics((prev) => ({
          processing_time_ms: totalMs || prev.processing_time_ms,
          parsed_sentences: (prev.parsed_sentences ?? 0) + totalSents,
          stored_relations: (prev.stored_relations ?? 0) + totalRels,
        }));
        setBatchFiles((prev) => prev.map((e) => ({ ...e, status: 'done' as const })));
        pushToast(`Batch complete — ${files.length} files, ${totalSents} sentences, ${totalRels} relations`, 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Batch failed';
        setBatchFiles((prev) => prev.map((e) => ({ ...e, status: 'error' as const, message: msg })));
        pushToast(`Batch ingest failed: ${msg}`, 'error');
      } finally {
        setBatchLoading(false);
      }
    },
    [pushToast],
  );

  // auto-kick single when chosen
  useEffect(() => {
    if (singleFile && !singleLoading) ingestSingle(singleFile);
  }, [singleFile, singleLoading, ingestSingle]);

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeading
        title="Ingest Workspace"
        subtitle="Upload documents to extract claims, premises, and dialectic relations."
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Processing Time"
          value={metrics.processing_time_ms != null ? formatDuration(metrics.processing_time_ms) : '—'}
          icon={<Clock className="w-4 h-4" />}
          accent="gold"
          hint="Most recent run"
        />
        <StatCard
          label="Parsed Sentences"
          value={formatNumber(metrics.parsed_sentences)}
          icon={<ListTree className="w-4 h-4" />}
          accent="blue"
          hint="Cumulative this session"
        />
        <StatCard
          label="Stored Relations"
          value={formatNumber(metrics.stored_relations)}
          icon={<GitBranch className="w-4 h-4" />}
          accent="emerald"
          hint="Cumulative this session"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Single */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gold-500/10 text-gold-400 flex items-center justify-center">
              <FileUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Single File Ingest</h3>
              <p className="text-xs text-ink-400">One document at a time · POST /api/ingest/file</p>
            </div>
          </div>
          <Dropzone
            dragging={singleDragging}
            onDragState={setSingleDragging}
            onFiles={(files) => files[0] && !singleLoading && setSingleFile(files[0])}
            inputRef={singleInput}
            accept=".txt,.md,.pdf,.docx,.rtf,.json,.csv,.html,.tex"
            multiple={false}
            busy={singleLoading}
            hint="Drop a document, or click to browse"
          />
          {singleLoading && (
            <div className="mt-3 flex items-center gap-2 text-sm text-ink-300">
              <Loader2 className="w-4 h-4 animate-spin text-gold-400" />
              Parsing & extracting relations…
            </div>
          )}
        </Card>

        {/* Batch */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Files className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Batch Ingest</h3>
              <p className="text-xs text-ink-400">Many files at once · POST /api/ingest/batch</p>
            </div>
          </div>
          <Dropzone
            dragging={batchDragging}
            onDragState={setBatchDragging}
            onFiles={(files) => {
              if (!batchLoading) ingestBatch(files);
            }}
            inputRef={batchInput}
            multiple
            busy={batchLoading}
            hint="Drop multiple documents to process as a batch"
          />
          {batchFiles.length > 0 && (
            <ul className="mt-4 space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {batchFiles.map((e, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2.5 text-sm px-3 py-2 rounded-lg bg-ink-800/60 border border-white/[0.05]"
                >
                  <FileText className="w-4 h-4 text-ink-400 shrink-0" />
                  <span className="flex-1 truncate text-ink-100">{e.file.name}</span>
                  <span className="text-[11px] text-ink-400 shrink-0">{prettySize(e.file.size)}</span>
                  {e.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {e.status === 'uploading' && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
                  {e.status === 'error' && <X className="w-4 h-4 text-rose-400" />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* History */}
      <Card className="p-6">
        <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-ink-300" />
          Recent Ingestions
        </h3>
        {history.length === 0 ? (
          <EmptyState
            icon={<UploadCloud className="w-6 h-6" />}
            title="No ingestions yet"
            message="Uploaded documents will appear here with sentence and relation counts."
          />
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {history.map((h) => (
              <li key={h.id + h.at} className="flex items-center gap-3 py-2.5 text-sm">
                <FileText className="w-4 h-4 text-ink-400 shrink-0" />
                <span className="flex-1 truncate text-ink-100">{h.filename}</span>
                <span className="text-ink-400 text-xs tabular-nums">{h.sentences} sents</span>
                <span className="text-ink-400 text-xs tabular-nums">{h.relations} rels</span>
                <span className="text-ink-400 text-xs tabular-nums w-16 text-right">{formatDuration(h.ms)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------- Dropzone ----------
function Dropzone({
  dragging,
  onDragState,
  onFiles,
  inputRef,
  accept,
  multiple,
  busy,
  hint,
}: {
  dragging: boolean;
  onDragState: (v: boolean) => void;
  onFiles: (files: File[]) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  accept?: string;
  multiple?: boolean;
  busy?: boolean;
  hint?: string;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onDragState(true);
      }}
      onDragLeave={() => onDragState(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDragState(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(files);
      }}
      onClick={() => !busy && inputRef.current?.click()}
      className={cn(
        'group relative cursor-pointer rounded-2xl border-2 border-dashed p-7 text-center transition-all duration-200',
        dragging
          ? 'border-gold-400/60 bg-gold-500/10 shadow-glow-gold'
          : 'border-white/10 bg-ink-800/40 hover:border-white/20 hover:bg-ink-800/70',
        busy && 'pointer-events-none opacity-70',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = '';
        }}
      />
      <div className="mx-auto w-12 h-12 rounded-2xl bg-ink-700/60 group-hover:bg-gold-500/15 group-hover:text-gold-400 flex items-center justify-center text-ink-300 transition-colors">
        {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <UploadCloud className="w-6 h-6" />}
      </div>
      <p className="mt-3 text-sm font-medium text-ink-100">{hint ?? 'Drop files here or click to browse'}</p>
      <p className="mt-1 text-[11px] text-ink-400">TXT · MD · PDF · DOCX · JSON · CSV · HTML</p>
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
      {subtitle && <p className="text-sm text-ink-400 mt-1">{subtitle}</p>}
    </div>
  );
}

function cryptoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

function pickNum(obj: object | undefined, keys: string[]): number | undefined {
  if (!obj) return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
}

function sum<T>(arr: T[] | undefined, key: keyof T): number | undefined {
  if (!arr || !arr.length) return undefined;
  let total = 0;
  let found = false;
  for (const item of arr) {
    const v = item[key];
    if (typeof v === 'number') {
      total += v;
      found = true;
    }
  }
  return found ? total : undefined;
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// referenced to keep import meaningful for type
export type _Metrics = IngestMetrics;
