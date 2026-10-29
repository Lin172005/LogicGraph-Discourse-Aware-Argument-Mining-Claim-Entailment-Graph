# LogicGraph 2.0 - Quick Start Guide

Get up and running in 5 minutes.

## Option A: Docker Compose (Recommended)

### 1. Prerequisites

- Docker & Docker Compose installed
- ~6GB free disk space

### 2. Start the Stack

```bash
# Clone/download the project
cd logicgraph

# Start services
docker-compose up -d

# Wait for Neo4j to be ready (~30 seconds)
docker-compose logs neo4j | grep "Started"
```

### 3. Verify Setup

```bash
# Check health
curl http://localhost:8000/health

# Expected output:
# {"status":"ok","service":"LogicGraph Backend","version":"2.0.0"}
```

### 4. Access the API

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **API**: http://localhost:8000

### 5. Example: Upload a Document

```bash
# Upload a PDF file
curl -X POST "http://localhost:8000/api/ingest/file" \
  -F "file=@your_document.pdf" \
  -F "document_title=My Paper" \
  -F "confidence_threshold=0.60"

# Response includes document_id
# Save it for later queries!
```

---

## Option B: Local Setup

### 1. Prerequisites

- Python 3.10+
- pip
- Neo4j running locally (Docker or native)

### 2. Install Dependencies

```bash
pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

### 3. Start Neo4j (if using Docker)

```bash
docker run -d \
  -p 7474:7474 \
  -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password123 \
  neo4j:5.18.0-community
```

### 4. Run the API

```bash
uvicorn main:app --reload
```

### 5. Access at http://localhost:8000

---

## Quick API Usage

### Analyze a Single Claim-Evidence Pair

```bash
curl -X POST "http://localhost:8000/api/analyze-and-ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "claim_text": "AI should be transparent",
    "evidence_text": "Transparency improves user trust"
  }'
```

**Response:**

```json
{
  "status": "success",
  "claim": "AI should be transparent",
  "evidence": "Transparency improves user trust",
  "predicted_relation": "SUPPORTS",
  "confidence_score": 0.85
}
```

### Upload and Analyze a Document

```bash
# Create a test file
echo "AI transparency is essential. Studies show that explainable AI builds user trust. However, some proprietary systems intentionally hide their logic." > test.txt

# Upload
curl -X POST "http://localhost:8000/api/ingest/file" \
  -F "file=@test.txt" \
  -F "document_title=AI Ethics Study" \
  -F "confidence_threshold=0.60"
```

**Response includes:**

```json
{
  "status": "success",
  "document_id": "550e8400-e29b-41d4-a716-446655440000",
  "document_title": "AI Ethics Study",
  "total_sentences": 3,
  "extracted_pairs": 3,
  "stored_relations": 2,
  "processing_time_ms": 1234.56
}
```

### Search the Graph

```bash
curl -X POST "http://localhost:8000/api/query" \
  -H "Content-Type: application/json" \
  -d '{"search_topic": "transparency"}'
```

### Get Document Statistics

```bash
curl http://localhost:8000/api/document/550e8400-e29b-41d4-a716-446655440000/stats
```

### Get Overall Graph Stats

```bash
curl http://localhost:8000/api/graph-stats
```

---

## Common Tasks

### View Running Containers

```bash
docker-compose ps
```

### View Neo4j Console

Open browser to: http://localhost:7474

- Username: `neo4j`
- Password: `password123`

### View API Logs

```bash
docker-compose logs backend -f
```

### Stop Services

```bash
docker-compose down
```

### Stop & Clear Data

```bash
docker-compose down -v  # Removes volumes
```

---

## Troubleshooting

### "Connection refused" Error

**Check if services are running:**

```bash
docker-compose ps
```

**If not running, start them:**

```bash
docker-compose up -d
docker-compose logs  # View startup logs
```

### "Model not found" Error

**Download the NLI model manually:**

```bash
python -c "from transformers import AutoTokenizer; AutoTokenizer.from_pretrained('cross-encoder/nli-deberta-v3-xsmall')"
```

### Neo4j Authentication Failed

**Verify Neo4j credentials:**

```bash
# In Neo4j Console (http://localhost:7474)
# Default: neo4j / password123

# Or reset password:
docker-compose down
docker-compose rm neo4j  # Remove container
docker volume rm logicgraph_neo4j_data  # Optional: remove data
docker-compose up -d
```

### Out of Memory Error

**Increase Docker memory:**

```bash
# Edit docker-compose.yml
# Add to backend service:
#   deploy:
#     resources:
#       limits:
#         memory: 4G
```

### Slow Processing

**Adjust confidence threshold:**

```bash
# Higher threshold = fewer stored relations = faster processing
curl -X POST "http://localhost:8000/api/ingest/file" \
  -F "file=@large_document.pdf" \
  -F "confidence_threshold=0.75"  # More selective
```

---

## Next Steps

1. **Read Full Documentation**: See `README.md`
2. **Run Examples**: `python example_usage.py`
3. **Explore API Docs**: http://localhost:8000/docs
4. **Upload Your Documents**: Start analyzing your own PDFs!

---

## Need Help?

- **API Documentation**: http://localhost:8000/docs
- **GitHub Issues**: GitHub repository
- **Neo4j Browser**: http://localhost:7474

---

## File Structure

```
logicgraph/
├── main.py                 # FastAPI application
├── services/
│   ├── __init__.py
│   ├── pdf_service.py      # PDF/TXT extraction
│   ├── discourse_parser.py # Sentence segmentation
│   └── nli_processor.py    # NLI classification
├── requirements.txt        # Python dependencies
├── Dockerfile              # Container image
├── docker-compose.yml      # Multi-service orchestration
├── .env.example            # Configuration template
├── README.md               # Full documentation
├── QUICKSTART.md           # This file
└── example_usage.py        # Usage examples
```

---

**Version:** 2.0.0  
**Last Updated:** September 2024
