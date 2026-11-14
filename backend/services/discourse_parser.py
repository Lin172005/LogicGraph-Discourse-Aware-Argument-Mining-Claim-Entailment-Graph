"""
Discourse parsing service for LogicGraph.
Handles sentence segmentation and claim/premise identification.
"""

import logging
from typing import List, Tuple
from spacy.lang.en import English

logger = logging.getLogger(__name__)


class DiscourseParser:
    """
    Parse document discourse to extract candidate claims and premises.
    
    Strategy:
    - Claims: Primary assertions, topic sentences, or high-confidence statements
    - Premises: Supporting evidence, examples, or contextual statements
    """
    
    # Keywords indicating argumentative structure
    CLAIM_INDICATORS = {
        'therefore', 'thus', 'hence', 'so', 'consequently',
        'in conclusion', 'in summary', 'to summarize',
        'believe', 'argue', 'claim', 'assert', 'maintain',
        'the key point is', 'the main issue is'
    }
    
    PREMISE_INDICATORS = {
        'because', 'since', 'as', 'given that', 'provided that',
        'if', 'although', 'though', 'despite', 'in spite of',
        'for example', 'for instance', 'such as', 'notably',
        'research shows', 'studies show', 'studies indicate', 'evidence shows',
        'evidence suggests'
    }
    
    QUESTION_WORDS = {'who', 'what', 'where', 'when', 'why', 'how'}
    
    def __init__(self, nlp_model, min_sentence_length: int = 10):
        """
        Initialize discourse parser.
        
        Args:
            nlp_model: SpaCy language model (e.g., en_core_web_sm)
            min_sentence_length: Minimum characters for valid sentence
        """
        self.nlp = nlp_model
        self.min_sentence_length = min_sentence_length
    
    def segment_sentences(self, text: str) -> List[str]:
        """
        Segment document text into sentences using spaCy.
        
        Args:
            text: Raw document text
            
        Returns:
            List of cleaned sentence strings
        """
        if not text or not text.strip():
            return []
        
        try:
            doc = self.nlp(text)
            sentences = []
            
            for sent in doc.sents:
                sentence_text = sent.text.strip()
                
                # Filter out artifacts
                if len(sentence_text) < self.min_sentence_length:
                    continue
                
                if self._is_valid_sentence(sentence_text):
                    sentences.append(sentence_text)
            
            logger.info(f"Segmented {len(sentences)} valid sentences from text")
            return sentences
            
        except Exception as e:
            logger.error(f"Error segmenting sentences: {e}", exc_info=True)
            return []
    
    def identify_claims_and_premises(
        self, 
        sentences: List[str],
        top_n_claims: int = 5,
        max_premises: int = 35
    ) -> Tuple[List[str], List[str]]:
        """
        Identify primary claims (thesis statements) and premises (supporting evidence).
        
        Strategy:
        1. Score sentences based on claim indicators and position
        2. Top-N high-scoring sentences become claims
        3. Remaining sentences are ranked premises, bounded by max_premises
           to prevent combinatorial explosion in NLI processing
        
        Args:
            sentences: List of segmented sentences
            top_n_claims: Maximum number of top sentences to designate as claims
            max_premises: Maximum premises to retain for NLI pairing
            
        Returns:
            Tuple of (claims, premises)
        """
        if not sentences:
            return [], []
        
        # Score each sentence
        scored_sentences = [
            (sent, self._score_claim_likelihood(sent, idx, len(sentences)))
            for idx, sent in enumerate(sentences)
        ]
        
        # Sort by score (descending)
        scored_sentences.sort(key=lambda x: x[1], reverse=True)
        
        # Extract top claims
        claim_count = min(top_n_claims, max(1, len(sentences) - 1))
        claims = [sent for sent, score in scored_sentences[:claim_count]]
        
        # Remaining sentences are potential premises
        claim_texts_set = set(claims)
        remaining_candidates = [
            (sent, score) for sent, score in scored_sentences if sent not in claim_texts_set
        ]
        
        # Keep premises in natural document order, capped at max_premises
        if len(remaining_candidates) > max_premises:
            # Keep the most argumentative sentences plus document context
            remaining_candidates.sort(key=lambda x: x[1])  # lowest claim score = strongest premise
            selected_premise_set = set(sent for sent, _ in remaining_candidates[:max_premises])
            premises = [sent for sent in sentences if sent in selected_premise_set]
        else:
            premises = [sent for sent in sentences if sent in claim_texts_set]
            premises = [sent for sent in sentences if sent not in claim_texts_set]
        
        logger.info(f"Identified {len(claims)} claims and {len(premises)} premises")
        
        return claims, premises
    
    def _score_claim_likelihood(self, sentence: str, position: int, total_sentences: int) -> float:
        """
        Score likelihood that a sentence is a claim.
        
        Factors:
        - Position (first sentences more likely to be claims)
        - Presence of claim indicators
        - Absence of premise indicators
        - Sentence length (longer = more likely to be claim)
        
        Args:
            sentence: Text of sentence
            position: Index of sentence in document
            total_sentences: Total number of sentences
            
        Returns:
            Score from 0.0 to 1.0
        """
        score = 0.0
        lower_sent = sentence.lower()
        
        # Position factor: first 1/3 of document gets higher score
        position_factor = max(0.3, 1.0 - (position / max(1, total_sentences)))
        score += position_factor * 0.3
        
        # Claim indicator factor
        if any(indicator in lower_sent for indicator in self.CLAIM_INDICATORS):
            score += 0.4
        
        # Premise indicator penalty
        if any(indicator in lower_sent for indicator in self.PREMISE_INDICATORS):
            score -= 0.3
        
        # Length factor: sentences between 15-100 words are more likely claims
        word_count = len(sentence.split())
        if 15 <= word_count <= 100:
            score += 0.2
        elif word_count < 15:
            score -= 0.1
        
        # Question penalty: questions are unlikely to be claims
        if sentence.strip().endswith('?'):
            score -= 0.4
        
        # Certainty factor: sentences with certain verbs score higher
        certainty_verbs = {'claim', 'assert', 'argue', 'prove', 'show', 'demonstrate'}
        if any(verb in lower_sent for verb in certainty_verbs):
            score += 0.2
        
        # Bound score between 0 and 1
        return max(0.0, min(1.0, score))
    
    @staticmethod
    def _is_valid_sentence(sentence: str) -> bool:
        """
        Check if sentence is valid (not an artifact, question, or directive).
        
        Args:
            sentence: Text to validate
            
        Returns:
            True if sentence appears valid for analysis
        """
        if not sentence or len(sentence.strip()) < 10:
            return False
        
        # Skip questions
        if sentence.strip().endswith('?'):
            return False
        
        # Skip imperatives (commands)
        words = sentence.split()
        if words and words[0].lower() in {'please', 'see', 'note', 'consider'}:
            return False
        
        # Skip citations/references that are just numbers/citations
        if sentence[0].isdigit() or sentence.startswith('['):
            return False
        
        # Skip overly short sentences (likely artifacts)
        if len(sentence.split()) < 5:
            return False
        
        return True


class DiscourseAnalyzer:
    """
    Advanced discourse analysis for extracting structured arguments.
    Optional enhancement for more sophisticated claim/premise extraction.
    """
    
    def __init__(self, nlp_model):
        self.nlp = nlp_model
    
    def extract_argument_structure(self, text: str) -> dict:
        """
        Extract argument structure from text including propositions and relations.
        
        Args:
            text: Document text
            
        Returns:
            Dictionary with argument components
        """
        doc = self.nlp(text)
        
        # Extract noun phrases and predicates
        noun_phrases = []
        for chunk in doc.noun_chunks:
            noun_phrases.append(chunk.text)
        
        # Extract main verbs (potential relation predicates)
        relations = []
        for token in doc:
            if token.pos_ == "VERB" and token.head == token:
                relations.append(token.text)
        
        return {
            "entities": noun_phrases,
            "relations": relations,
            "dependencies": [(token.text, token.dep_, token.head.text) for token in doc]
        }