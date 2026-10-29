# LogicGraph 2.0 - System Architecture & Implementation Details

Comprehensive technical documentation of LogicGraph's architecture, design decisions, and implementation strategies.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FastAPI Web Application                          │
├─────────────────────────────────────────────────────────────────────┤
│  • REST API endpoints (file upload, querying, analysis)             │
│  • Request validation (Pydantic models)                             │
│  • Error handling & logging                                         │
│  • Health checks & metrics                                          │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
    ┌─────────────┐ ┌─────────────┐ ┌──────────────┐
    │   PDF       │ │ Discourse   │ │     NLI      │
    │  Service    │ │   Parser    │ │  Processor   │
    │             │ │             │ │              │
    │ • Extract   │ │ • Segment   │ │ • Transform  │
    │ • Clean     │ │ • Identify  │ │ • Classify   │
    │ • Validate  │ │ • Score     │ │ • Batch      │
    └─────────────┘ └─────────────┘ └──────────────┘
        │              │              │
        └──────────────┼──────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │   Neo4j Graph Database        │
        ├──────────────────────────────┤
        │  Document → Claims/Premises   │
        │  Relations with confidence    │
        │  Cypher Query Engine          │
        │  Transaction handling         │
        └──────────────────────────────┘
```

---

## Component Architecture

### 1. FastAPI Application (`main.py`)

**Responsibility**: HTTP request handling, routing, response serialization

**Key Endpoints**:

```python
POST /api/ingest/file           # Upload & process single file
POST /api/ingest/batch          # Process multiple files
GET  /api/document/{id}         # Retrieve document arguments
GET  /api/document/{id}/stats   # Get document statistics
POST /api/query                 # Search graph by topic
GET  /api/graph-stats           # Overall graph metrics
GET  /api/graph                 # Full graph retrieval
```

**Request/Response Flow**:

```
HTTP Request
    ↓
Pydantic Validation (type checking, sanitization)
    ↓
Service Layer Invocation (business logic)
    ↓
Neo4j Persistence (ACID transactions)
    ↓
HTTP Response (JSON serialization)
```

### 2. PDF Service (`services/pdf_service.py`)

**Responsibility**: Extract clean text from PDF/TXT files

**Architecture**:

```
Input Bytes (PDF/TXT)
    ↓
Format Detection (file type)
    ↓
Extraction:
    - pypdf.PdfReader for PDFs (multi-page)
    - UTF-8 decoding for TXT (with fallback encodings)
    ↓
Text Cleaning:
    - Remove duplicates
    - Normalize whitespace
    - Filter noise (page numbers, headers, footers)
    ↓
Validation:
    - Minimum text length check
    - Non-empty content verification
    ↓
Output: Clean Text String
```

**Key Methods**:

```python
extract_text_from_pdf(pdf_bytes) → str
extract_text_from_txt(txt_bytes) → str
_clean_text(text) → str
_is_artifact_line(line) → bool
```

**Error Handling**:

- Graceful encoding fallback (latin-1, cp1252)
- Empty page skipping
- Detailed logging for debugging

### 3. Discourse Parser (`services/discourse_parser.py`)

**Responsibility**: Segment text and identify argumentative structure

**Two-Stage Process**:

**Stage 1: Sentence Segmentation**

```
Raw Text
    ↓
spaCy NLP Pipeline (en_core_web_sm)
    ↓
Sentence Iterator (Doc.sents)
    ↓
Filtering:
    - Min length (10 chars)
    - Valid sentence checks
    - Artifact detection
    ↓
Output: List[str] sentences
```

**Stage 2: Claim/Premise Identification**

```
Sentences
    ↓
Score Each Sentence:
    1. Position Factor (0.0-1.0)
       - Early sentences more likely to be claims
    2. Indicator Factor
       - Claim indicators: "argue", "claim", "therefore"
       - Premise indicators: "because", "since", "evidence"
    3. Length Factor (15-100 words optimal)
    4. Syntax Factor (questions less likely to be claims)
    5. Certainty Factor (certain verbs boost score)
    ↓
