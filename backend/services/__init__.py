"""
LogicGraph services package.
Provides core functionality for document processing, discourse analysis, and NLI classification.
"""

from .pdf_service import PDFService
from .discourse_parser import DiscourseParser, DiscourseAnalyzer
from .graph_service import GraphService
from .nli_processor import NLIProcessor, NLIEvaluator

__all__ = [
    "PDFService",
    "DiscourseParser",
    "DiscourseAnalyzer",
    "GraphService",
    "NLIProcessor",
    "NLIEvaluator",
]