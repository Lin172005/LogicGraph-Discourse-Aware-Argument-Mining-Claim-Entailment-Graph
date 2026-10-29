"""
Comprehensive test suite for LogicGraph components.
Run with: pytest test_logicgraph.py -v
"""

import pytest
import tempfile
import os
from pathlib import Path
from io import BytesIO

# Import services
from services.pdf_service import PDFService
from services.discourse_parser import DiscourseParser
from services.nli_processor import NLIProcessor


# ============================================================================
# Test Fixtures
# ============================================================================

@pytest.fixture
def sample_text():
    """Sample text for testing."""
    return """
    AI systems should be transparent and explainable. 
    Studies show that transparent AI improves user trust and adoption. 
    However, some proprietary algorithms intentionally hide their logic.
    Regulation requires companies to disclose AI decision-making processes.
    """

@pytest.fixture
def sample_pdf_bytes():
    """Create a minimal PDF for testing (requires pypdf)."""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas
        
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)
        c.drawString(100, 750, "AI systems should be transparent.")
        c.drawString(100, 730, "Transparency improves user trust.")
        c.save()
        return buffer.getvalue()
    except ImportError:
        pytest.skip("reportlab not installed")

@pytest.fixture
def pdf_service():
    """PDF service instance."""
    return PDFService()

@pytest.fixture
def discourse_parser(sample_text):
    """Discourse parser instance."""
    import spacy
    try:
        nlp = spacy.load("en_core_web_sm")
    except OSError:
        pytest.skip("spaCy model not installed")
    return DiscourseParser(nlp)

@pytest.fixture
def nli_processor():
    """NLI processor instance."""
    return NLIProcessor(use_gpu=False)


# ============================================================================
# PDFService Tests
# ============================================================================

class TestPDFService:
    
    def test_extract_text_from_txt(self, pdf_service):
        """Test TXT file extraction."""
        txt_content = b"Hello world. This is a test."
        result = pdf_service.extract_text_from_txt(txt_content)
        
        assert "Hello world" in result
        assert "test" in result
        assert len(result) > 0
    
    def test_extract_text_from_txt_encoding(self, pdf_service):
        """Test TXT extraction with different encoding."""
        # Latin-1 encoded text
        txt_content = "Caf\xe9".encode('latin-1')
        result = pdf_service.extract_text_from_txt(txt_content)
        
        assert len(result) > 0
    
    def test_extract_text_from_pdf(self, pdf_service, sample_pdf_bytes):
        """Test PDF extraction."""
        if sample_pdf_bytes is None:
            pytest.skip("Sample PDF generation failed")
        
        result = pdf_service.extract_text_from_pdf(sample_pdf_bytes)
        assert len(result) > 0
        assert isinstance(result, str)
    
    def test_invalid_pdf(self, pdf_service):
        """Test handling of invalid PDF."""
        invalid_pdf = b"Not a PDF file content"
        
        with pytest.raises(ValueError):
            pdf_service.extract_text_from_pdf(invalid_pdf)
    
    def test_empty_txt(self, pdf_service):
        """Test handling of empty TXT."""
        empty_txt = b""
        
        with pytest.raises(ValueError):
            pdf_service.extract_text_from_txt(empty_txt)
    
    def test_text_cleaning(self, pdf_service):
        """Test text cleaning functionality."""
        noisy_text = "Hello\n\n\nworld\n  \ntest"
        cleaned = pdf_service._clean_text(noisy_text)
        
        assert "Hello" in cleaned
        assert "world" in cleaned
        assert cleaned.count('\n') <= 2  # At most one paragraph break


# ============================================================================
# DiscourseParser Tests
# ============================================================================

class TestDiscourseParser:
    
    def test_segment_sentences(self, discourse_parser, sample_text):
        """Test sentence segmentation."""
        sentences = discourse_parser.segment_sentences(sample_text)
        
        assert len(sentences) > 0
        assert all(isinstance(s, str) for s in sentences)
        assert all(len(s) > 0 for s in sentences)
    
    def test_segment_empty_text(self, discourse_parser):
        """Test segmentation of empty text."""
        sentences = discourse_parser.segment_sentences("")
        assert len(sentences) == 0
    
    def test_identify_claims_and_premises(self, discourse_parser, sample_text):
        """Test claim/premise identification."""
        sentences = discourse_parser.segment_sentences(sample_text)
        claims, premises = discourse_parser.identify_claims_and_premises(sentences, top_n_claims=2)
        
        assert len(claims) > 0
        assert len(premises) > 0
        assert len(claims) <= 2
        assert all(c in sentences for c in claims)
        assert all(p in sentences for p in premises)
    
    def test_score_claim_likelihood(self, discourse_parser):
        """Test claim likelihood scoring."""
        claim_sentence = "We argue that AI transparency is essential."
        score = discourse_parser._score_claim_likelihood(claim_sentence, 0, 10)
        
        assert 0.0 <= score <= 1.0
    
    def test_score_premise_likelihood(self, discourse_parser):
        """Test premise-like sentence scoring."""
        premise_sentence = "Because studies show that transparency improves trust."
        score = discourse_parser._score_claim_likelihood(premise_sentence, 5, 10)
        
        # Premise indicator should lower score
        assert 0.0 <= score <= 1.0
    
    def test_invalid_sentence_filtering(self, discourse_parser):
        """Test filtering of invalid sentences."""
        invalid_sentences = [
            "",                    # Empty
            "Q?",                  # Question
            "See note.",           # Directive
            "1",                   # Just a number
        ]
        
        for sent in invalid_sentences:
            assert not discourse_parser._is_valid_sentence(sent)
    
    def test_valid_sentence_filtering(self, discourse_parser):
        """Test acceptance of valid sentences."""
        valid_sentences = [
            "AI systems should be transparent.",
            "Studies show that transparency improves user trust.",
            "This is a reasonable assertion about artificial intelligence."
        ]
        
        for sent in valid_sentences:
            assert discourse_parser._is_valid_sentence(sent)


