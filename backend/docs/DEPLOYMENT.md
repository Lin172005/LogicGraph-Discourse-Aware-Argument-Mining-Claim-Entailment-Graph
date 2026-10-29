# LogicGraph 2.0 - Production Deployment Guide

Comprehensive guide for deploying LogicGraph to production environments.

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Docker Production Build](#docker-production-build)
3. [Docker Swarm Deployment](#docker-swarm-deployment)
4. [Kubernetes Deployment](#kubernetes-deployment)
5. [Cloud Platforms](#cloud-platforms)
6. [Load Testing & Performance](#load-testing--performance)
7. [Monitoring & Logging](#monitoring--logging)
8. [Security Hardening](#security-hardening)

---

## Pre-Deployment Checklist

### System Requirements

- **CPU**: 4+ cores (8+ recommended for production)
- **Memory**: 8GB minimum, 16GB+ recommended
- **Storage**: 50GB for models, 100GB+ for graph database
- **Network**: Stable, low-latency connection
- **Python**: 3.10+
- **Docker**: 20.10+
- **Kubernetes**: 1.24+ (if using K8s)

### Pre-Deployment Tasks

```bash
# 1. Verify all dependencies installed
pip install -r requirements.txt --upgrade

# 2. Download models (prevents startup delays)
python -c "from transformers import AutoTokenizer; AutoTokenizer.from_pretrained('cross-encoder/nli-deberta-v3-xsmall')"
python -m spacy download en_core_web_sm

# 3. Run test suite
pytest test_logicgraph.py -v

# 4. Test Neo4j connectivity
neo4j-admin dbms connectivity-check --username neo4j --password password123

# 5. Load test local setup
python -m locust -f locustfile.py --host=http://localhost:8000
```

---

## Docker Production Build

### 1. Production Dockerfile

The provided multi-stage Dockerfile is already optimized for production:

```dockerfile
# Builds small image (~1.2GB with models)
# Uses Python 3.10-slim base
# Only runtime dependencies included
```

### 2. Build & Tag

```bash
# Build image
docker build -t logicgraph:2.0.0 .

# Tag for registry
docker tag logicgraph:2.0.0 your-registry.azurecr.io/logicgraph:2.0.0

# Push to registry
docker push your-registry.azurecr.io/logicgraph:2.0.0
```

### 3. Production docker-compose

```yaml
version: "3.9"

services:
  neo4j:
    image: neo4j:5.18.0-community
    restart: always
    ports:
      - "7687:7687"
    environment:
      - NEO4J_AUTH=neo4j/${NEO4J_PASSWORD}
      - NEO4J_PLUGINS=apoc
      - NEO4J_dbms_memory_heap_maxSize=4G
      - NEO4J_dbms_memory_pagecache_size=2G
      - NEO4J_dbms_logs_query_enabled=true
      - NEO4J_dbms_logs_query_parameter_logging_enabled=false
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    healthcheck:
      test:
        [
          "CMD",
          "cypher-shell",
          "-u",
          "neo4j",
          "-p",
          "${NEO4J_PASSWORD}",
          "RETURN 1",
        ]
      interval: 30s
      timeout: 10s
      retries: 5

  logicgraph-api:
    image: your-registry.azurecr.io/logicgraph:2.0.0
    restart: always
    ports:
      - "8000:8000"
    environment:
      - NEO4J_URI=bolt://neo4j:7687
      - NEO4J_USER=neo4j
      - NEO4J_PASSWORD=${NEO4J_PASSWORD}
      - LOG_LEVEL=INFO
      - PYTHONUNBUFFERED=1
    depends_on:
      neo4j:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 4G
        reservations:
          cpus: "1"
          memory: 2G
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"

volumes:
  neo4j_data:
  neo4j_logs:
  prometheus_data:

networks:
  default:
    name: logicgraph-net
```

---

## Docker Swarm Deployment

### 1. Initialize Swarm

```bash
docker swarm init
docker node ls
```

### 2. Create Stack Configuration

```yaml
# docker-stack.yml
version: "3.9"

services:
  neo4j:
    image: neo4j:5.18.0-community
    deploy:
      mode: replicated
      replicas: 1
      placement:
        constraints: [node.role == manager]
    environment:
      - NEO4J_AUTH=neo4j/your-secure-password
    volumes:
      - neo4j_data:/data
    networks:
      - logicgraph

  logicgraph-api:
    image: your-registry.azurecr.io/logicgraph:2.0.0
    deploy:
      mode: replicated
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    environment:
      - NEO4J_URI=bolt://neo4j:7687
      - NEO4J_USER=neo4j
      - NEO4J_PASSWORD=your-secure-password
    ports:
      - "8000:8000"
    networks:
      - logicgraph

volumes:
  neo4j_data:
    driver: local

networks:
  logicgraph:
    driver: overlay
```

### 3. Deploy Stack

```bash
docker stack deploy -c docker-stack.yml logicgraph

# Verify deployment
docker stack ls
docker stack services logicgraph
docker service logs logicgraph_logicgraph-api
```

---

## Kubernetes Deployment

### 1. Create Namespace

```bash
kubectl create namespace logicgraph
```

### 2. Neo4j StatefulSet

```yaml
# k8s/neo4j-statefulset.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: neo4j-pvc
  namespace: logicgraph
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: standard
  resources:
    requests:
      storage: 100Gi

---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: neo4j
  namespace: logicgraph
spec:
  serviceName: neo4j
  replicas: 1
  selector:
    matchLabels:
      app: neo4j
  template:
    metadata:
      labels:
        app: neo4j
    spec:
      containers:
        - name: neo4j
          image: neo4j:5.18.0-community
          ports:
            - containerPort: 7687
              name: bolt
            - containerPort: 7474
              name: http
          env:
            - name: NEO4J_AUTH
              value: "neo4j/your-secure-password"
            - name: NEO4J_dbms_memory_heap_maxSize
              value: "4G"
          resources:
            limits:
              memory: "4Gi"
              cpu: "2"
            requests:
              memory: "2Gi"
              cpu: "1"
          volumeMounts:
            - name: neo4j-data
              mountPath: /data
      volumeClaimTemplates:
        - metadata:
            name: neo4j-data
          spec:
            accessModes: ["ReadWriteOnce"]
            storageClassName: standard
            resources:
              requests:
                storage: 100Gi

---
apiVersion: v1
kind: Service
metadata:
  name: neo4j
  namespace: logicgraph
spec:
  clusterIP: None
  selector:
    app: neo4j
  ports:
    - port: 7687
      name: bolt
    - port: 7474
      name: http
```

### 3. LogicGraph Deployment

```yaml
# k8s/logicgraph-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: logicgraph-api
  namespace: logicgraph
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: logicgraph-api
  template:
    metadata:
      labels:
        app: logicgraph-api
    spec:
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: app
                      operator: In
                      values:
                        - logicgraph-api
                topologyKey: kubernetes.io/hostname
      containers:
        - name: logicgraph-api
          image: your-registry.azurecr.io/logicgraph:2.0.0
          imagePullPolicy: Always
          ports:
            - containerPort: 8000
              name: http
          env:
            - name: NEO4J_URI
              value: "bolt://neo4j:7687"
            - name: NEO4J_USER
              value: "neo4j"
            - name: NEO4J_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: neo4j-secret
                  key: password
            - name: LOG_LEVEL
              value: "INFO"
          resources:
            limits:
              memory: "4Gi"
              cpu: "2"
            requests:
              memory: "2Gi"
              cpu: "1"
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 20
            periodSeconds: 5
            timeoutSeconds: 5
            failureThreshold: 2

---
apiVersion: v1
kind: Service
metadata:
  name: logicgraph-api
  namespace: logicgraph
spec:
  type: LoadBalancer
  selector:
    app: logicgraph-api
  ports:
    - protocol: TCP
      port: 8000
      targetPort: 8000
      name: http
```

### 4. Deploy to Kubernetes

```bash
# Create secrets
kubectl create secret generic neo4j-secret \
  --from-literal=password=your-secure-password \
  -n logicgraph

# Apply configurations
kubectl apply -f k8s/neo4j-statefulset.yaml
kubectl apply -f k8s/logicgraph-deployment.yaml

# Verify deployment
kubectl get pods -n logicgraph
kubectl get svc -n logicgraph

# View logs
kubectl logs -f deployment/logicgraph-api -n logicgraph
```

---

## Cloud Platforms

### Azure Container Instances

```bash
az container create \
  --resource-group logicgraph-rg \
  --name logicgraph \
  --image your-registry.azurecr.io/logicgraph:2.0.0 \
  --cpu 2 \
  --memory 4 \
  --port 8000 \
  --environment-variables \
    NEO4J_URI=bolt://neo4j-container:7687 \
    NEO4J_USER=neo4j \
    NEO4J_PASSWORD=your-password
```

### AWS ECS

```bash
# Create task definition
aws ecs register-task-definition \
  --cli-input-json file://ecs-task-definition.json

# Create service
aws ecs create-service \
  --cluster logicgraph-cluster \
  --service-name logicgraph-api \
  --task-definition logicgraph:1 \
  --desired-count 3 \
  --load-balancers targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=logicgraph,containerPort=8000
```

### Google Cloud Run

```bash
gcloud run deploy logicgraph \
  --image gcr.io/your-project/logicgraph:2.0.0 \
  --platform managed \
  --region us-central1 \
  --memory 4Gi \
  --cpu 2 \
  --set-env-vars NEO4J_URI=bolt://neo4j-host:7687
```

---

## Load Testing & Performance

### 1. Create Locust Test File

```python
# locustfile.py
from locust import HttpUser, task, between
import json

class LogicGraphUser(HttpUser):
    wait_time = between(1, 3)

    @task(1)
    def health_check(self):
        self.client.get("/health")

    @task(3)
    def analyze_single_pair(self):
        self.client.post(
            "/api/analyze-and-ingest",
            json={
                "claim_text": "AI should be transparent",
                "evidence_text": "Transparency improves trust"
            }
        )

    @task(2)
    def query_graph(self):
        self.client.post(
            "/api/query",
            json={"search_topic": "transparency"}
        )
```

### 2. Run Load Test

```bash
# Web UI
locust -f locustfile.py --host=http://localhost:8000

# Headless (1000 users, 50 spawn rate)
locust -f locustfile.py \
  --host=http://localhost:8000 \
  --users=1000 \
  --spawn-rate=50 \
  --run-time=10m \
  --headless
```

### 3. Performance Targets

| Metric                  | Target    | Acceptable |
| ----------------------- | --------- | ---------- |
| Single request latency  | <500ms    | <2s        |
| 95th percentile latency | <1s       | <3s        |
| Throughput              | 100 req/s | 50 req/s   |
| Error rate              | <0.1%     | <1%        |

---

## Monitoring & Logging

### 1. Application Logging

Configure in `main.py`:

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Structured logging
import structlog
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
)
```

### 2. Prometheus Metrics

Add to `main.py`:

```python
from prometheus_client import Counter, Histogram, Summary

# Metrics
ingest_counter = Counter(
    'logicgraph_ingest_total',
    'Total documents ingested',
    ['status']
)

request_latency = Histogram(
    'logicgraph_request_duration_seconds',
    'Request latency'
)

nli_classification_time = Summary(
    'logicgraph_nli_duration_seconds',
    'NLI classification time'
)
```

### 3. ELK Stack (Elasticsearch, Logstash, Kibana)

```yaml
# docker-compose-monitoring.yml
version: "3.9"

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.0.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data

  kibana:
    image: docker.elastic.co/kibana/kibana:8.0.0
    ports:
      - "5601:5601"
    depends_on:
      - elasticsearch

  logstash:
    image: docker.elastic.co/logstash/logstash:8.0.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf
    depends_on:
      - elasticsearch

volumes:
  elasticsearch_data:
```

---

## Security Hardening

### 1. Environment Variables (Never in Code)

```bash
# Use .env file (never commit)
export NEO4J_PASSWORD=$(openssl rand -base64 32)
export API_SECRET_KEY=$(openssl rand -base64 32)

# Or use secrets manager
docker secret create neo4j_password /dev/stdin <<< "secure-password"
```

### 2. Network Security

```yaml
# docker-compose.yml
services:
  logicgraph-api:
    networks:
      - logicgraph-net
    ports:
      - "8000:8000" # Only expose necessary ports

networks:
  logicgraph-net:
    internal: false
    driver: bridge
```

### 3. API Rate Limiting

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/api/ingest/file")
@limiter.limit("10/minute")
async def ingest_file(request: Request, ...):
    pass
```

### 4. HTTPS/TLS

```bash
# Generate self-signed certificate
openssl req -x509 -newkey rsa:4096 -nodes -out cert.pem -keyout key.pem -days 365

# Use with uvicorn
uvicorn main:app --ssl-keyfile=key.pem --ssl-certfile=cert.pem
```

### 5. Database Security

```python
# Use environment variables for credentials
NEO4J_USER = os.getenv("NEO4J_USER")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")

# Enable Neo4j authentication
NEO4J_AUTH = f"{NEO4J_USER}/{NEO4J_PASSWORD}"
```

---

## Troubleshooting Production Issues

### High Memory Usage

```bash
# Monitor memory
docker stats logicgraph_logicgraph-api_1

# Adjust settings
NEO4J_dbms_memory_heap_maxSize=2G  # Reduce if needed
```

### Slow Queries

```bash
# Enable query logging
NEO4J_dbms_logs_query_enabled=true

# Check logs
docker logs neo4j | grep "Query took"
```

### Connection Pool Exhaustion

```python
# Increase pool size
driver = GraphDatabase.driver(
    uri,
    auth=(user, password),
    max_pool_size=200
)
```

---

## Backup & Recovery

### Neo4j Backups

```bash
# Full backup
neo4j-admin database backup --database=neo4j --to-path=/backups

# Restore
neo4j-admin database restore --database=neo4j --from-path=/backups/neo4j-20240101T000000.backup
```

---

**Version:** 2.0.0  
**Last Updated:** September 2024