Total Score = 0.3×position + 0.4×indicators + 0.2×certainty + ...
    ↓
Sort by Score (descending)
    ↓
Top N → Claims
Remaining → Premises
```

**Scoring Formula**:

```python
score = 0.0
score += max(0.3, 1.0 - (position / total)) * 0.3  # Position
score += 0.4 if has_claim_indicator else 0         # Indicators
score -= 0.3 if has_premise_indicator else 0
score += 0.2 if 15 <= words <= 100 else 0          # Length
score -= 0.4 if ends_with_question else 0
score += 0.2 if has_certainty_verb else 0
score = max(0.0, min(1.0, score))                  # Clamp
```

**Validation Heuristics**:

- Reject questions (end with ?)
- Reject imperatives ("Please", "See")
- Reject pure citations/numbers
- Reject single-word sentences
- Min 5 words required

### 4. NLI Processor (`services/nli_processor.py`)

**Responsibility**: Classify premise-claim relationships using transformer model

**Model**: `cross-encoder/nli-deberta-v3-xsmall`

- 40M parameters (~384MB)
- Fast inference (50-100 pairs/sec on CPU)
- Cross-encoder architecture (better for ranking)
- Zero-shot NLI task

**Classification Pipeline**:

```
Premise: "AI transparency improves trust"
Claim: "AI systems should be transparent"
    ↓
Template Formatting:
  "This evidence [LABEL] the claim: 'AI systems should be transparent'"
    ↓
Transformer Inference (3 candidate labels):
  - "supports"
  - "contradicts"
  - "is unrelated to"
    ↓
Output Logits → Softmax → Probabilities
    ↓
Max Probability → Relation Type
    ↓
Confidence = probability of predicted label
    ↓
Output: {
  "relation": "SUPPORTS" | "CONTRADICTS" | "NEUTRAL",
  "confidence": 0.0-1.0,
  "raw_scores": {label: score, ...}
}
```

**Batch Processing**:

```python
def classify_batch(pairs: List[Tuple[str, str]], batch_size=8):
    """Process multiple pairs efficiently"""
    results = []
    for batch in chunked(pairs, batch_size):
        for premise, claim in batch:
            # Single classification (models handle batching)
            result = classify_single_pair(premise, claim)
            results.append((premise, claim, result))
    return results
```

**Lazy Loading**:

```python
class NLIProcessor:
    _pipeline = None  # Loaded on first use
    _tokenizer = None

    def _get_pipeline(self):
        if self._pipeline is None:
            self._pipeline = pipeline(
                "zero-shot-classification",
                model=MODEL_NAME,
                tokenizer=tokenizer,
                device=-1  # CPU: -1, GPU: 0
            )
        return self._pipeline
```

---

## Data Flow Architecture

### End-to-End File Processing

```
User Upload
    │
    ├─ Validate File (type, size)
    │
    ├─ Extract Text (PDFService)
    │   └─ Raw Text → Cleaned Text
    │
    ├─ Parse Discourse (DiscourseParser)
    │   ├─ Segment Sentences
    │   └─ Identify Claims & Premises
    │
    ├─ Classify Relationships (NLIProcessor)
    │   ├─ Generate Premise-Claim Pairs
    │   ├─ Run NLI Classification (Batch)
    │   └─ Filter by Confidence Threshold
    │
    ├─ Persist to Neo4j
    │   ├─ Create Document Node
    │   ├─ Create Claim/Premise Nodes
    │   ├─ Create Relations (SUPPORTS/CONTRADICTS)
    │   └─ Create CONTAINS relationships
    │
    └─ Return Response
        └─ IngestionResponse (document_id, stats)
