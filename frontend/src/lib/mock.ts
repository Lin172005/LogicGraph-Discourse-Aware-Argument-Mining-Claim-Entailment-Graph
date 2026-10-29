import type {
  DocumentDetail,
  DocumentListResponse,
  DocumentSummary,
  GraphData,
  GraphLink,
  GraphNode,
  GraphStats,
  HealthResponse,
  IngestBatchResponse,
  IngestSingleResponse,
  SynthesisResponse,
} from '@/lib/types';

// Simulated network latency
const LATENCY_MIN = 280;
const LATENCY_MAX = 700;

function delay<T>(value: T): Promise<T> {
  const ms = LATENCY_MIN + Math.random() * (LATENCY_MAX - LATENCY_MIN);
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function failAfter<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export const mockHealth: HealthResponse = {
  status: 'ok',
  service: 'LogicGraph Engine',
  version: '1.4.2',
  uptime: '14d 3h',
  documents_indexed: 6,
};

export const mockStats: GraphStats = {
  total_documents: 6,
  documents: 6,
  total_claims: 14,
  claims: 14,
  total_premises: 22,
  premises: 22,
  total_relations: 31,
  relations: 31,
  avg_confidence: 0.81,
  average_confidence: 0.81,
};

const docs: DocumentSummary[] = [
  { document_id: 'doc-zero-trust', title: 'Zero Trust Architecture Principles', filename: 'zero-trust-architecture.md', sentences: 18, claims: 4, premises: 7, relations: 9, created_at: iso(-2, 14), status: 'processed' },
  { document_id: 'doc-passwords', title: 'The Case Against Mandatory Password Rotation', filename: 'password-rotation.txt', sentences: 14, claims: 3, premises: 5, relations: 6, created_at: iso(-3, 8), status: 'processed' },
  { document_id: 'doc-encryption', title: 'End-to-End Encryption and Public Safety', filename: 'e2e-encryption.pdf', sentences: 20, claims: 4, premises: 6, relations: 8, created_at: iso(-5, 2), status: 'processed' },
  { document_id: 'doc-mfa', title: 'Multi-Factor Authentication Effectiveness', filename: 'mfa-study.md', sentences: 12, claims: 2, premises: 4, relations: 4, created_at: iso(-8, 6), status: 'processed' },
  { document_id: 'doc-quantum', title: 'Quantum Threats to Cryptographic Systems', filename: 'quantum-threats.txt', sentences: 16, claims: 3, premises: 5, relations: 7, created_at: iso(-12, 11), status: 'processed' },
  { document_id: 'doc-supply', title: 'Supply Chain Security in Open Source', filename: 'supply-chain.md', sentences: 10, claims: 2, premises: 3, relations: 3, created_at: iso(-15, 3), status: 'processed' },
];

// Build a connected argument graph around the "security" topic.
const n = (id: string, text: string, type: 'Claim' | 'Premise', confidence: number, docId: string, docTitle: string): GraphNode => ({
  id,
  text,
  type,
  confidence,
  document_id: docId,
  document_title: docTitle,
});

const l = (source: string, target: string, type: 'SUPPORTS' | 'CONTRADICTS', confidence: number): GraphLink => ({
  source,
  target,
  type,
  confidence,
});

export const mockGraph: GraphData = {
  nodes: [
    // Zero trust
    n('c-zt', 'A zero trust architecture meaningfully reduces lateral movement risk.', 'Claim', 0.92, 'doc-zero-trust', 'Zero Trust Architecture Principles'),
    n('p-zt1', 'Every request must be authenticated and authorized regardless of network location.', 'Premise', 0.88, 'doc-zero-trust', 'Zero Trust Architecture Principles'),
    n('p-zt2', 'Implicit trust based on network perimeter is obsolete in cloud environments.', 'Premise', 0.85, 'doc-zero-trust', 'Zero Trust Architecture Principles'),
    n('p-zt3', 'Micro-segmentation limits blast radius once an asset is compromised.', 'Premise', 0.79, 'doc-zero-trust', 'Zero Trust Architecture Principles'),
    n('c-zt2', 'Zero trust is impractical for legacy systems without significant retrofitting.', 'Claim', 0.71, 'doc-zero-trust', 'Zero Trust Architecture Principles'),
    // Passwords
    n('c-pw', 'Mandatory password rotation weakens overall security rather than strengthening it.', 'Claim', 0.83, 'doc-passwords', 'The Case Against Mandatory Password Rotation'),
    n('p-pw1', 'Users compensate for forced complexity by reusing predictable patterns.', 'Premise', 0.81, 'doc-passwords', 'The Case Against Mandatory Password Rotation'),
    n('p-pw2', 'Frequent resets increase helpdesk burden and credential fatigue.', 'Premise', 0.74, 'doc-passwords', 'The Case Against Mandatory Password Rotation'),
    n('c-pw2', 'Periodic rotation remains valuable when paired with breach detection.', 'Claim', 0.68, 'doc-passwords', 'The Case Against Mandatory Password Rotation'),
    // Encryption
    n('c-e2e', 'End-to-end encryption is essential for protecting fundamental privacy rights.', 'Claim', 0.9, 'doc-encryption', 'End-to-End Encryption and Public Safety'),
    n('p-e2e1', 'Encryption backdoors are inevitably exploitable by adversaries.', 'Premise', 0.86, 'doc-encryption', 'End-to-End Encryption and Public Safety'),
    n('p-e2e2', 'Lawful access cannot be guaranteed without weakening the entire cryptographic chain.', 'Premise', 0.78, 'doc-encryption', 'End-to-End Encryption and Public Safety'),
    n('c-e2e2', 'Exceptional access mechanisms can be designed safely for targeted investigations.', 'Claim', 0.62, 'doc-encryption', 'End-to-End Encryption and Public Safety'),
    // MFA
    n('c-mfa', 'Mandatory multi-factor authentication reduces account takeover by over 90%.', 'Claim', 0.89, 'doc-mfa', 'Multi-Factor Authentication Effectiveness'),
    n('p-mfa1', 'Phishing-resistant factors (FIDO2) outperform SMS one-time codes.', 'Premise', 0.84, 'doc-mfa', 'Multi-Factor Authentication Effectiveness'),
    n('p-mfa2', 'MFA fatigue attacks exploit push-based prompts with repeated requests.', 'Premise', 0.73, 'doc-mfa', 'Multi-Factor Authentication Effectiveness'),
    // Quantum
    n('c-q', 'Post-quantum cryptography migration must begin before quantum computers mature.', 'Claim', 0.8, 'doc-quantum', 'Quantum Threats to Cryptographic Systems'),
    n('p-q1', 'Harvest-now-decrypt-later attacks endanger data with long confidentiality horizons.', 'Premise', 0.82, 'doc-quantum', 'Quantum Threats to Cryptographic Systems'),
    n('p-q2', 'NIST-standardized lattice schemes provide a viable transition path today.', 'Premise', 0.76, 'doc-quantum', 'Quantum Threats to Cryptographic Systems'),
    // Supply chain
    n('c-sc', 'Open source supply chain attacks represent the dominant emerging threat vector.', 'Claim', 0.77, 'doc-supply', 'Supply Chain Security in Open Source'),
    n('p-sc1', 'Transitive dependencies vastly outnumber first-party code in modern applications.', 'Premise', 0.8, 'doc-supply', 'Supply Chain Security in Open Source'),
    n('p-sc2', 'Signed build provenance (SLSA) mitigates the most common injection vectors.', 'Premise', 0.72, 'doc-supply', 'Supply Chain Security in Open Source'),
  ],
  links: [
    l('p-zt1', 'c-zt', 'SUPPORTS', 0.9),
    l('p-zt2', 'c-zt', 'SUPPORTS', 0.86),
    l('p-zt3', 'c-zt', 'SUPPORTS', 0.78),
    l('c-zt2', 'c-zt', 'CONTRADICTS', 0.71),
    l('p-e2e2', 'c-zt2', 'SUPPORTS', 0.6),
    l('p-pw1', 'c-pw', 'SUPPORTS', 0.83),
    l('p-pw2', 'c-pw', 'SUPPORTS', 0.76),
    l('c-pw2', 'c-pw', 'CONTRADICTS', 0.68),
    l('p-pw1', 'c-pw2', 'CONTRADICTS', 0.55),
    l('p-e2e1', 'c-e2e', 'SUPPORTS', 0.88),
    l('p-e2e2', 'c-e2e', 'SUPPORTS', 0.79),
    l('c-e2e2', 'c-e2e', 'CONTRADICTS', 0.62),
    l('p-e2e1', 'c-e2e2', 'CONTRADICTS', 0.81),
    l('p-mfa1', 'c-mfa', 'SUPPORTS', 0.85),
    l('p-mfa2', 'c-mfa', 'CONTRADICTS', 0.6),
    l('p-q1', 'c-q', 'SUPPORTS', 0.83),
    l('p-q2', 'c-q', 'SUPPORTS', 0.77),
    l('p-sc1', 'c-sc', 'SUPPORTS', 0.81),
    l('p-sc2', 'c-sc', 'SUPPORTS', 0.74),
    // Cross-document tensions
    l('c-mfa', 'c-pw2', 'SUPPORTS', 0.58),
    l('c-zt', 'c-e2e', 'SUPPORTS', 0.64),
    l('c-q', 'c-e2e2', 'CONTRADICTS', 0.5),
  ],
};

export const mockSynthesis: SynthesisResponse = {
  topic: 'security',
  dialectic_status: 'BALANCED_DEBATE',
  confidence_score: 0.81,
  consensus_points: [
    'Perimeter-based trust models are inadequate for modern distributed systems; identity and context must drive access decisions.',
    'Phishing-resistant authentication factors (FIDO2, hardware keys) substantially outperform weaker channels like SMS one-time codes.',
    'Encryption backdoors intended for lawful access introduce structural weaknesses that adversaries can exploit with high probability.',
    'Post-quantum cryptography migration should begin proactively because harvested ciphertext remains vulnerable to future decryption.',
    'Supply chain integrity depends on verifiable build provenance rather than trust in repository names alone.',
  ],
  contradiction_points: [
    'Whether mandatory password rotation strengthens or weakens security remains disputed — evidence shows it can reduce takeover in breach scenarios while increasing predictable user behavior in steady state.',
    'Exceptional-access proponents argue targeted decryption can be engineered safely, while cryptographers maintain any escrow mechanism is inevitably exploitable.',
    'Zero trust advocates claim it generalizes across architectures, while practitioners report significant retrofitting cost and operational fragility on legacy systems.',
    'MFA reduces account takeover broadly, yet MFA fatigue and push-bombing attacks demonstrate the same second factor can become an attack surface.',
  ],
  dialectic_synthesis:
    'Across the ingested corpus, the security debate converges on a clear trajectory away from implicit, perimeter-based trust toward identity-centric and cryptographically verifiable controls. There is strong consensus that network location is no longer a sufficient trust signal, that phishing-resistant authentication materially outperforms legacy factors, and that cryptographic backdoors cannot be reliably scoped to lawful access alone. The most significant tension concerns the trade-offs of strict zero-trust and authentication regimes on legacy systems and user workflows: the same controls that reduce takeover risk can introduce operational fragility (zero-trust retrofitting), predictable user behavior (forced password rotation), or new attack surfaces (MFA push fatigue). The defensible position emerging from the corpus is not to abandon these controls but to pair them with compensating measures — phased zero-trust rollout, risk-based rather than calendar-based password policy, and number-matching or phishing-resistant MFA — while beginning post-quantum migration against harvest-now-decrypt-later exposure. The remaining open question is whether exceptional access can be engineered safely; the weight of cryptographic evidence in this corpus says no.',
};

export function mockDocumentList(): DocumentListResponse {
  return { documents: docs, total: docs.length };
}

export function mockDocumentDetail(id: string): DocumentDetail | undefined {
  const doc = docs.find((d) => d.document_id === id);
  if (!doc) return undefined;
  const nodes = mockGraph.nodes ?? [];
  const links = mockGraph.links ?? [];
  const sents = nodes.filter((n) => n.document_id === id);
  const rels = links.filter((link) => {
    const s = String(link.source);
    const t = String(link.target);
    return sents.some((sn) => sn.id === s) || sents.some((sn) => sn.id === t);
  });
  return {
    document_id: id,
    title: doc.title,
    filename: doc.filename,
    status: doc.status,
    created_at: doc.created_at,
    sentences: sents.map((s) => ({
      id: s.id,
      text: s.text || '',
      type: s.type,
      confidence: s.confidence,
    })),
    relations: rels.map((r) => ({
      source: String(r.source),
      target: String(r.target),
      type: (r.type as 'SUPPORTS' | 'CONTRADICTS') || 'SUPPORTS',
      confidence: r.confidence,
    })),
    content: sampleBody(doc.title || doc.filename || id),
  };
}

export function mockIngestSingle(filename: string): IngestSingleResponse {
  const sentences = 8 + Math.floor(Math.random() * 14);
  const relations = 4 + Math.floor(Math.random() * 8);
  const ms = 600 + Math.floor(Math.random() * 1200);
  return {
    message: 'Document ingested successfully',
    document_id: `doc-${slug(filename)}-${Math.random().toString(36).slice(2, 6)}`,
    filename,
    parsed_sentences: sentences,
    stored_relations: relations,
    processing_time_ms: ms,
    sentences,
    relations,
    duration_ms: ms,
  };
}

export function mockIngestBatch(files: File[]): IngestBatchResponse {
  const results = files.map((f) => mockIngestSingle(f.name));
  return {
    message: 'Batch ingestion complete',
    total_documents: files.length,
    total_sentences: results.reduce((a, r) => a + (r.parsed_sentences ?? 0), 0),
    total_relations: results.reduce((a, r) => a + (r.stored_relations ?? 0), 0),
    total_processing_time_ms: results.reduce((a, r) => a + (r.processing_time_ms ?? 0), 0),
    results,
    files: results.map((r) => ({ filename: r.filename || '', document_id: r.document_id, sentences: r.parsed_sentences, relations: r.stored_relations })),
  };
}

// --- helpers ---
function iso(daysAgo: number, hoursAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86400000 - hoursAgo * 3600000);
  return d.toISOString();
}

function slug(name: string): string {
  return name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
}

function sampleBody(title: string): string {
  return `${title}\n\nThis document examines the operational and policy dimensions of the position it advocates. It surveys prior literature, presents the central argument, and considers the strongest objections raised by critics. The conclusion offers a measured recommendation that accounts for the residual risks identified throughout the analysis.\n\nNote: This is simulated content generated by LogicGraph's mock mode for demonstration purposes.`;
}

export { delay, failAfter };
