from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from neo4j import GraphDatabase
import os
import spacy
from transformers import pipeline, AutoTokenizer

app = FastAPI(title="LogicGraph API")

# Environment variables
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://neo4j:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password123")

driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

# Load spaCy NLP model for discourse sentence splitting
nlp = spacy.load("en_core_web_sm")

# Load lightweight NLI transformer model for relation & confidence prediction
nli_pipeline = None

def get_nli_pipeline():
    global nli_pipeline
    if nli_pipeline is None:
        # use_fast=False forces the stable Python tokenizer instead of the Rust tokenizer
        tokenizer = AutoTokenizer.from_pretrained("cross-encoder/nli-deberta-v3-xsmall", use_fast=False)
        nli_pipeline = pipeline(
            "zero-shot-classification",
            model="cross-encoder/nli-deberta-v3-xsmall",
            tokenizer=tokenizer
        )
    return nli_pipeline

class AnalysisRequest(BaseModel):
    claim_text: str
    evidence_text: str

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "LogicGraph Backend"}

@app.post("/api/analyze-and-ingest")
def analyze_and_ingest(request: AnalysisRequest):
    # 1. Segment input text using spaCy
    claim_doc = nlp(request.claim_text)
    evidence_doc = nlp(request.evidence_text)

    claim_sentence = next(claim_doc.sents, claim_doc).text
    evidence_sentence = next(evidence_doc.sents, evidence_doc).text

    # 2. Run real NLI transformer inference for relation & confidence score
    classifier = get_nli_pipeline()
    # --- WITH THIS BLOCK ---
    candidate_labels = ["supports", "contradicts", "is unrelated to"]
    nli_result = classifier(
        evidence_sentence,
        candidate_labels=candidate_labels,
        hypothesis_template=f"This evidence {{}} the claim: \"{claim_sentence}\""
    )

    top_label = nli_result["labels"][0]
    top_score = round(float(nli_result["scores"][0]), 4)

    if top_label == "supports":
        relation = "SUPPORTS"
    elif top_label == "contradicts":
        relation = "CONTRADICTS"
    else:
        relation = "NEUTRAL"

    # 3. Store dynamic nodes and relationship directly inside Neo4j
    cypher_query = f"""
    MERGE (c:Claim {{text: $claim_text}})
    MERGE (p:Premise {{text: $evidence_text}})
    MERGE (p)-[r:{relation} {{confidence: $confidence}}]->(c)
    RETURN c, r, p
    """

    with driver.session() as session:
        session.run(
            cypher_query,
            claim_text=claim_sentence,
            evidence_text=evidence_sentence,
            confidence=top_score
        )

    return {
        "status": "success",
        "claim": claim_sentence,
        "evidence": evidence_sentence,
        "predicted_relation": relation,
        "confidence_score": top_score
    }

@app.get("/api/graph")
def get_graph():
    query = """
    MATCH (n)-[r]->(m)
    RETURN n.text AS source, labels(n)[0] AS source_label,
           type(r) AS relation, r.confidence AS confidence,
           m.text AS target, labels(m)[0] AS target_label
    """
    with driver.session() as session:
        result = session.run(query)
        data = [record.data() for record in result]
    return {"graph": data}


class QueryRequest(BaseModel):
    search_topic: str

@app.post("/api/query")
def query_graph_rag(request: QueryRequest):
    # Traverses Neo4j graph paths matching claims or premises containing the search topic
    cypher_query = """
    MATCH (p:Premise)-[r]->(c:Claim)
    WHERE toLower(c.text) CONTAINS toLower($topic) 
       OR toLower(p.text) CONTAINS toLower($topic)
    RETURN c.text AS claim, 
           type(r) AS relation, 
           r.confidence AS confidence, 
           p.text AS evidence
    """
    with driver.session() as session:
        result = session.run(cypher_query, topic=request.search_topic)
        records = [record.data() for record in result]
    
    supports = [r for r in records if r["relation"] == "SUPPORTS"]
    contradicts = [r for r in records if r["relation"] == "CONTRADICTS"]
    
    return {
        "search_topic": request.search_topic,
        "total_paths_found": len(records),
        "supporting_evidence": supports,
        "contradicting_evidence": contradicts
    }