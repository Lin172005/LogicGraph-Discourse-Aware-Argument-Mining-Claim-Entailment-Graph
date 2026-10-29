"""
Example usage of LogicGraph API.
Demonstrates all major endpoints and functionality.
"""

import requests
import json
from pathlib import Path

# Configuration
API_BASE_URL = "http://localhost:8000"
HEALTH_ENDPOINT = f"{API_BASE_URL}/health"


# ============================================================================
# Example 1: Health Check
# ============================================================================

def check_health():
    """Verify API is running."""
    print("\n" + "="*70)
    print("EXAMPLE 1: Health Check")
    print("="*70)
    
    response = requests.get(f"{API_BASE_URL}/health")
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    return response.status_code == 200


# ============================================================================
# Example 2: Single Pair Analysis (v1 API - Backward Compatibility)
# ============================================================================

def analyze_single_pair():
    """Analyze a single claim-evidence pair."""
    print("\n" + "="*70)
    print("EXAMPLE 2: Single Pair Analysis")
    print("="*70)
    
    payload = {
        "claim_text": "Climate change is primarily caused by human activities.",
        "evidence_text": "Multiple scientific studies show increasing CO2 levels correlate with industrial emissions."
    }
    
    print(f"Request payload:\n{json.dumps(payload, indent=2)}")
    
    response = requests.post(
        f"{API_BASE_URL}/api/analyze-and-ingest",
        json=payload
    )
    
    print(f"\nStatus: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    return response.json().get("predicted_relation")


# ============================================================================
# Example 3: File Upload & Ingestion
# ============================================================================

def ingest_file(file_path: str, document_title: str = None):
    """
    Upload a PDF/TXT file for processing.
    
    Args:
        file_path: Path to PDF or TXT file
        document_title: Optional custom title
        
    Returns:
        Document ID if successful
    """
    print("\n" + "="*70)
    print("EXAMPLE 3: File Upload & Ingestion")
    print("="*70)
    
    if not Path(file_path).exists():
        print(f"File not found: {file_path}")
        print("Skipping this example...")
        return None
    
    with open(file_path, 'rb') as f:
        files = {'file': f}
        data = {
            'confidence_threshold': 0.60
        }
        if document_title:
            data['document_title'] = document_title
        
        print(f"Uploading: {file_path}")
        print(f"Title: {document_title or 'Auto-generated'}")
        
        response = requests.post(
            f"{API_BASE_URL}/api/ingest/file",
            files=files,
            data=data
        )
    
    print(f"Status: {response.status_code}")
    result = response.json()
    print(f"Response: {json.dumps(result, indent=2)}")
    
    if response.status_code == 200:
        return result.get('document_id')
    return None


# ============================================================================
# Example 4: Get Document Statistics
# ============================================================================

def get_document_stats(document_id: str):
    """Get statistics for an ingested document."""
    print("\n" + "="*70)
    print("EXAMPLE 4: Document Statistics")
    print("="*70)
    
    print(f"Document ID: {document_id}")
    
    response = requests.get(
        f"{API_BASE_URL}/api/document/{document_id}/stats"
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")


# ============================================================================
# Example 5: Retrieve Document Arguments
# ============================================================================

def get_document_arguments(document_id: str):
    """Retrieve all extracted argument pairs from a document."""
    print("\n" + "="*70)
    print("EXAMPLE 5: Document Arguments")
    print("="*70)
    
    print(f"Document ID: {document_id}")
    
    response = requests.get(
        f"{API_BASE_URL}/api/document/{document_id}"
    )
    
    print(f"Status: {response.status_code}")
    result = response.json()
    
    # Pretty print
    print(f"Total argument pairs: {result.get('total_pairs', 0)}")
    print("\nSample argument pairs:")
    
    for i, pair in enumerate(result.get('argument_pairs', [])[:3]):
        print(f"\n  Pair {i+1}:")
        print(f"    Claim: {pair['claim'][:60]}...")
        print(f"    Evidence: {pair['evidence'][:60]}...")
        print(f"    Relation: {pair['relation']}")
        print(f"    Confidence: {pair['confidence']:.4f}")


# ============================================================================
# Example 6: Graph Query & Search
# ============================================================================

def query_arguments(search_topic: str):
    """Search the graph for arguments related to a topic."""
    print("\n" + "="*70)
    print("EXAMPLE 6: Topic Search")
    print("="*70)
    
    payload = {"search_topic": search_topic}
    
    print(f"Searching for: '{search_topic}'")
    
    response = requests.post(
        f"{API_BASE_URL}/api/query",
        json=payload
    )
    
    print(f"Status: {response.status_code}")
    result = response.json()
    
    print(f"\nTotal paths found: {result.get('total_paths_found', 0)}")
    
    supporting = result.get('supporting_evidence', [])
    contradicting = result.get('contradicting_evidence', [])
    
    print(f"\nSupporting evidence: {len(supporting)} claims")
    for i, ev in enumerate(supporting[:2]):
        print(f"\n  {i+1}. Claim: {ev['claim'][:50]}...")
        print(f"     Evidence: {ev['evidence'][:50]}...")
        print(f"     Confidence: {ev['confidence']:.4f}")
    
    print(f"\nContradicting evidence: {len(contradicting)} claims")
    for i, ev in enumerate(contradicting[:2]):
        print(f"\n  {i+1}. Claim: {ev['claim'][:50]}...")
        print(f"     Evidence: {ev['evidence'][:50]}...")
        print(f"     Confidence: {ev['confidence']:.4f}")


# ============================================================================
# Example 7: Get Overall Graph Statistics
# ============================================================================

def get_graph_stats():
    """Get overall statistics about the graph."""
    print("\n" + "="*70)
    print("EXAMPLE 7: Overall Graph Statistics")
    print("="*70)
    
    response = requests.get(f"{API_BASE_URL}/api/graph-stats")
    
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")


# ============================================================================
# Example 8: Batch File Ingestion
# ============================================================================

def ingest_batch_files(file_paths: list):
    """
    Ingest multiple files at once.
    
    Args:
        file_paths: List of paths to PDF/TXT files
    """
    print("\n" + "="*70)
    print("EXAMPLE 8: Batch File Ingestion")
    print("="*70)
    
    valid_files = [f for f in file_paths if Path(f).exists()]
    
    if not valid_files:
        print("No valid files found. Skipping this example...")
        return
    
    print(f"Uploading {len(valid_files)} files...")
    
    files = [('files', open(f, 'rb')) for f in valid_files]
    data = {'confidence_threshold': 0.60}
    
    response = requests.post(
        f"{API_BASE_URL}/api/ingest/batch",
        files=files,
        data=data
    )
    
    # Close files
    for _, f in files:
        f.close()
    
    print(f"Status: {response.status_code}")
    result = response.json()
    print(f"Response: {json.dumps(result, indent=2)}")


# ============================================================================
# Main Execution
# ============================================================================

def main():
    """Run all examples."""
    print("\n" + "="*70)
    print("LogicGraph API Usage Examples")
    print("="*70)
    
    # Check health
    if not check_health():
        print("\n⚠️  API is not running. Start with:")
        print("   docker-compose up -d")
        print("   or")
        print("   uvicorn main:app --reload")
        return
    
    print("\n✓ API is healthy!")
    
    # Run examples
    print("\n" + "-"*70)
    print("Running Examples...")
    print("-"*70)
    
    # Example 2: Single pair
    relation = analyze_single_pair()
    
    # Example 3: File upload (if file exists)
    print("\nNote: For Examples 3-8, provide actual PDF/TXT files.")
    sample_file = "sample_document.pdf"  # Replace with actual file
    doc_id = None
    
    if Path(sample_file).exists():
        doc_id = ingest_file(sample_file, "Sample Document")
        
        if doc_id:
            # Example 4: Document stats
            get_document_stats(doc_id)
            
            # Example 5: Document arguments
            get_document_arguments(doc_id)
    
    # Example 6: Query
    query_arguments("climate change")
    
    # Example 7: Graph stats
    get_graph_stats()
    
    print("\n" + "="*70)
    print("Examples Complete!")
    print("="*70)
    print("\nAccess Swagger UI at: http://localhost:8000/docs")
    print("Access ReDoc at: http://localhost:8000/redoc")


if __name__ == "__main__":
    main()