import { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape, { type Core, type ElementDefinition, type EventObject } from 'cytoscape';
import {
  Network,
  FileText,
  GitBranch,
  ShieldQuestion,
  Gauge,
  Maximize2,
  RefreshCw,
  X,
  Layers,
  Activity,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import {
  cn,
  formatNumber,
  formatPct,
} from '@/lib/api';
import type { GraphData, GraphLink, GraphNode, GraphStats, NodeType, RelationType } from '@/lib/types';
import { Graph3D } from '@/components/Graph3D';
import { Card, EmptyState, Spinner, StatCard } from '@/components/ui';
import { Badge } from '@/components/Badge';
import type { ToastPush } from '@/hooks/useToasts';

function normalizeType(t?: string): string | undefined {
  if (!t) return undefined;
  const v = String(t).toLowerCase();
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function nodeType(n: GraphNode): NodeType {
  const t = normalizeType((n.type || n.labels?.[0]) as string);
  return (t === 'Document' || t === 'Claim' || t === 'Premise' ? t : 'Premise') as NodeType;
}

function linkType(l: GraphLink): RelationType {
  const t = normalizeType(l.type as string) || normalizeType(l.relation as string) || 'SUPPORTS';
  if (t === 'Contains') return 'CONTAINS';
  return t === 'Contradicts' ? 'CONTRADICTS' : 'SUPPORTS';
}

function linkConf(l: GraphLink): number | undefined {
  const v = (l.confidence ?? (l.properties as { confidence?: number } | undefined)?.confidence) as number | undefined;
  return typeof v === 'number' ? v : undefined;
}

export function GraphExplorerView({ pushToast }: { pushToast: ToastPush }) {
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(true);
  const [fallacyMetrics, setFallacyMetrics] = useState<import('@/lib/types').FallacyBiasMetrics | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [neighbors, setNeighbors] = useState<{ links: GraphLink[]; nodes: GraphNode[] }>({ links: [], nodes: [] });
  const cyRef = useRef<Core | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fitToken, setFitToken] = useState(0);

  // Load stats + graph
  const loadAll = async () => {
    setStatsLoading(true);
    setGraphLoading(true);
    try {
      const s = await apiGet<GraphStats>('/api/graph-stats');
      setStats(s);
    } catch (e) {
      pushToast(`Graph stats failed: ${e instanceof Error ? e.message : 'unknown'}`, 'error');
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
    try {
      const g = await apiGet<GraphData>('/api/graph/visualization');
      setGraph(g);
    } catch (e) {
      pushToast(`Graph fetch failed: ${e instanceof Error ? e.message : 'unknown'}`, 'error');
      setGraph(null);
    } finally {
      setGraphLoading(false);
    }
    try {
      const fb = await apiGet<import('@/lib/types').FallacyBiasMetrics>('/api/graph/fallacy-bias');
      setFallacyMetrics(fb);
    } catch {
      setFallacyMetrics(null);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Elements
  const elements = useMemo<ElementDefinition[]>(() => {
    const nodes = graph?.nodes ?? [];
    const links = graph?.links ?? graph?.edges ?? [];
    const els: ElementDefinition[] = nodes.map((n) => ({
      data: {
        id: String(n.id),
        label: (n.label || n.text || String(n.id)).slice(0, 48),
        fullText: n.text || n.label || '',
        type: nodeType(n),
        confidence: n.confidence,
        document_id: n.document_id,
        document_title: n.document_title,
        raw: n,
      },
    }));
    for (const l of links) {
      const src = String((l.source as unknown as GraphNode | string) ?? '');
      const tgt = String((l.target as unknown as GraphNode | string) ?? '');
      if (!src || !tgt) continue;
      els.push({
        data: {
          id: `${src}->${tgt}`,
          source: src,
          target: tgt,
          type: linkType(l),
          confidence: linkConf(l),
          raw: l,
        },
      });
    }
    return els;
  }, [graph]);

  const idToNode = useMemo(() => {
    const m = new Map<string, GraphNode>();
    (graph?.nodes ?? []).forEach((n) => m.set(String(n.id), n));
    return m;
  }, [graph]);

  // Init cytoscape
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: [
        {
          selector: 'node[type = "Claim"]',
          style: {
            'background-color': '#f59e0b',
            'border-color': '#fcd34d',
            'border-width': 2,
            'background-opacity': 0.9,
            label: 'data(label)',
            color: '#fde68a',
            'font-size': 9,
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'text-max-width': 90,
            'text-wrap': 'ellipsis',
            width: 'mapData(confidence, 0, 1, 18, 34)',
            height: 'mapData(confidence, 0, 1, 18, 34)',
            shape: 'round-rectangle',
            'border-opacity': 0.6,
            'overlay-opacity': 0,
          },
        },
        {
          selector: 'node[type = "Premise"]',
          style: {
            'background-color': '#3b82f6',
            'border-color': '#60a5fa',
            'border-width': 1.5,
            'background-opacity': 0.85,
            label: 'data(label)',
            color: '#bfdbfe',
            'font-size': 8,
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'text-max-width': 80,
            'text-wrap': 'ellipsis',
            width: 'mapData(confidence, 0, 1, 12, 24)',
            height: 'mapData(confidence, 0, 1, 12, 24)',
            shape: 'ellipse',
            'border-opacity': 0.5,
            'overlay-opacity': 0,
          },
        },
        {
          selector: 'node[type = "Document"]',
          style: {
            'background-color': '#64748b',
            'border-color': '#cbd5e1',
            'border-width': 2,
            label: 'data(label)',
            color: '#e2e8f0',
            'font-size': 9,
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'text-max-width': 100,
            'text-wrap': 'ellipsis',
            width: 28,
            height: 28,
            shape: 'round-rectangle',
            'overlay-opacity': 0,
          },
        },
        {
          selector: 'node',
          style: {
            'transition-property': 'background-color, border-color, opacity',
            'transition-duration': '180ms',
          },
        },
        {
          selector: 'edge[type = "SUPPORTS"]',
          style: {
            'line-color': '#10b981',
            'target-arrow-color': '#10b981',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            width: 2,
            'arrow-scale': 1.1,
            'line-opacity': 0.7,
          },
        },
        {
          selector: 'edge[type = "CONTRADICTS"]',
          style: {
            'line-color': '#f43f5e',
            'target-arrow-color': '#f43f5e',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'line-style': 'dashed',
            width: 2,
            'arrow-scale': 1.1,
            'line-opacity': 0.75,
          },
        },
        {
          selector: 'edge[type = "CONTAINS"]',
          style: {
            'line-color': '#94a3b8',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'line-style': 'dotted',
            width: 1,
            'line-opacity': 0.4,
          },
        },
        {
          selector: 'edge',
          style: { 'overlay-opacity': 0 },
        },
        {
          selector: ':selected',
          style: {
            'border-width': 4,
            'border-color': '#fde68a',
            'border-opacity': 1,
          },
        },
        {
          selector: '.faded',
          style: { opacity: 0.12 },
        },
        {
          selector: '.highlighted',
          style: {
            'border-width': 3,
            'border-color': '#ffffff',
            'border-opacity': 0.9,
          },
        },
      ] as unknown as cytoscape.StylesheetCSS[],
      layout: { name: 'cose', animate: true, animationDuration: 600, idealEdgeLength: 90, nodeRepulsion: 9000, padding: 40 } as cytoscape.LayoutOptions,
      wheelSensitivity: 0.18,
      minZoom: 0.25,
      maxZoom: 3,
    });

    cy.on('tap', 'node', (e: EventObject) => {
      const nodeEl = e.target;
      const raw = nodeEl.data('raw') as GraphNode;
      setSelected(raw);
      // compute neighbors
      const links: GraphLink[] = [];
      const neighborIds = new Set<string>();
      const allLinks = graph?.links ?? graph?.edges ?? [];
      const id = String(raw.id);
      allLinks.forEach((l) => {
        const s = String((l.source as unknown as GraphNode | string) ?? '');
        const t = String((l.target as unknown as GraphNode | string) ?? '');
        if (s === id || t === id) {
          links.push(l);
          if (s === id) neighborIds.add(t);
          if (t === id) neighborIds.add(s);
        }
      });
      const nodes: GraphNode[] = [];
      neighborIds.forEach((nid) => {
        const n = idToNode.get(nid);
        if (n) nodes.push(n);
      });
      setNeighbors({ links, nodes });

      // highlight
      cy.elements().removeClass('faded highlighted');
      const connected = nodeEl.closedNeighborhood();
      cy.elements().not(connected).addClass('faded');
      connected.addClass('highlighted');
    });

    cy.on('tap', (e: EventObject) => {
      if (e.target === cy) {
        setSelected(null);
        setNeighbors({ links: [], nodes: [] });
        cy.elements().removeClass('faded highlighted');
      }
    });

    cyRef.current = cy;

    const onResize = () => cy.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cy.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // Update elements
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().remove();
    if (elements.length) {
      cy.add(elements);
      cy.layout({ name: 'cose', animate: true, animationDuration: 500, idealEdgeLength: 90, nodeRepulsion: 9000, padding: 40 } as cytoscape.LayoutOptions).run();
    }
  }, [elements]);

  const selectNode = (node: GraphNode) => {
    const allLinks = graph?.links ?? graph?.edges ?? [];
    const id = String(node.id);
    const links = allLinks.filter((link) => {
      const source = String(link.source ?? '');
      const target = String(link.target ?? '');
      return source === id || target === id;
    });
    const neighborIds = new Set<string>();
    links.forEach((link) => {
      const source = String(link.source ?? '');
      const target = String(link.target ?? '');
      if (source === id) neighborIds.add(target);
      if (target === id) neighborIds.add(source);
    });
    const nodes = (graph?.nodes ?? []).filter((candidate) => neighborIds.has(String(candidate.id)));
    setSelected(node);
    setNeighbors({ links, nodes });
  };

  const clearSelection = () => {
    setSelected(null);
    setNeighbors({ links: [], nodes: [] });
  };

  const downloadExport = async (format: 'markdown' | 'json') => {
    setExporting(true);
    try {
      const url = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/api/graph/export?format=${format}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Export server error (${res.status})`);
      }
      const data = await res.json();
      
      if (format === 'markdown') {
        const mdText = data.markdown || '';
        const blob = new Blob([mdText], { type: 'text/markdown;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = data.filename || 'academic_argument_synthesis.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        pushToast('Markdown synthesis exported successfully!', 'success');
      } else {
        const jsonText = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonText], { type: 'application/json' });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = 'argument_graph_knowledge.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        pushToast('JSON-LD graph exported successfully!', 'success');
      }
    } catch (e) {
      pushToast(`Export failed: ${e instanceof Error ? e.message : 'unknown'}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  const totalNodes = graph?.nodes?.length ?? 0;
  const totalEdges = (graph?.links ?? graph?.edges ?? []).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Graph Explorer</h1>
          <p className="text-sm text-ink-400 mt-1">Interactive argument map — claims, premises, and dialectic relations.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadExport('markdown')}
            className="btn-ghost text-xs flex items-center gap-1.5"
            disabled={exporting}
            title="Export as Academic Markdown Report"
          >
            {exporting && <RefreshCw className="w-3 h-3 animate-spin" />}
            {exporting ? 'Generating...' : 'Export Markdown'}
          </button>
          <button
            onClick={() => downloadExport('json')}
            className="btn-ghost text-xs flex items-center gap-1.5"
            disabled={exporting}
            title="Export as JSON-LD"
          >
            Export JSON
          </button>
          <button onClick={loadAll} className="btn-ghost" disabled={statsLoading || graphLoading}>
            <RefreshCw className={cn('w-4 h-4', (statsLoading || graphLoading) && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Total Docs" value={formatNumber(pickStat(stats, ['total_documents', 'documents']))} icon={<FileText className="w-4 h-4" />} accent="neutral" loading={statsLoading} />
        <StatCard label="Claims" value={formatNumber(pickStat(stats, ['total_claims', 'claims']))} icon={<ShieldQuestion className="w-4 h-4" />} accent="gold" loading={statsLoading} />
        <StatCard label="Premises" value={formatNumber(pickStat(stats, ['total_premises', 'premises']))} icon={<Layers className="w-4 h-4" />} accent="blue" loading={statsLoading} />
        <StatCard label="Relations" value={formatNumber(pickStat(stats, ['total_relations', 'relations']))} icon={<GitBranch className="w-4 h-4" />} accent="emerald" loading={statsLoading} />
        <StatCard label="Avg Confidence" value={formatPct(pickStat(stats, ['avg_confidence', 'average_confidence']))} icon={<Gauge className="w-4 h-4" />} accent="rose" loading={statsLoading} />
      </div>

      {/* Graph + drawer */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
        <Card className="relative overflow-hidden p-0 h-[620px]">
          {/* Toolbar */}
          <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto">
              <Badge variant="gold" icon={ShieldQuestion}>Claim</Badge>
              <Badge variant="info" icon={Layers}>Premise</Badge>
              <Badge variant="ok" icon={GitBranch}>Supports</Badge>
              <Badge variant="error" icon={GitBranch}>Contradicts</Badge>
            </div>
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                className="btn-ghost !py-1.5 !px-2.5"
                onClick={() => setFitToken((token) => token + 1)}
                title="Fit to view"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {graphLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-ink-300">
              <Spinner className="w-8 h-8 text-gold-400" />
              <p className="text-sm">Loading argument graph…</p>
            </div>
          ) : totalNodes === 0 ? (
            <EmptyState
              icon={<Network className="w-7 h-7" />}
              title="No graph data yet"
              message="Ingest documents to populate the argument graph. Then refresh to visualize relations."
              action={
                <button className="btn-primary" onClick={loadAll}>
                  <RefreshCw className="w-4 h-4" /> Reload graph
                </button>
              }
            />
          ) : (
            <Graph3D
              graph={graph ?? { nodes: [], edges: [] }}
              fitToken={fitToken}
              onSelect={selectNode}
              onClearSelection={clearSelection}
            />
          )}

          {/* Footer counter */}
          {!graphLoading && totalNodes > 0 && (
            <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
              <div className="glass px-3 py-1.5 text-[11px] text-ink-300 font-mono">
                {totalNodes} nodes · {totalEdges} edges
              </div>
            </div>
          )}
        </Card>

        {/* Drawer */}
        <div className="xl:sticky xl:top-24 h-fit">
          {selected ? (
            <NodeDetailDrawer
              node={selected}
              links={neighbors.links}
              nodes={neighbors.nodes}
              onClose={() => {
                clearSelection();
              }}
            />
          ) : (
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-ink-700/50 text-ink-300 flex items-center justify-center">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Node Inspector</h3>
                  <p className="text-xs text-ink-400">Select a node to inspect details</p>
                </div>
              </div>
              <p className="text-sm text-ink-300 leading-relaxed">
                Click any node in the graph to view its claim/premise text, confidence score, document origin,
                and connected relations.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2 text-ink-300">
                  <span className="w-3 h-3 rounded-sm bg-gold-500" /> Claim
                </div>
                <div className="flex items-center gap-2 text-ink-300">
                  <span className="w-3 h-3 rounded-full bg-blue-500" /> Premise
                </div>
                <div className="flex items-center gap-2 text-ink-300">
                  <span className="w-4 h-0.5 bg-emerald-400" /> Supports
                </div>
                <div className="flex items-center gap-2 text-ink-300">
                  <span className="w-4 h-0.5 bg-rose-400 border-t-2 border-dashed border-rose-400" /> Contradicts
                </div>
              </div>

              {/* Debate Polarization & Fallacy Heatmap Card */}
              {fallacyMetrics && (
                <div className="mt-6 pt-5 border-t border-white/[0.08]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase font-semibold text-ink-400 tracking-wider">Debate Polarization</span>
                    <Badge variant={fallacyMetrics.polarization_index > 0.6 ? 'ok' : 'gold'}>
                      {fallacyMetrics.status}
                    </Badge>
                  </div>
                  <div className="text-2xl font-bold text-white tabular-nums">
                    {(fallacyMetrics.polarization_index * 100).toFixed(0)}%
                  </div>
                  <p className="text-xs text-ink-400 mt-1 leading-relaxed">
                    {fallacyMetrics.summary}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-xs">
                    <span className="text-emerald-400 font-medium">+{fallacyMetrics.total_supports} supports</span>
                    <span className="text-ink-500">·</span>
                    <span className="text-rose-400 font-medium">-{fallacyMetrics.total_contradicts} contradicts</span>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function NodeDetailDrawer({
  node,
  links,
  nodes,
  onClose,
}: {
  node: GraphNode;
  links: GraphLink[];
  nodes: GraphNode[];
  onClose: () => void;
}) {
  const type = nodeType(node);
  const isClaim = type === 'Claim';
  const supports = links.filter((l) => linkType(l) === 'SUPPORTS');
  const contradicts = links.filter((l) => linkType(l) === 'CONTRADICTS');

  return (
    <Card className="p-6 animate-slide-in">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center',
              isClaim ? 'bg-gold-500/15 text-gold-400' : 'bg-blue-500/15 text-blue-400',
            )}
          >
            {isClaim ? <ShieldQuestion className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white">{isClaim ? 'Claim' : 'Premise'}</h3>
              <Badge variant={isClaim ? 'gold' : 'info'}>{type}</Badge>
            </div>
            <code className="text-[11px] text-ink-400 font-mono">{String(node.id).slice(0, 18)}</code>
          </div>
        </div>
        <button onClick={onClose} className="text-ink-400 hover:text-white p-1 rounded-lg" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold mb-1">Text</div>
          <p className="text-sm text-ink-100 leading-relaxed bg-ink-800/60 rounded-lg p-3 border border-white/[0.05]">
            {node.text || node.label || <span className="text-ink-400 italic">No text available</span>}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-ink-800/60 border border-white/[0.05] p-3">
            <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">Confidence</div>
            <div className="mt-1 flex items-center gap-2">
              <ConfidenceBar value={node.confidence} />
              <span className="text-sm font-semibold text-white tabular-nums">
                {formatPct(node.confidence)}
              </span>
            </div>
          </div>
          <div className="rounded-lg bg-ink-800/60 border border-white/[0.05] p-3">
            <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">Document</div>
            <div className="mt-1 text-sm text-ink-100 truncate" title={node.document_title || node.document_id}>
              {node.document_title || node.document_id || '—'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-emerald-500/5 border border-emerald-400/15 p-3">
            <div className="text-[11px] uppercase tracking-wider text-emerald-300 font-semibold flex items-center gap-1">
              <GitBranch className="w-3 h-3" /> Supports ({supports.length})
            </div>
            <ul className="mt-1.5 space-y-1 text-xs text-ink-300">
              {supports.slice(0, 5).map((l, i) => {
                const other = neighborOf(l, String(node.id), nodes);
                return (
                  <li key={i} className="truncate">
                    → {other?.text || other?.label || otherId(l, String(node.id))}
                  </li>
                );
              })}
              {supports.length === 0 && <li className="text-ink-500 italic">None</li>}
            </ul>
          </div>
          <div className="rounded-lg bg-rose-500/5 border border-rose-400/15 p-3">
            <div className="text-[11px] uppercase tracking-wider text-rose-300 font-semibold flex items-center gap-1">
              <GitBranch className="w-3 h-3" /> Contradicts ({contradicts.length})
            </div>
            <ul className="mt-1.5 space-y-1 text-xs text-ink-300">
              {contradicts.slice(0, 5).map((l, i) => {
                const other = neighborOf(l, String(node.id), nodes);
                return (
                  <li key={i} className="truncate">
                    ⚡ {other?.text || other?.label || otherId(l, String(node.id))}
                  </li>
                );
              })}
              {contradicts.length === 0 && <li className="text-ink-500 italic">None</li>}
            </ul>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ConfidenceBar({ value }: { value?: number }) {
  const v = typeof value === 'number' ? Math.max(0, Math.min(1, value)) : 0;
  const color = v >= 0.75 ? 'bg-emerald-400' : v >= 0.5 ? 'bg-gold-400' : 'bg-rose-400';
  return (
    <div className="flex-1 h-1.5 rounded-full bg-ink-700/60 overflow-hidden">
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

function pickStat(stats: GraphStats | null, keys: string[]): number | undefined {
  if (!stats) return undefined;
  for (const k of keys) {
    const v = stats[k];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
}

function otherId(l: GraphLink, selfId: string): string {
  const s = String((l.source as unknown as GraphNode | string) ?? '');
  const t = String((l.target as unknown as GraphNode | string) ?? '');
  return s === selfId ? t : s;
}

function neighborOf(l: GraphLink, selfId: string, nodes: GraphNode[]): GraphNode | undefined {
  const id = otherId(l, selfId);
  return nodes.find((n) => String(n.id) === id);
}
