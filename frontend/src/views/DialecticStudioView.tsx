import { useCallback, useState } from 'react';
import {
  Search,
  Sparkles,
  Loader2,
  Scale,
  ThumbsUp,
  ThumbsDown,
  FileText,
  Quote,
  RefreshCw,
} from 'lucide-react';
import { apiPostJson } from '@/lib/api';
import { cn, formatPct } from '@/lib/api';
import type { QueryResponse, SynthesisResponse } from '@/lib/types';
import { Card, EmptyState } from '@/components/ui';
import { Badge } from '@/components/Badge';
import type { ToastPush } from '@/hooks/useToasts';

const DEFAULT_TOPIC = 'security';

export function DialecticStudioView({ pushToast }: { pushToast: ToastPush }) {
  const [query, setQuery] = useState(DEFAULT_TOPIC);
  const [submitted, setSubmitted] = useState(DEFAULT_TOPIC);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SynthesisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSynthesis = useCallback(
    async (topic: string) => {
      const t = topic.trim();
      if (!t) {
        pushToast('Enter a topic to synthesize', 'error');
        return;
      }
      setLoading(true);
      setError(null);
      setSubmitted(t);
      try {
        const evidence = await apiPostJson<QueryResponse>('/api/query', { search_topic: t });
        const res = await apiPostJson<SynthesisResponse>('/api/synthesize', {
          search_topic: t,
          supporting_evidence: evidence.supporting_evidence,
          contradicting_evidence: evidence.contradicting_evidence,
        });
        setResult(res);
        pushToast(`Synthesis complete for "${t}"`, 'success');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Synthesis failed';
        setError(msg);
        setResult(null);
        pushToast(`Synthesis failed: ${msg}`, 'error');
      } finally {
        setLoading(false);
      }
    },
    [pushToast],
  );

  const status = result?.dialectic_status;
  const consensus = result?.consensus_points ?? [];
  const contradictions = result?.contradiction_points ?? [];
  const synthesis = result?.dialectic_synthesis || result?.summary || '';
  const confidence = result?.confidence_score;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Dialectic Studio</h1>
        <p className="text-sm text-ink-400 mt-1">
          Graph-RAG synthesis across the corpus — surface consensus, contradictions, and a dialectic summary for any topic.
        </p>
      </div>

      {/* Search */}
      <Card className="p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSynthesis(query);
          }}
          className="flex items-center gap-3 flex-wrap"
        >
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter a topic to synthesize…"
              className="input-field !pl-10"
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Synthesizing…' : 'Synthesize'}
          </button>
          {query !== DEFAULT_TOPIC && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setQuery(DEFAULT_TOPIC);
              }}
            >
              <RefreshCw className="w-4 h-4" />
              Reset
            </button>
          )}
        </form>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-400">
          <kbd className="px-1.5 py-0.5 rounded bg-ink-700/60 border border-white/10 font-mono">Enter</kbd>
          to run · POST /api/synthesize
        </div>
      </Card>

      {loading && (
        <Card className="p-10">
          <div className="flex flex-col items-center gap-3 text-ink-300">
            <div className="relative">
              <Loader2 className="w-10 h-10 animate-spin text-gold-400" />
              <Sparkles className="w-4 h-4 text-gold-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <p className="text-sm">Synthesizing dialectic for “{submitted}”…</p>
            <p className="text-xs text-ink-400">Mining consensus, contradictions, and writing executive summary.</p>
          </div>
        </Card>
      )}

      {!loading && error && (
        <Card className="p-8">
          <EmptyState
            icon={<Sparkles className="w-7 h-7" />}
            title="Synthesis unavailable"
            message={error}
            action={
              <button className="btn-primary" onClick={() => runSynthesis(submitted)}>
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            }
          />
        </Card>
      )}

      {!loading && !result && !error && (
        <Card className="p-10">
          <EmptyState
            icon={<Scale className="w-7 h-7" />}
            title="No synthesis yet"
            message="Enter a topic above and click Synthesize to surface the dialectic structure of your ingested corpus."
          />
        </Card>
      )}

      {!loading && result && !error && (
        <div className="space-y-6 animate-fade-in">
          {/* Top banner */}
          <Card className="p-6 relative overflow-hidden">
            <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-gold-500/5 blur-3xl pointer-events-none" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gold-400/20 to-gold-600/10 border border-gold-400/20 flex items-center justify-center">
                  <Scale className="w-6 h-6 text-gold-300" />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-ink-400 font-semibold">Topic</div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    {result.topic || submitted}
                  </h2>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {status && <DialecticStatusBadge status={status} />}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-ink-800/70 border border-white/[0.06]">
                  <span className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">Confidence</span>
                  <div className="w-20 h-1.5 rounded-full bg-ink-700/60 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        (confidence ?? 0) >= 0.75 ? 'bg-emerald-400' : (confidence ?? 0) >= 0.5 ? 'bg-gold-400' : 'bg-rose-400',
                      )}
                      style={{ width: `${Math.min(100, (confidence ?? 0) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-white tabular-nums">{formatPct(confidence)}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Consensus / Contradictions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Consensus */}
            <Card className="p-6 border-emerald-400/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <ThumbsUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Consensus</h3>
                    <p className="text-xs text-ink-400">Points of agreement across sources</p>
                  </div>
                </div>
                <Badge variant="ok">{consensus.length} points</Badge>
              </div>
              {consensus.length === 0 ? (
                <p className="text-sm text-ink-400 italic py-6 text-center">No consensus points found.</p>
              ) : (
                <ul className="space-y-3">
                  {consensus.map((p, i) => (
                    <li key={i} className="flex gap-3 animate-fade-in" style={{ animationDelay: `${i * 40}ms` }}>
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 shadow-glow-emerald" />
                      <span className="text-sm text-ink-100 leading-relaxed">{p}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Contradictions */}
            <Card className="p-6 border-rose-400/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
                    <ThumbsDown className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Contradictions</h3>
                    <p className="text-xs text-ink-400">Tensions and opposing claims</p>
                  </div>
                </div>
                <Badge variant="error">{contradictions.length} points</Badge>
              </div>
              {contradictions.length === 0 ? (
                <p className="text-sm text-ink-400 italic py-6 text-center">No contradictions surfaced.</p>
              ) : (
                <ul className="space-y-3">
                  {contradictions.map((p, i) => (
                    <li key={i} className="flex gap-3 animate-fade-in" style={{ animationDelay: `${i * 40}ms` }}>
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0 shadow-glow-rose" />
                      <span className="text-sm text-ink-100 leading-relaxed">{p}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Synthesis */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gold-500/10 text-gold-400 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Dialectic Synthesis</h3>
                  <p className="text-xs text-ink-400">Executive summary narrative</p>
                </div>
              </div>
              <Quote className="w-4 h-4 text-ink-500" />
            </div>
            {synthesis ? (
              <div className="relative">
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-gold-400/60 to-transparent rounded-full" />
                <p className="text-[15px] text-ink-100 leading-[1.7] pl-4 whitespace-pre-wrap">
                  {synthesis}
                </p>
              </div>
            ) : (
              <p className="text-sm text-ink-400 italic">No synthesis narrative available.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function DialecticStatusBadge({ status }: { status: string }) {
  const v = status.toUpperCase();
  let variant: 'ok' | 'error' | 'warn' | 'neutral' | 'info' | 'gold' = 'neutral';
  if (v.includes('BALANCED')) variant = 'info';
  else if (v.includes('CONSENSUS') || v.includes('AGREE')) variant = 'ok';
  else if (v.includes('CONFLICT') || v.includes('CONTRADICT') || v.includes('DISPUT')) variant = 'error';
  else if (v.includes('UNCLEAR') || v.includes('INSUFF')) variant = 'warn';
  else if (v.includes('SUPPORT')) variant = 'gold';
  return <Badge variant={variant}>{v.replace(/_/g, ' ')}</Badge>;
}
