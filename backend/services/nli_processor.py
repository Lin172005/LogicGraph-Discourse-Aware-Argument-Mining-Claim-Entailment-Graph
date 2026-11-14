"""
NLI (Natural Language Inference) processor for LogicGraph.
Batch processes premise-claim pairs to predict support/contradiction relations.
"""

import logging
from typing import Any, List, Tuple, Dict, Optional
from transformers import pipeline, AutoTokenizer

logger = logging.getLogger(__name__)


class NLIProcessor:
    """
    Zero-shot NLI classifier using DeBERTa model.
    Classifies whether premises support, contradict, or are neutral to claims.
    """
    
    # Model configuration
    MODEL_NAME = "cross-encoder/nli-deberta-v3-xsmall"
    LABELS = ["supports", "contradicts", "is unrelated to"]
    HYPOTHESIS_TEMPLATE = 'This evidence {{}} the claim: "{}"'
    
    def __init__(self, use_gpu: Optional[bool] = None):
        """
        Initialize NLI processor with lazy loading.
        
        Args:
            use_gpu: Whether to use GPU. Defaults to torch.cuda.is_available().
        """
        import torch
        if use_gpu is None:
            self.use_gpu = torch.cuda.is_available()
        else:
            self.use_gpu = use_gpu
        self._pipeline = None
        self._tokenizer = None
    
    def _get_pipeline(self):
        """Lazy load the NLI pipeline on first use."""
        if self._pipeline is None:
            logger.info(f"Loading NLI model: {self.MODEL_NAME}")
            try:
                # Force use_fast=False for stability (Python tokenizer instead of Rust)
                self._tokenizer = AutoTokenizer.from_pretrained(
                    self.MODEL_NAME,
                    use_fast=False
                )
                self._pipeline = pipeline(
                    "zero-shot-classification",
                    model=self.MODEL_NAME,
                    tokenizer=self._tokenizer,
                    device=0 if self.use_gpu else -1  # -1 = CPU
                )
                logger.info("NLI pipeline loaded successfully")
            except Exception as e:
                logger.error(f"Failed to load NLI pipeline: {e}", exc_info=True)
                raise
        return self._pipeline
    
    def classify_single_pair(
        self,
        claim: str,
        evidence: str
    ) -> Dict[str, Any]:
        """
        Classify relationship between a single premise-claim pair.
        
        Args:
            claim: Claim/thesis statement
            evidence: Premise/evidence statement
            
        Returns:
            Dictionary with keys:
            - relation: "SUPPORTS", "CONTRADICTS", or "NEUTRAL"
            - confidence: Float confidence score (0.0-1.0)
            - raw_scores: Dict of all label scores
        """
        try:
            classifier = self._get_pipeline()
            
            hypothesis = self.HYPOTHESIS_TEMPLATE.format(claim)
            
            result = classifier(
                evidence,
                candidate_labels=self.LABELS,
                hypothesis_template=hypothesis,
                multi_label=False
            )
            
            top_label = result["labels"][0]
            top_score = round(float(result["scores"][0]), 4)
            
            # Map label to relation type
            if top_label == "supports":
                relation = "SUPPORTS"
            elif top_label == "contradicts":
                relation = "CONTRADICTS"
            else:
                relation = "NEUTRAL"
            
            return {
                "relation": relation,
                "confidence": top_score,
                "raw_scores": {
                    label: round(float(score), 4)
                    for label, score in zip(result["labels"], result["scores"])
                }
            }
        
        except Exception as e:
            logger.error(f"Error classifying single pair: {e}", exc_info=True)
            raise
    
    def classify_batch(
        self,
        pairs: List[Tuple[str, str]],
        batch_size: int = 16,
        confidence_threshold: Optional[float] = None
    ) -> List[Tuple[str, str, Dict]]:
        """
        Classify multiple premise-claim pairs in batches.
        
        Args:
            pairs: List of (premise, claim) tuples
            batch_size: Number of pairs to process at once
            confidence_threshold: Optional minimum confidence to include (for early filtering)
            
        Returns:
            List of (premise, claim, classification_result) tuples
            where classification_result contains:
            - relation: "SUPPORTS", "CONTRADICTS", or "NEUTRAL"
            - confidence: Float score
        """
        if not pairs:
            logger.warning("Empty pairs list provided to classify_batch")
            return []
        
        logger.info(f"Starting batch classification of {len(pairs)} pairs")
        
        results = []
        valid_pairs = []
        for index, (premise, claim) in enumerate(pairs):
            if not premise or not claim:
                logger.warning("Skipping pair %s: empty premise or claim", index)
                continue
            if len(premise) > 512 or len(claim) > 512:
                logger.warning(
                    "Skipping pair %s: premise (%s chars) or claim (%s chars) too long",
                    index,
                    len(premise),
                    len(claim),
                )
                continue
            valid_pairs.append((premise, claim))

        # Grouping by claim allows the zero-shot pipeline to classify many
        # premises in one model call while preserving the per-pair API result.
        pairs_by_claim: Dict[str, List[str]] = {}
        for premise, claim in valid_pairs:
            pairs_by_claim.setdefault(claim, []).append(premise)

        classifier = self._get_pipeline()
        processed = 0
        for claim, premises in pairs_by_claim.items():
            hypothesis = self.HYPOTHESIS_TEMPLATE.format(claim)
            for batch_start in range(0, len(premises), batch_size):
                batch = premises[batch_start:batch_start + batch_size]
                try:
                    batch_output = classifier(
                        batch,
                        candidate_labels=self.LABELS,
                        hypothesis_template=hypothesis,
                        multi_label=False,
                        batch_size=batch_size,
                    )
                    outputs = (
                        batch_output if isinstance(batch_output, list)
                        else [batch_output]
                    )
                    for premise, output in zip(batch, outputs):
                        top_label = output["labels"][0]
                        top_score = round(float(output["scores"][0]), 4)
                        relation = (
                            "SUPPORTS" if top_label == "supports"
                            else "CONTRADICTS" if top_label == "contradicts"
                            else "NEUTRAL"
                        )
                        classification = {
                            "relation": relation,
                            "confidence": top_score,
                            "raw_scores": {
                                label: round(float(score), 4)
                                for label, score in zip(
                                    output["labels"], output["scores"]
                                )
                            },
                        }
                        if (
                            confidence_threshold is None
                            or top_score >= confidence_threshold
                        ):
                            results.append((premise, claim, classification))

                    processed += len(batch)
                    logger.info(
                        "Processed %s/%s premise-claim pairs",
                        processed,
                        len(valid_pairs),
                    )
                except Exception as exc:
                    logger.warning(
                        "Error classifying batch for claim %r: %s", claim, exc
                    )
                    continue
        
        logger.info(f"Batch classification complete: {len(results)} pairs processed")
        return results
    
    def classify_with_confidence_filtering(
        self,
        pairs: List[Tuple[str, str]],
        threshold: float = 0.60,
        batch_size: int = 8
    ) -> List[Tuple[str, str, Dict]]:
        """
        Classify pairs and filter by confidence threshold.
        
        Args:
            pairs: List of (premise, claim) tuples
            threshold: Minimum confidence to include (0.0-1.0)
            batch_size: Batch processing size
            
        Returns:
            List of high-confidence classifications
        """
        all_results = self.classify_batch(pairs, batch_size=batch_size)
        
        # Filter by confidence and exclude neutral relations
        filtered = [
            (premise, claim, result)
            for premise, claim, result in all_results
            if result["confidence"] >= threshold and result["relation"] != "NEUTRAL"
        ]
        
        logger.info(
            f"Filtered {len(all_results)} results to {len(filtered)} "
            f"above threshold {threshold}"
        )
        
        return filtered


class NLIEvaluator:
    """
    Evaluate NLI model performance on labeled datasets.
    """
    
    def __init__(self, processor: NLIProcessor):
        self.processor = processor
    
    def evaluate(
        self,
        test_pairs: List[Tuple[str, str, str]]
    ) -> Dict[str, float]:
        """
        Evaluate NLI processor on test set.
        
        Args:
            test_pairs: List of (premise, claim, expected_relation) tuples
            
        Returns:
            Dictionary with accuracy, precision, recall metrics
        """
        if not test_pairs:
            return {"error": "Empty test set"}
        
        correct = 0
        
        for premise, claim, expected_relation in test_pairs:
            try:
                result = self.processor.classify_single_pair(claim, premise)
                if result["relation"] == expected_relation:
                    correct += 1
            except Exception as e:
                logger.warning(f"Error during evaluation: {e}")
                continue
        
        accuracy = correct / len(test_pairs) if test_pairs else 0.0
        
        return {
            "accuracy": round(accuracy, 4),
            "total_tests": len(test_pairs),
            "correct": correct
        }