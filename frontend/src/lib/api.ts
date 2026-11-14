export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// --- Mock mode toggle (persisted in localStorage) ---
const MOCK_KEY = 'logicgraph:mock-mode';
let mockMode = false;
try {
  const stored = localStorage.getItem(MOCK_KEY);
  mockMode = stored === '1';
} catch {
  /* ignore */
}

export function isMockMode(): boolean {
  return mockMode;
}

export function setMockMode(on: boolean): void {
  mockMode = on;
  try {
    localStorage.setItem(MOCK_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  // notify listeners
  window.dispatchEvent(new CustomEvent('mock-mode-change', { detail: on }));
}

import {
  mockGraph,
  mockHealth,
  mockIngestBatch,
  mockIngestSingle,
  mockStats,
  mockSynthesis,
  mockDocumentDetail,
  mockDocumentList,
  delay,
} from '@/lib/mock';

async function mockRoute<T>(path: string, method: string, body: unknown): Promise<T> {
  // /health
  if (path === '/health') return delay(mockHealth) as Promise<T>;

  if (path === '/api/graph-stats') return delay(mockStats) as Promise<T>;
  if (path.startsWith('/api/graph') && !path.includes('/clear')) return delay(mockGraph) as Promise<T>;

  if (path === '/api/documents') {
    return delay(mockDocumentList()) as Promise<T>;
  }
  if (path.startsWith('/api/document/') && method === 'GET') {
    const id = path.replace('/api/document/', '');
    const d = mockDocumentDetail(id);
    if (!d) throw new ApiError('Document not found', 404);
    return delay(d) as Promise<T>;
  }
  if (path.startsWith('/api/document/') && method === 'DELETE') {
    return delay({ message: 'Document deleted' } as T);
  }
  if (path === '/api/graph/fallacy-bias' && method === 'GET') {
    return delay({
      polarization_index: 0.78,
      status: 'BALANCED_DEBATE',
      summary: 'High polarization with active debate between thesis and antithesis arguments across security and usability.',
      total_supports: 18,
      total_contradicts: 13,
      contested_claims: [
        {
          contested_claim: 'Organizations should mandate hardware security keys for all staff.',
          supporting_count: 5,
          contradicting_count: 3,
          avg_support_conf: 0.88,
          avg_contradict_conf: 0.81,
        },
      ],
      circular_dependencies: [],
    } as T);
  }
  if (path.startsWith('/api/graph/export') && method === 'GET') {
    return delay({
      '@context': 'https://schema.org',
      '@type': 'GraphAnalysisReport',
      nodes: mockGraph.nodes,
      edges: mockGraph.links,
    } as T);
  }
  if (path === '/api/graph/clear' && method === 'DELETE') {
    return delay({ message: 'Graph cleared' } as T);
  }
  if (path === '/api/query' && method === 'POST') {
    return delay({
      search_topic: (body as { search_topic?: string } | null)?.search_topic || 'security',
      total_paths_found: 2,
      supporting_evidence: [
        {
          claim: 'Organizations should require multi-factor authentication for sensitive accounts.',
          evidence: 'Security research shows that an additional authentication factor can prevent many account takeover attacks.',
          relation: 'SUPPORTS',
          confidence: 0.79,
        },
      ],
      contradicting_evidence: [
        {
          claim: 'MFA introduces too much friction for non-critical user access.',
          evidence: 'Usability studies indicate higher drop-off rates when aggressive MFA policies are enforced on low-risk logins.',
          relation: 'CONTRADICTS',
          confidence: 0.72,
        },
      ],
    } as T);
  }
  if (path === '/api/synthesize' && method === 'POST') {
    const topic = (body as { search_topic?: string } | null)?.search_topic || 'security';
    return delay({ ...mockSynthesis, topic }) as Promise<T>;
  }
  if (path === '/api/ingest/file' && method === 'POST') {
    const form = body as FormData;
    const file = form.get('file');
    const name = file instanceof File ? file.name : 'document.txt';
    return delay(mockIngestSingle(name)) as Promise<T>;
  }
  if (path === '/api/ingest/batch' && method === 'POST') {
    const form = body as FormData;
    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    return delay(mockIngestBatch(files)) as Promise<T>;
  }
  // fallback
  throw new ApiError(`No mock handler for ${method} ${path}`, 404);
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
      else if (body?.message) detail = body.message;
    } catch {
      try {
        const txt = await res.text();
        if (txt) detail = txt.slice(0, 200);
      } catch {
        /* ignore */
      }
    }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as unknown as T;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (isMockMode()) return mockRoute<T>(path, 'GET', null);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  return handle<T>(res);
}

export async function apiPostJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  if (isMockMode()) return mockRoute<T>(path, 'POST', body);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  return handle<T>(res);
}

export async function apiPostForm<T>(path: string, form: FormData, signal?: AbortSignal): Promise<T> {
  if (isMockMode()) return mockRoute<T>(path, 'POST', form);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    body: form,
    signal,
  });
  return handle<T>(res);
}

export async function apiDelete<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (isMockMode()) return mockRoute<T>(path, 'DELETE', null);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
    signal,
  });
  return handle<T>(res);
}

export function formatNumber(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatPct(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

export function formatDuration(ms: number | undefined | null): string {
  if (ms === undefined || ms === null || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function timeAgo(iso: string | undefined | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso).getTime();
    const diff = Date.now() - d;
    const s = Math.floor(diff / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return '—';
  }
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