```

### Neo4j Persistence

**Cypher Query for Ingestion**:

```cypher
MERGE (d:Document {
    id: $doc_id,
    title: $title,
    filename: $filename,
    created_at: timestamp()
})

MERGE (c:Claim {text: $claim_text})
MERGE (p:Premise {text: $evidence_text})

MERGE (d)-[:CONTAINS]->(c)
MERGE (d)-[:CONTAINS]->(p)

MERGE (p)-[r:SUPPORTS {
    confidence: $confidence,
    doc_id: $doc_id,
    created_at: timestamp()
}]->(c)

RETURN r
```

**Graph Schema**:

```
Indices:
  - Document(id) - unique constraint
  - Claim(text) - for full-text search
  - Premise(text)

Relations:
  - (Premise)-[:SUPPORTS {confidence}]->(Claim)
  - (Premise)-[:CONTRADICTS {confidence}]->(Claim)
  - (Document)-[:CONTAINS]->(Claim|Premise)
```

---

## Performance Optimizations

### 1. Lazy Model Loading

Models loaded only when first used:

```python
classifier = get_nli_pipeline()  # First call: loads (1-2s)
classifier = get_nli_pipeline()  # Subsequent: cached (<1ms)
```

### 2. Batch NLI Processing

Instead of:

```python
# Slow: separate calls for each pair
for premise, claim in pairs:
    classify(premise, claim)  # 100 pairs = 100 API calls
```

Use:

```python
# Fast: batch processing
classify_batch(pairs)  # Transformer can process multiple at once
```

### 3. Database Indexing

```python
# Indices speed up queries by 10-100x
CREATE INDEX FOR (d:Document) ON (d.id)
CREATE INDEX FOR (c:Claim) ON (c.text)
```

### 4. Confidence Filtering

```python
# Skip storing low-confidence relations
if confidence >= threshold:  # e.g., 0.60
    store_relation()
```

### 5. Connection Pooling

```python
driver = GraphDatabase.driver(
    uri,
    auth=(user, password),
    max_pool_size=200  # Reuse connections
)
```

---

## Error Handling Strategy

### Application Level

```python
try:
    result = analyze_document()
except HTTPException:
    raise  # Re-raise HTTP errors
except ValueError as e:
    raise HTTPException(status_code=400, detail=str(e))
except Exception as e:
    logger.error(f"Unexpected error: {e}", exc_info=True)
    raise HTTPException(status_code=500, detail="Internal server error")
```

### Service Level

```python
# PDFService
if not text or text.strip() == "":
    raise ValueError("No text extracted from PDF")

# DiscourseParser
if not sentences:
    return [], []  # Empty lists, not error

# NLIProcessor
if confidence < threshold:
    skip_this_result()  # Silent filtering
```

### Database Level

```python
# Neo4j transactions
try:
    session.run(cypher_query)
except Exception as e:
    logger.warning(f"Failed to store relation: {e}")
    continue  # Skip individual relation, continue processing
```

---

## Scalability Considerations

### Horizontal Scaling

```
Load Balancer (nginx)
    │
    ├─ API Instance 1
    ├─ API Instance 2
    └─ API Instance 3

Neo4j (shared state)
    └─ Single instance (can cluster for HA)
```

**Stateless Design**: Each API instance is identical, requests can be routed to any instance.

### Vertical Scaling

For single-instance deployments:

```python
# Increase workers
uvicorn main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker

# Increase resources
NEO4J_dbms_memory_heap_maxSize=8G  # Increase DB memory
```

### Caching Strategy

```python
# Cache NLI model in memory (lazy loaded)
_nli_pipeline = None

def get_nli_pipeline():
    global _nli_pipeline
    if _nli_pipeline is None:
        _nli_pipeline = load_model()  # One-time cost
    return _nli_pipeline
