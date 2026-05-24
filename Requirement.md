AI system based on RAG to anlayze document and summarize it. Named as EasyDoc

Features:
1. Secure document ingestion pipeline
2. Malware scanning layer
3. Document understanding pipeline
4. LLM-powered analysis agent
5. Citation-aware retrieval system

High-Level Architecture:
                ┌──────────────────┐
                │  User Uploads    │
                │ PDF/DOC/XLS/ZIP  │
                └────────┬─────────┘
                         │
                         ▼
              ┌────────────────────┐
              │ Upload Gateway/API │
              └────────┬───────────┘
                       │
                       ▼
          ┌──────────────────────────┐
          │ Malware / Security Scan  │
          │ ClamAV + Sandbox         │
          └────────┬─────────────────┘
                   │
          Safe? ───┴─── No → Reject
                   │ Yes
                   ▼
       ┌──────────────────────────────┐
       │ File Type Detection          │
       │ MIME + Magic Bytes           │
       └────────┬─────────────────────┘
                │
                ▼
     ┌─────────────────────────────────┐
     │ Document Parsing Layer          │
     │ PDF / DOCX / XLSX / TXT / ZIP   │
     └────────┬────────────────────────┘
              │
              ▼
   ┌────────────────────────────────────┐
   │ Chunking + Metadata Extraction     │
   │ page no, sheet, section, etc.      │
   └────────┬───────────────────────────┘
            │
            ▼
 ┌────────────────────────────────────────┐
 │ Embedding + Vector DB                  │
 │ pgvector                               │
 └────────┬───────────────────────────────┘
          │
          ▼
 ┌────────────────────────────────────────┐
 │ AI Analysis Agent                      │
 │ classify + summarize + citations       │
 └────────────────────────────────────────┘

Core Components:
1. Secure File Upload Layer:
    upload validation
    file type detection
    malware scanning
    decompression protection
    sandboxing for risky files

2. Malware Scanning Layer:
    A. MIME Validation
    B. Antivirus Scan
    C. Sandbox Suspicious Files
    D. ZIP Bomb Protection

3. Document Parsing Layer
    Parsing of various file types
    OCR for Scanned files

4. Chunking Strategy
    Document
    ↓
    Pages
    ↓
    Semantic Chunks
    ↓
    Embeddings
    ↓
    Retrieval

5. Vector Database (pgvector)
    Needed for:
        semantic search
        citations
        retrieval
        QA over long docs

6. LLM Analysis Agent
This is where:
    document classification
    summary generation
    question answering
    citations
    extraction
Recommended Flow:
    User asks:
        "Summarize this contract"
        → retrieve relevant chunks
        → send chunks to LLM
        → generate response
        → attach citations
Citation System
Store like:
    page number
    paragraph
    chunk ID

7. Agentic Workflow:
Tool	                                Purpose
classify_document	           detect contract/report/invoice
summarize	                   generate summary
extract_entities	           names, dates, money
answer_questions	           RAG QA
compare_docs	               diff analysis

Tech stacks
1. Backend (currently I don't need auth or user services)
NodeJS (Express), clamav, pgvector, PostgreSQL, etc

2. Frontend
React (for frontend to show the landing page and also suggest to upload file, other features includes to show all the files uploaded, if the file uploaded is opened then it should show it's summary along with citations and also option to view the original file)