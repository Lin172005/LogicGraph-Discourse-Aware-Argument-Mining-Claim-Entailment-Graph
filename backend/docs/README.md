# LogicGraph 2.0: Multi-Document Argument Mining System

A production-grade FastAPI backend for extracting, analyzing, and querying argument structures from multi-document corpora using NLI (Natural Language Inference) and Neo4j graph persistence.

## Features

✅ **Multi-Format File Support**

- PDF extraction with robust error handling
- Plain text (TXT) file processing
- Batch multi-file ingestion

✅ **Discourse Analysis**

- Automatic sentence segmentation (spaCy)
- Claim vs. premise identification
- Argumentative structure extraction

✅ **NLI Classification**

- Zero-shot DeBERTa NLI model
- Premise-claim relationship prediction (supports/contradicts/neutral)
- Confidence scoring (0.0-1.0)
- Batch processing with configurable filtering

✅ **Graph Persistence**

- Document-aware Neo4j storage
- Indexed queries for performance
- Support/contradiction relationship tracking
- Metadata and confidence scores

✅ **REST API**

- Single-pair analysis (v1 compatibility)
- File upload endpoints
- Graph querying and search
- Document statistics and retrieval
- Batch processing

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────┐
│                  FastAPI Application                │
├─────────────────────────────────────────────────────┤
│ POST /api/ingest/file      → File upload endpoint   │
│ POST /api/ingest/batch     → Batch processing       │
│ POST /api/analyze-and-ingest → Single pair (v1)     │
│ GET /api/document/:id      → Retrieve document      │
│ POST /api/query            → Search arguments       │
└─────────────────────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────────┐
│                  Services Layer                      │
├──────────────────────────────────────────────────────┤
│ PDFService          │ Extract text from PDFs/TXT     │
│ DiscourseParser     │ Segment & identify claims     │
│ NLIProcessor        │ Classify premise-claim pairs  │
└──────────────────────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────────┐
│              Neo4j Graph Database                    │
├──────────────────────────────────────────────────────┤
│ Document → Claims/Premises → Relations              │
│ (SUPPORTS/CONTRADICTS with confidence scores)       │
└──────────────────────────────────────────────────────┘
```

### Data Model

**Neo4j Schema:**

```
(Document)
  ├─ CONTAINS → (Claim)
  └─ CONTAINS → (Premise)
                 ├─ SUPPORTS {confidence, doc_id} → (Claim)
                 └─ CONTRADICTS {confidence, doc_id} → (Claim)
```

**Entity Attributes:**

- `Document`: `id` (UUID), `title`, `filename`, `created_at`
- `Claim`: `text`
- `Premise`: `text`
- Relations: `confidence` (float), `doc_id` (reference), `created_at`

---

## Installation

### Prerequisites

- Python 3.10+
- Docker & Docker Compose (for containerized deployment)
- 4GB+ RAM (recommended for transformer models)

### Local Setup

1. **Clone and install dependencies:**

```bash
pip install -r requirements.txt
python -m spacy download en_core_web_sm  # Download spaCy model
```

2. **Start Neo4j:**

```bash
# Option A: Docker
docker run -d \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password123 \
  neo4j:5.18.0-community

# Option B: Local installation
# https://neo4j.com/download/community/
```

3. **Run application:**

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Docker Compose Setup

```bash
docker-compose up -d
```

This starts both Neo4j and the FastAPI backend. Access:

- **API**: http://localhost:8000
- **Swagger Docs**: http://localhost:8000/docs
- **Neo4j Console**: http://localhost:7474

---

## API Reference

### 1. Health Check

```http
GET /health
```

**Response:**

```json
{
  "status": "ok",
  "service": "LogicGraph Backend",
  "version": "2.0.0"
}
```

---

### 2. Ingest Single File

```http
POST /api/ingest/file
Content-Type: multipart/form-data

file: <PDF or TXT file>
document_title: "Optional Custom Title" (optional)
confidence_threshold: 0.60 (optional, default 0.60)
```

**cURL Example:**

```bash
curl -X POST "http://localhost:8000/api/ingest/file" \
  -F "file=@argument_paper.pdf" \
  -F "document_title=Academic Paper on AI Ethics" \
  -F "confidence_threshold=0.60"