```

### Batch Processing

```python
# Process 1000 pairs more efficiently than 1000 individual calls
results = nli_processor.classify_batch(
    pairs=all_pairs,
    batch_size=16  # Process 16 at a time
)
```

---

## Security Architecture

### Input Validation

```python
class AnalysisRequest(BaseModel):
    claim_text: str = Field(..., max_length=1000)
    evidence_text: str = Field(..., max_length=1000)
    # Pydantic validates before reaching handler
```

### File Upload Security

```python
# Whitelist file types
if file_extension not in ['pdf', 'txt']:
    raise HTTPException(status_code=400, ...)

# Limit file size
if len(content) > MAX_FILE_SIZE:
    raise HTTPException(status_code=413, ...)
```

### Database Credentials

```python
# Never hardcode
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")  # From environment

# Use parameterized queries
session.run(
    "MERGE (n:Node {id: $id})",
    id=user_input  # Parameter, not string concat
)
```

---

## Testing Strategy

### Unit Tests

```python
# Test individual components in isolation
test_pdf_extraction()
test_sentence_segmentation()
test_nli_classification()
```

### Integration Tests

```python
# Test complete pipeline
test_full_pipeline()  # file → text → claims → NLI → DB
```

### Performance Tests

```python
# Test with real data sizes
test_large_batch_classification()  # 1000+ pairs
test_text_cleaning_performance()   # Large documents
```

### End-to-End Tests

```python
# Test via HTTP API
curl -X POST http://localhost:8000/api/ingest/file -F "file=@test.pdf"
```

---

## Configuration Management

### Environment Variables

```bash
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=secure-password
LOG_LEVEL=INFO
NLI_MODEL_NAME=cross-encoder/nli-deberta-v3-xsmall
USE_GPU=false
```

### Settings Per Environment

```python
# Production
CONFIDENCE_THRESHOLD = 0.70  # More selective
BATCH_SIZE = 16              # Larger batches
LOG_LEVEL = WARNING           # Less verbose

# Development
CONFIDENCE_THRESHOLD = 0.50   # Less selective
BATCH_SIZE = 2                # Smaller batches
LOG_LEVEL = DEBUG             # Verbose
```

---

## Deployment Topology

### Single Instance (Development)

```
FastAPI + NLI Model + Neo4j (all on one machine)
```

### Clustered (Production)

```
Load Balancer
    ├─ FastAPI Instance 1
    ├─ FastAPI Instance 2
    └─ FastAPI Instance 3

Neo4j Cluster
    ├─ Primary
    └─ Replicas (read-only)
```

### Kubernetes (Enterprise)

```
Ingress
    │
Service (logicgraph-api) → Deployment (3 replicas)
    │
StatefulSet (neo4j) with PVC
```

---

## Technology Choices & Rationale

| Component        | Choice               | Reason                                    |
| ---------------- | -------------------- | ----------------------------------------- |
| Web Framework    | FastAPI              | Modern, async, auto-docs, validation      |
| NLI Model        | DeBERTa-v3-xsmall    | Balance of speed/accuracy                 |
| Database         | Neo4j                | Graph structure, relationships, traversal |
| Text Extraction  | pypdf                | Robust, actively maintained               |
| NLP              | spaCy                | Fast, accurate, lightweight               |
| Transformers     | HuggingFace          | State-of-the-art, easy integration        |
| Containerization | Docker               | Reproducibility, scaling                  |
| Orchestration    | Docker Compose + K8s | Flexibility for different scales          |

---

## Future Enhancements

1. **Distributed Processing**: Ray for large-scale processing
2. **Multilingual Support**: Models for other languages
3. **Fine-tuning**: Domain-specific NLI model training
4. **Visualization**: Graph visualization dashboard
5. **Advanced NER**: Entity extraction for better grounding
6. **Fact Verification**: Integration with fact-checking systems
7. **Real-time Streaming**: WebSocket for live analysis

---

**Version:** 2.0.0  
**Last Updated:** September 2024
**Author**: Disha (SRMIST M.Tech AI)
