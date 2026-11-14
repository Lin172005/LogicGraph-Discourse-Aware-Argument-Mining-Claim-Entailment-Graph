export interface HealthResponse {
  status: 'ok' | string;
  service?: string;
  version?: string;
  [k: string]: unknown;
}

export interface IngestMetrics {
  processing_time_ms?: number;
  parsed_sentences?: number;
  stored_relations?: number;
  document_id?: string;
  filename?: string;
  sentences?: number;
  relations?: number;
  elapsed_ms?: number;
  duration_ms?: number;
}

export interface IngestSingleResponse extends IngestMetrics {
  message?: string;
  document?: Record<string, unknown>;
}

export interface IngestBatchResponse {
  message?: string;
  total_documents?: number;
  total_sentences?: number;
  total_relations?: number;
  total_processing_time_ms?: number;
  files?: Array<{ filename: string; document_id?: string; sentences?: number; relations?: number }>;
  results?: Array<IngestSingleResponse>;
  summary?: IngestSingleResponse;
}

export type NodeType = 'Document' | 'Claim' | 'Premise' | 'document' | 'claim' | 'premise';
export type RelationType = 'CONTAINS' | 'SUPPORTS' | 'CONTRADICTS' | 'contains' | 'supports' | 'contradicts';

export interface GraphNode {
  id: string;
  label?: string;
  text?: string;
  type?: NodeType;
  confidence?: number;
  document_id?: string;
  document_title?: string;
  labels?: string[];
  sentence_id?: string;
  properties?: Record<string, unknown>;
  [k: string]: unknown;
}
export interface GraphLink {
  source: string;
  target: string;
  type?: RelationType;
  relation?: RelationType;
  confidence?: number;
  label?: string;
  [k: string]: unknown;
}
export interface GraphData {
  nodes?: GraphNode[];
  links?: GraphLink[];
  edges?: GraphLink[];
}

export interface GraphStats {
  total_documents?: number;
  documents?: number;
  total_claims?: number;
  claims?: number;
  total_premises?: number;
  premises?: number;
  total_relations?: number;
  relations?: number;
  avg_confidence?: number;
  average_confidence?: number;
  [k: string]: unknown;
}

export interface QueryResponse {
  search_topic: string;
  total_paths_found: number;
  supporting_evidence: Array<{
    claim: string;
    evidence: string;
    relation: string;
    confidence: number;
  }>;
  contradicting_evidence: Array<{
    claim: string;
    evidence: string;
    relation: string;
    confidence: number;
  }>;
}

export interface DocumentSummary {
  document_id?: string;
  id?: string;
  title?: string;
  filename?: string;
  name?: string;
  sentences?: number;
  claims?: number;
  premises?: number;
  relations?: number;
  created_at?: string;
  ingested_at?: string;
  timestamp?: string;
  status?: string;
  [k: string]: unknown;
}

export interface DocumentListResponse {
  documents?: DocumentSummary[];
  items?: DocumentSummary[];
  total?: number;
  [k: string]: unknown;
}

export interface DocumentDetail {
  document_id?: string;
  id?: string;
  title?: string;
  filename?: string;
  content?: string;
  text?: string;
  sentences?: Array<{ id: string; text: string; type?: NodeType; confidence?: number }>;
  relations?: Array<{ source: string; target: string; type: RelationType; confidence?: number }>;
  metadata?: Record<string, unknown>;
  created_at?: string;
  [k: string]: unknown;
}

export interface SynthesisResponse {
  topic?: string;
  dialectic_status?: string;
  confidence_score?: number;
  consensus_points?: string[];
  contradiction_points?: string[];
  dialectic_synthesis?: string;
  summary?: string;
  [k: string]: unknown;
}

export interface FallacyBiasMetrics {
  polarization_index: number;
  status: 'BALANCED_DEBATE' | 'MODERATE_DIVERGENCE' | 'ECHO_CHAMBER' | string;
  summary: string;
  total_supports: number;
  total_contradicts: number;
  contested_claims: Array<{
    contested_claim: string;
    supporting_count: number;
    contradicting_count: number;
    avg_support_conf: number;
    avg_contradict_conf: number;
  }>;
  circular_dependencies: Array<{
    node_a: string;
    node_b: string;
    rel_a_to_b: string;
    rel_b_to_a: string;
  }>;
}