```

**Response:**

```json
{
  "status": "success",
  "document_id": "550e8400-e29b-41d4-a716-446655440000",
  "document_title": "Academic Paper on AI Ethics",
  "filename": "argument_paper.pdf",
  "total_sentences": 42,
  "extracted_pairs": 126,
  "stored_relations": 89,
  "processing_time_ms": 3245.67
}
```

---

### 3. Batch File Ingestion

```http
POST /api/ingest/batch
Content-Type: multipart/form-data

files: <multiple PDF/TXT files>
confidence_threshold: 0.60 (optional)
```

**Response:**

```json
{
  "status": "completed",
  "total_files": 3,
  "successful": 3,
  "failed": 0,
  "results": [
    { "status": "success", "document_id": "...", ... },
    { "status": "success", "document_id": "...", ... },
    { "status": "success", "document_id": "...", ... }
  ],
  "total_processing_time_ms": 9876.54
}
```

---

### 4. Get Document Statistics

```http
GET /api/document/{document_id}/stats
```

**Response:**

```json
{
  "document_id": "550e8400-e29b-41d4-a716-446655440000",
  "document_title": "Academic Paper on AI Ethics",
  "filename": "argument_paper.pdf",
  "claims_count": 12,
  "premises_count": 30,
  "relations_count": 89,
  "average_confidence": 0.7542
}
```

---

### 5. Retrieve Document Arguments

```http
GET /api/document/{document_id}
```

**Response:**

```json
{
  "document_id": "550e8400-e29b-41d4-a716-446655440000",
  "argument_pairs": [
    {
      "claim": "AI systems should have explainability requirements.",
      "evidence": "Studies show that transparent AI improves user trust.",
      "relation": "SUPPORTS",
      "confidence": 0.85
    },
    {
      "claim": "AI systems should have explainability requirements.",
      "evidence": "Some proprietary algorithms are intentionally opaque.",
      "relation": "CONTRADICTS",
      "confidence": 0.72
    }
  ],
  "total_pairs": 89
}
```

---

### 6. Search Arguments by Topic

```http
POST /api/query
Content-Type: application/json

{
  "search_topic": "explainability"
}
```

**Response:**

```json
{
  "search_topic": "explainability",
  "total_paths_found": 24,
  "supporting_evidence": [
    {
      "claim": "AI systems should have explainability requirements.",
      "evidence": "Studies show that transparent AI improves user trust.",
      "relation": "SUPPORTS",
      "confidence": 0.85
    }
  ],
  "contradicting_evidence": [
    {
      "claim": "AI systems should have explainability requirements.",
      "evidence": "Some proprietary algorithms are intentionally opaque.",
      "relation": "CONTRADICTS",
      "confidence": 0.72
    }
  ]
}
```

---

### 7. Get Overall Graph Statistics

```http
GET /api/graph-stats
```

**Response:**

```json
{
  "total_documents": 5,
  "total_claims": 67,
  "total_premises": 234,
  "total_relations": 456,
  "average_confidence": 0.7234
}
```

---

### 8. Retrieve Full Graph (Limited)

```http
GET /api/graph?limit=1000
```

**Response:**

```json
{
  "edges": [
    {
      "source": "AI should be transparent",
      "source_label": "Claim",
      "relation": "SUPPORTS",
      "confidence": 0.85,
      "target": "Transparency builds trust",
      "target_label": "Premise"
    }
  ],
  "total_edges": 156,
  "limit": 1000
}
```

---

## Configuration

### Environment Variables

Create a `.env` file:

```env
# Neo4j Configuration
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password123

