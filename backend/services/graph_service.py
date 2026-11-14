"""Neo4j persistence and graph query service for LogicGraph."""

import logging
import os
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

from neo4j import GraphDatabase

logger = logging.getLogger(__name__)

_WHITESPACE_RE = re.compile(r"\s+")
_STRIP_CHARS = " \"'\\"


def clean_text(text: Optional[str]) -> str:
    """Normalize text: collapse whitespace, strip surrounding quotes/spaces."""
    if not text:
        return ""
    text = _WHITESPACE_RE.sub(" ", text).strip(_STRIP_CHARS)
    return _WHITESPACE_RE.sub(" ", text).strip()


class GraphService:
    """Own the Neo4j connection and all graph persistence/query operations."""

    _RELATION_TYPES = {"SUPPORTS", "CONTRADICTS", "NEUTRAL"}

    def __init__(self) -> None:
        uri = os.getenv("NEO4J_URI", "bolt://neo4j:7687")
        user = os.getenv("NEO4J_USER") or os.getenv("NEO4J_USERNAME") or "neo4j"
        password = os.getenv("NEO4J_PASSWORD", "password123")
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def initialize_schema(self) -> None:
        """Create constraints required by the graph API (each applied independently)."""
        statements = [
            "CREATE CONSTRAINT IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Claim) REQUIRE c.text IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Premise) REQUIRE p.text IS UNIQUE",
            "CREATE INDEX IF NOT EXISTS FOR ()-[r:SUPPORTS]-() ON (r.doc_id)",
            "CREATE INDEX IF NOT EXISTS FOR ()-[r:CONTRADICTS]-() ON (r.doc_id)",
            "CREATE INDEX IF NOT EXISTS FOR ()-[r:NEUTRAL]-() ON (r.doc_id)",
        ]
        with self.driver.session() as session:
            for statement in statements:
                try:
                    session.run(statement)
                except Exception as exc:
                    logger.warning("Schema initialization notice: %s", exc)
        logger.info("Graph schema initialization complete")

    def store_pair(
        self,
        claim: str,
        evidence: str,
        relation: str,
        confidence: float,
    ) -> None:
        """Store one claim-evidence relationship."""
        relation = self._validate_relation(relation)
        claim, evidence = clean_text(claim), clean_text(evidence)
        if not claim or not evidence:
            logger.warning("Skipping pair with empty text after cleaning")
            return

        query = f"""
        MERGE (c:Claim {{text: $claim_text}})
        MERGE (p:Premise {{text: $evidence_text}})
        MERGE (p)-[r:{relation}]->(c)
        SET r.confidence = $confidence
        """
        with self.driver.session() as session:
            session.run(
                query,
                claim_text=claim,
                evidence_text=evidence,
                confidence=confidence,
            )

    def store_document_relations(
        self,
        document_id: str,
        title: str,
        filename: str,
        nli_results: Sequence[Tuple[str, str, Dict[str, Any]]],
        confidence_threshold: float,
    ) -> int:
        """Create a document and persist its accepted argument relations."""
        # Pre-filter and clean items for batch insertion
        support_items = []
        contradict_items = []
        neutral_items = []

        for premise, claim, nli_result in nli_results:
            relation = nli_result.get("relation")
            confidence = float(nli_result.get("confidence", 0.0))

            if confidence < confidence_threshold or relation == "NEUTRAL":
                continue

            premise_clean, claim_clean = clean_text(premise), clean_text(claim)
            if not premise_clean or not claim_clean:
                continue

            item = {
                "claim": claim_clean,
                "evidence": premise_clean,
                "confidence": confidence,
            }
            if relation == "SUPPORTS":
                support_items.append(item)
            elif relation == "CONTRADICTS":
                contradict_items.append(item)
            elif relation == "NEUTRAL":
                neutral_items.append(item)

        stored_relations = len(support_items) + len(contradict_items) + len(neutral_items)

        with self.driver.session() as session:
            # 1. Store document node
            session.run(
                """
                MERGE (d:Document {id: $doc_id})
                ON CREATE SET d.created_at = timestamp()
                SET d.title = $title, d.filename = $filename
                """,
                doc_id=document_id,
                title=title,
                filename=filename,
            )

            # 2. Batch store by relation type using UNWIND
            for rel_type, items in [
                ("SUPPORTS", support_items),
                ("CONTRADICTS", contradict_items),
                ("NEUTRAL", neutral_items),
            ]:
                if not items:
                    continue
                batch_query = f"""
                MERGE (d:Document {{id: $doc_id}})
                WITH d
                UNWIND $batch AS item
                MERGE (c:Claim {{text: item.claim}})
                MERGE (p:Premise {{text: item.evidence}})
                MERGE (d)-[:CONTAINS]->(c)
                MERGE (d)-[:CONTAINS]->(p)
                MERGE (p)-[r:{rel_type}]->(c)
                ON CREATE SET
                    r.confidence = item.confidence,
                    r.doc_id = $doc_id,
                    r.created_at = timestamp()
                ON MATCH SET r.confidence = item.confidence
                """
                session.run(batch_query, doc_id=document_id, batch=items)

        return stored_relations

    def get_graph_stats(self) -> Dict[str, Any]:
        """Return overall graph statistics."""
        query = """
        MATCH (d:Document)
        OPTIONAL MATCH (c:Claim)
        OPTIONAL MATCH (p:Premise)
        OPTIONAL MATCH ()-[r:SUPPORTS|CONTRADICTS|NEUTRAL]->()
        RETURN
            count(DISTINCT d) AS total_documents,
            count(DISTINCT c) AS total_claims,
            count(DISTINCT p) AS total_premises,
            count(r) AS total_relations,
            round(avg(r.confidence), 4) AS avg_confidence
        """
        with self.driver.session() as session:
            record = session.run(query).single()

        if not record:
            return {
                "total_documents": 0,
                "total_claims": 0,
                "total_premises": 0,
                "total_relations": 0,
                "average_confidence": 0.0,
            }

        return {
            "total_documents": record["total_documents"],
            "total_claims": record["total_claims"],
            "total_premises": record["total_premises"],
            "total_relations": record["total_relations"],
            "average_confidence": record["avg_confidence"] or 0.0,
        }

    def get_document_stats(self, document_id: str) -> Optional[Dict[str, Any]]:
        """Return statistics for one document, or None if it does not exist."""
        query = """
        MATCH (d:Document {id: $doc_id})
        OPTIONAL MATCH (d)-[:CONTAINS]->(c:Claim)
        OPTIONAL MATCH (d)-[:CONTAINS]->(p:Premise)
        OPTIONAL MATCH (p)-[r:SUPPORTS|CONTRADICTS|NEUTRAL]->(c)
        WHERE r.doc_id = $doc_id
        RETURN
            d.title AS title,
            d.filename AS filename,
            count(DISTINCT c) AS claims_count,
            count(DISTINCT p) AS premises_count,
            count(r) AS relations_count,
            round(avg(r.confidence), 4) AS avg_confidence
        """
        with self.driver.session() as session:
            record = session.run(query, doc_id=document_id).single()

        if not record:
            return None

        return {
            "document_id": document_id,
            "document_title": record["title"],
            "filename": record["filename"],
            "claims_count": record["claims_count"],
            "premises_count": record["premises_count"],
            "relations_count": record["relations_count"],
            "average_confidence": record["avg_confidence"] or 0.0,
        }

    def list_documents(self) -> List[Dict[str, Any]]:
        """Return document summaries for the document manager."""
        query = """
        MATCH (d:Document)
        OPTIONAL MATCH (d)-[:CONTAINS]->(c:Claim)
        OPTIONAL MATCH (d)-[:CONTAINS]->(p:Premise)
        OPTIONAL MATCH (p)-[r:SUPPORTS|CONTRADICTS|NEUTRAL]->(c)
        WHERE r.doc_id = d.id OR r IS NULL
        RETURN
            d.id AS document_id,
            d.title AS title,
            d.filename AS filename,
            d.created_at AS created_at,
            count(DISTINCT c) AS claims,
            count(DISTINCT p) AS premises,
            count(r) AS relations
        ORDER BY d.created_at DESC
        """
        with self.driver.session() as session:
            return [record.data() for record in session.run(query)]

    def delete_document(self, document_id: str) -> bool:
        """Delete one document and its containment links."""
        query = """
        MATCH (d:Document {id: $doc_id})
        WITH d, count(d) AS deleted_count
        DETACH DELETE d
        RETURN deleted_count
        """
        with self.driver.session() as session:
            record = session.run(query, doc_id=document_id).single()
        return bool(record and record["deleted_count"])

    def get_visualization(self) -> Dict[str, List[Dict[str, Any]]]:
        """Return all graph nodes and relationships for a UI visualizer."""
        nodes_query = """
        MATCH (n)
        RETURN elementId(n) AS id,
               labels(n) AS labels,
               coalesce(n.text, n.title, n.id) AS label
        """
        edges_query = """
        MATCH (source)-[r]->(target)
        RETURN elementId(r) AS id,
               elementId(source) AS source,
               elementId(target) AS target,
               coalesce(source.text, source.title, source.id) AS source_text,
               coalesce(target.text, target.title, target.id) AS target_text,
               labels(source)[0] AS source_type,
               labels(target)[0] AS target_type,
               type(r) AS relation,
               r.confidence AS confidence
        """
        with self.driver.session() as session:
            nodes = [record.data() for record in session.run(nodes_query)]
            edges = [record.data() for record in session.run(edges_query)]
        return {"nodes": nodes, "edges": edges}

    def get_academic_argument_synthesis(self) -> Dict[str, Any]:
        """
        Academic analysis:
        Group arguments by Claims, attach supporting/refuting premises with confidence,
        compute Toulmin argument structure metrics, and identify contested literature points.
        """
        claims_query = """
        MATCH (c:Claim)
        OPTIONAL MATCH (p_sup:Premise)-[s:SUPPORTS]->(c)
        OPTIONAL MATCH (p_con:Premise)-[k:CONTRADICTS]->(c)
        RETURN c.text AS claim_text,
               collect(DISTINCT { premise: p_sup.text, confidence: s.confidence }) AS supporting_evidence,
               collect(DISTINCT { premise: p_con.text, confidence: k.confidence }) AS refuting_evidence,
               count(DISTINCT s) AS support_count,
               count(DISTINCT k) AS refute_count
        ORDER BY (support_count + refute_count) DESC
        LIMIT 25
        """
        with self.driver.session() as session:
            records = [r.data() for r in session.run(claims_query)]
        return {"analyzed_claims": records}

    def clear_graph(self) -> Dict[str, int]:
        """Delete every node and relationship from the graph."""
        query = """
        MATCH (n)
        WITH collect(n) AS nodes, count(n) AS deleted_nodes
        UNWIND nodes AS node
        DETACH DELETE node
        RETURN deleted_nodes
        """
        with self.driver.session() as session:
            record = session.run(query).single()
        return {"deleted_nodes": record["deleted_nodes"] if record else 0}

    def get_document_pairs(self, document_id: str) -> Optional[List[Dict[str, Any]]]:
        """Return document argument pairs, or None if the document is unknown."""
        document_query = "MATCH (d:Document {id: $doc_id}) RETURN d.id AS id"
        pairs_query = """
        MATCH (d:Document {id: $doc_id})-[:CONTAINS]->(c:Claim)
        MATCH (d)-[:CONTAINS]->(p:Premise)
        MATCH (p)-[r:SUPPORTS|CONTRADICTS|NEUTRAL]->(c)
        WHERE r.doc_id = $doc_id
        RETURN {
            claim: c.text,
            evidence: p.text,
            relation: type(r),
            confidence: r.confidence
        } AS pair
        """
        with self.driver.session() as session:
            document = session.run(document_query, doc_id=document_id).single()
            if not document:
                return None
            result = session.run(pairs_query, doc_id=document_id)
            return [record["pair"] for record in result]

    def get_full_graph(self, limit: int = 1000) -> List[Dict[str, Any]]:
        """Return graph relationships up to the requested limit."""
        query = """
        MATCH (n)-[r:SUPPORTS|CONTRADICTS|NEUTRAL]->(m)
        RETURN {
            source: n.text,
            source_label: labels(n)[0],
            relation: type(r),
            confidence: r.confidence,
            target: m.text,
            target_label: labels(m)[0]
        } AS edge
        LIMIT $limit
        """
        with self.driver.session() as session:
            result = session.run(query, limit=limit)
            return [record["edge"] for record in result]

    def search_topic(self, topic: str) -> List[Dict[str, Any]]:
        """Find supporting and contradicting relationships containing a topic."""
        query = """
        MATCH (p:Premise)-[r:SUPPORTS|CONTRADICTS]->(c:Claim)
        WHERE toLower(c.text) CONTAINS toLower($topic)
           OR toLower(p.text) CONTAINS toLower($topic)
        RETURN {
            claim: c.text,
            relation: type(r),
            confidence: r.confidence,
            evidence: p.text
        } AS result
        ORDER BY r.confidence DESC
        LIMIT 100
        """
        with self.driver.session() as session:
            result = session.run(query, topic=topic)
            return [record["result"] for record in result]

    def get_bias_and_fallacy_metrics(self) -> Dict[str, Any]:
        """
        Compute Debate Polarization Index and detect circular/contradictory clusters.
        - Polarization Index = 1 - |supports - contradicts| / (supports + contradicts)
          Ranges from 0 (completely one-sided/echo chamber) to 1 (intense balanced debate).
        - Direct Contradictions: Claims that have both strong SUPPORTS and CONTRADICTS.
        - Circular clusters: Premise/Claim cycles.
        """
        query = """
        MATCH ()-[s:SUPPORTS]->()
        WITH count(s) AS total_supports
        MATCH ()-[c:CONTRADICTS]->()
        WITH total_supports, count(c) AS total_contradicts
        RETURN total_supports, total_contradicts
        """
        contested_claims_query = """
        MATCH (p1:Premise)-[s:SUPPORTS]->(c:Claim)
        MATCH (p2:Premise)-[k:CONTRADICTS]->(c)
        RETURN c.text AS contested_claim,
               count(DISTINCT s) AS supporting_count,
               count(DISTINCT k) AS contradicting_count,
               round(avg(s.confidence), 3) AS avg_support_conf,
               round(avg(k.confidence), 3) AS avg_contradict_conf
        ORDER BY (supporting_count + contradicting_count) DESC
        LIMIT 10
        """
        circular_query = """
        MATCH (n:Claim)-[r1:SUPPORTS|CONTRADICTS]->(m:Claim)-[r2:SUPPORTS|CONTRADICTS]->(n)
        WHERE id(n) < id(m)
        RETURN n.text AS node_a, m.text AS node_b, type(r1) AS rel_a_to_b, type(r2) AS rel_b_to_a
        LIMIT 5
        """
        with self.driver.session() as session:
            counts = session.run(query).single()
            contested_records = [r.data() for r in session.run(contested_claims_query)]
            circular_records = [r.data() for r in session.run(circular_query)]

        total_sup = counts["total_supports"] if counts else 0
        total_con = counts["total_contradicts"] if counts else 0
        total_rel = total_sup + total_con

        if total_rel > 0:
            imbalance = abs(total_sup - total_con) / total_rel
            polarization_index = round(1.0 - imbalance, 3)
        else:
            polarization_index = 0.0

        if polarization_index >= 0.7:
            status = "BALANCED_DEBATE"
            summary = "High polarization and balanced active debate between thesis and antithesis."
        elif polarization_index >= 0.35:
            status = "MODERATE_DIVERGENCE"
            summary = "Moderate debate with a dominant leaning towards one side."
        else:
            status = "ECHO_CHAMBER"
            summary = "Strong consensus or one-sided bias with minimal dissenting evidence."

        return {
            "polarization_index": polarization_index,
            "status": status,
            "summary": summary,
            "total_supports": total_sup,
            "total_contradicts": total_con,
            "contested_claims": contested_records,
            "circular_dependencies": circular_records,
        }

    def close(self) -> None:
        """Close the Neo4j driver."""
        self.driver.close()

    def _validate_relation(self, relation: str) -> str:
        if relation not in self._RELATION_TYPES:
            raise ValueError(f"Unsupported graph relation: {relation}")
        return relation