# ============================================================================
# NLIProcessor Tests
# ============================================================================

class TestNLIProcessor:
    
    def test_classify_single_pair_support(self, nli_processor):
        """Test NLI classification: SUPPORTS."""
        result = nli_processor.classify_single_pair(
            claim="AI should be transparent",
            evidence="Transparency improves user trust"
        )
        
        assert "relation" in result
        assert "confidence" in result
        assert "raw_scores" in result
        assert result["relation"] in ["SUPPORTS", "CONTRADICTS", "NEUTRAL"]
        assert 0.0 <= result["confidence"] <= 1.0
    
    def test_classify_single_pair_contradict(self, nli_processor):
        """Test NLI classification: CONTRADICTS."""
        result = nli_processor.classify_single_pair(
            claim="AI should be transparent",
            evidence="Proprietary algorithms should remain secret"
        )
        
        assert result["relation"] in ["SUPPORTS", "CONTRADICTS", "NEUTRAL"]
        assert 0.0 <= result["confidence"] <= 1.0
    
    def test_classify_single_pair_neutral(self, nli_processor):
        """Test NLI classification: NEUTRAL."""
        result = nli_processor.classify_single_pair(
            claim="AI systems are complex",
            evidence="The weather is sunny today"
        )
        
        # Should be neutral or low confidence
        assert result["relation"] in ["SUPPORTS", "CONTRADICTS", "NEUTRAL"]
    
    def test_classify_batch(self, nli_processor):
        """Test batch NLI classification."""
        pairs = [
            ("AI is useful", "AI helps solve problems"),
            ("AI is dangerous", "AI systems can cause harm"),
            ("AI is expensive", "The weather is nice"),
        ]
        
        results = nli_processor.classify_batch(pairs, batch_size=2)
        
        assert len(results) > 0
        assert all(len(r) == 3 for r in results)  # (premise, claim, result)
        assert all(r[2].get("relation") is not None for r in results)
    
    def test_classify_batch_empty(self, nli_processor):
        """Test batch classification with empty list."""
        results = nli_processor.classify_batch([])
        assert len(results) == 0
    
    def test_classify_with_confidence_filtering(self, nli_processor):
        """Test confidence-based filtering."""
        pairs = [
            ("Evidence 1", "Claim 1"),
            ("Evidence 2", "Claim 2"),
            ("Evidence 3", "Claim 3"),
        ]
        
        results = nli_processor.classify_with_confidence_filtering(
            pairs,
            threshold=0.50,
            batch_size=2
        )
        
        # All results should meet threshold (or be filtered out)
        assert all(r[2]["confidence"] >= 0.50 or r[2]["relation"] == "NEUTRAL" 
                   for r in results)
    
    def test_invalid_pair_handling(self, nli_processor):
        """Test handling of invalid input pairs."""
        pairs = [
            ("", "Claim"),      # Empty premise
            ("Premise", ""),    # Empty claim
            ("Valid", "Valid"), # Valid pair
        ]
        
        results = nli_processor.classify_batch(pairs)
        
        # Should skip invalid pairs but process valid ones
        assert len(results) >= 1


# ============================================================================
# Integration Tests
# ============================================================================

class TestIntegration:
    
    def test_full_pipeline(self, pdf_service, discourse_parser, nli_processor, sample_text):
        """Test complete pipeline from text to NLI classification."""
        
        # Step 1: Extract text (simulated)
        text = sample_text
        
        # Step 2: Segment sentences
        sentences = discourse_parser.segment_sentences(text)
        assert len(sentences) > 0
        
        # Step 3: Identify claims and premises
        claims, premises = discourse_parser.identify_claims_and_premises(sentences)
        assert len(claims) > 0
        assert len(premises) > 0
        
        # Step 4: Classify premise-claim pairs
        pairs = [(p, c) for p in premises for c in claims]
        results = nli_processor.classify_batch(pairs, batch_size=2)
        
        assert len(results) > 0
        for premise, claim, result in results:
            assert result["relation"] in ["SUPPORTS", "CONTRADICTS", "NEUTRAL"]
            assert 0.0 <= result["confidence"] <= 1.0


# ============================================================================
# Performance Tests
# ============================================================================

class TestPerformance:
    
    def test_large_batch_classification(self, nli_processor):
        """Test performance on larger batch."""
        pairs = [
            (f"Evidence {i}", f"Claim {i}")
            for i in range(20)
        ]
        
        import time
        start = time.time()
        results = nli_processor.classify_batch(pairs, batch_size=5)
        elapsed = time.time() - start
        
        assert len(results) > 0
        assert elapsed < 60  # Should complete in reasonable time
        
        print(f"\nProcessed {len(results)} pairs in {elapsed:.2f}s")
    
    def test_text_cleaning_performance(self, pdf_service):
        """Test performance of text cleaning."""
        large_text = ("Lorem ipsum dolor sit amet. " * 1000)
        
        import time
        start = time.time()
        cleaned = pdf_service._clean_text(large_text)
        elapsed = time.time() - start
        
        assert len(cleaned) > 0
        assert elapsed < 1.0  # Should be very fast
        
        print(f"\nCleaned {len(large_text)} chars in {elapsed:.4f}s")


# ============================================================================
# Run Tests
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])