# Application Settings
LOG_LEVEL=INFO
PYTHONUNBUFFERED=1
```

### NLI Model Configuration

The system uses `cross-encoder/nli-deberta-v3-xsmall` (384MB, fast inference).

To use a different model, edit `services/nli_processor.py`:

```python
MODEL_NAME = "cross-encoder/nli-deberta-v3-large"  # Larger, more accurate
# or
MODEL_NAME = "cross-encoder/nli-roberta-base"  # Alternative
```

---

## Performance Tuning

### For Large Documents (>50 pages)

**Increase batch size in main.py:**

```python
await ingest_file(
    file=file,
    confidence_threshold=0.65  # Higher threshold = fewer stored relations
)
```

**Adjust discourse parsing:**

```python
discourse_parser = DiscourseParser(
    nlp,
    min_sentence_length=15  # Skip very short sentences
)
```

### Neo4j Performance

In `docker-compose.yml`, adjust memory settings:

```yaml
environment:
  - NEO4J_dbms_memory_heap_maxSize=4G
  - NEO4J_dbms_memory_pagecache_size=2G
```

---

## Testing

### Unit Tests Example

```python
# test_nli_processor.py
from services.nli_processor import NLIProcessor

processor = NLIProcessor()

# Test single pair
result = processor.classify_single_pair(
    claim="AI systems should be transparent",
    evidence="Transparency improves user trust"
)
print(result)
# Output: {'relation': 'SUPPORTS', 'confidence': 0.85, ...}

# Test batch
pairs = [
    ("Evidence 1", "Claim A"),
    ("Evidence 2", "Claim B"),
]
results = processor.classify_batch(pairs)
print(f"Processed {len(results)} pairs")
```

---

## Troubleshooting

### Issue: "Model not found" error

**Solution:** Download model manually:

```bash
python -c "from transformers import AutoTokenizer; AutoTokenizer.from_pretrained('cross-encoder/nli-deberta-v3-xsmall')"
```

### Issue: Neo4j connection refused

**Solution:** Check Neo4j is running and accessible:

```bash
cypher-shell -a bolt://localhost:7687 -u neo4j -p password123 "RETURN 1"
```

### Issue: Out of memory on GPU

**Solution:** Use CPU instead in `services/nli_processor.py`:

```python
processor = NLIProcessor(use_gpu=False)
```

### Issue: Slow PDF extraction

**Solution:** Increase `min_text_length` in `PDFService` to skip noise:

```python
pdf_service = PDFService(min_text_length=20)
```

---

## Production Deployment

### Using Gunicorn

```bash
pip install gunicorn
gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:8000
```

### Using Docker

```bash
docker build -t logicgraph:latest .
docker run -p 8000:8000 \
  -e NEO4J_URI=bolt://neo4j:7687 \
  logicgraph:latest
```

### Kubernetes Deployment

See `k8s/deployment.yaml` for Kubernetes manifests.

---

## Development Roadmap

- [ ] Support for multilingual documents (German, Spanish, French)
- [ ] Advanced NER for entity extraction
- [ ] Visualization dashboard (D3.js or Cytoscape)
- [ ] Ray-based distributed processing for massive corpora
- [ ] Fine-tuned NLI models for domain-specific tasks
- [ ] Database migration tools (Neo4j → other backends)

---

## Performance Metrics

**Benchmark Results (on single RTX 3090):**

- Single PDF (~10 pages): ~15-30 seconds
- 100 premise-claim pairs: ~5-8 seconds
- Graph query (1000 nodes): <1 second

**Memory Usage:**

- Model loading: ~2GB
- Per document (10 pages): ~500MB peak
- Idle state: ~1.5GB

---

## Citation & Contribution

If you use LogicGraph in research, please cite:

```bibtex
@software{logicgraph2024,
  title={LogicGraph: Multi-Document Argument Mining via NLI},
  author={Your Name},
  year={2024},
  url={https://github.com/yourrepo/logicgraph}
}
```

Contributions welcome! Open an issue or PR for bugs, features, or optimizations.

---

## License

MIT License. See LICENSE file for details.

---

## Support

- **Documentation**: Full API docs at `/docs` (Swagger UI)
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Email**: support@logicgraph.dev

---

**Version**: 2.0.0  
**Last Updated**: September 2024  
**Maintainer**: Disha (SRMIST M.Tech AI)
