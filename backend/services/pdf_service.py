"""
PDF and TXT file extraction service for LogicGraph.
Handles multi-page PDF parsing and plain text extraction.
"""

import io
import logging
from typing import Optional

try:
    from pypdf import PdfReader
except ImportError:
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        PdfReader = None

logger = logging.getLogger(__name__)


class PDFService:
    """Service for extracting text from PDF and TXT files."""
    
    def __init__(self, min_text_length: int = 10):
        """
        Initialize PDF service.
        
        Args:
            min_text_length: Minimum character length to consider a line valid
        """
        self.min_text_length = min_text_length
        
        if PdfReader is None:
            logger.warning(
                "pypdf not installed. PDF extraction will fail. "
                "Install with: pip install pypdf"
            )
    
    def extract_text_from_pdf(self, pdf_bytes: bytes) -> str:
        """
        Extract clean text from PDF bytes.
        
        Handles:
        - Multi-page documents
        - Layout preservation with paragraph breaks
        - Filtering of empty/whitespace-only pages
        - Unicode and encoding errors
        
        Args:
            pdf_bytes: Raw PDF file bytes
            
        Returns:
            Extracted text with sentences separated by newlines
            
        Raises:
            ValueError: If PDF is invalid or unreadable
        """
        if PdfReader is None:
            raise ValueError(
                "pypdf library is required for PDF extraction. "
                "Install with: pip install pypdf"
            )
        
        try:
            pdf_file = io.BytesIO(pdf_bytes)
            reader = PdfReader(pdf_file)
            
            if len(reader.pages) == 0:
                raise ValueError("PDF has no pages")
            
            extracted_text = []
            
            for page_idx, page in enumerate(reader.pages):
                try:
                    page_text = page.extract_text()
                    
                    if page_text and page_text.strip():
                        # Clean and normalize whitespace
                        cleaned = self._clean_text(page_text)
                        if cleaned:
                            extracted_text.append(cleaned)
                            logger.debug(f"Extracted {len(cleaned)} chars from page {page_idx + 1}")
                    else:
                        logger.warning(f"Page {page_idx + 1} yielded no text")
                        
                except Exception as e:
                    logger.warning(f"Error extracting text from page {page_idx + 1}: {e}")
                    continue
            
            if not extracted_text:
                raise ValueError("No text could be extracted from the PDF")
            
            # Join pages with double newline for clear separation
            full_text = "\n\n".join(extracted_text)
            logger.info(f"Successfully extracted {len(full_text)} characters from PDF")
            return full_text
            
        except Exception as e:
            logger.error(f"PDF extraction failed: {e}", exc_info=True)
            raise ValueError(f"Failed to read PDF: {str(e)}")
    
    def extract_text_from_txt(self, txt_bytes: bytes) -> str:
        """
        Extract text from TXT file bytes.
        
        Attempts multiple encodings if UTF-8 fails.
        
        Args:
            txt_bytes: Raw TXT file bytes
            
        Returns:
            Extracted and cleaned text
            
        Raises:
            ValueError: If TXT is unreadable in all encodings
        """
        encodings = ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252']
        
        for encoding in encodings:
            try:
                text = txt_bytes.decode(encoding)
                cleaned = self._clean_text(text)
                logger.info(f"Successfully extracted {len(cleaned)} characters from TXT (encoding: {encoding})")
                return cleaned
            except UnicodeDecodeError:
                logger.debug(f"Failed to decode with {encoding}, trying next...")
                continue
        
        raise ValueError(
            f"Could not decode TXT file with any of these encodings: {encodings}"
        )
    
    def _clean_text(self, text: str) -> str:
        """
        Clean extracted text by removing noise and normalizing whitespace.
        
        Args:
            text: Raw extracted text
            
        Returns:
            Cleaned text
        """
        if not text:
            return ""
        
        # Replace multiple newlines with double newline (paragraph separator)
        text = "\n".join(
            line.strip() 
            for line in text.split("\n") 
            if line.strip()
        )
        
        # Remove excessive spaces between words
        text = " ".join(text.split())
        
        # Handle common PDF artifacts (page numbers, headers/footers)
        lines = text.split("\n")
        cleaned_lines = []
        
        for line in lines:
            # Skip common artifacts
            if self._is_artifact_line(line):
                continue
            cleaned_lines.append(line)
        
        result = "\n".join(cleaned_lines)
        return result.strip()
    
    @staticmethod
    def _is_artifact_line(line: str) -> bool:
        """
        Detect and filter common PDF artifacts.
        
        Args:
            line: Text line to check
            
        Returns:
            True if line appears to be an artifact, False otherwise
        """
        if not line or len(line.strip()) < 3:
            return True
        
        # Detect page numbers (single digits or "Page X" format)
        if line.strip().isdigit() or len(line.strip()) < 2:
            return True
        
        # Common header/footer patterns
        artifacts = [
            "page",
            "chapter",
            "©",
            "®",
            "™",
            "confidential",
        ]
        
        lower_line = line.lower()
        if any(artifact in lower_line for artifact in artifacts):
            # Only filter if it's a very short line (likely a header)
            if len(line.strip()) < 20:
                return True
        
        return False