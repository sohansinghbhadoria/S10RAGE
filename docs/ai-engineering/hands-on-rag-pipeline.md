---
id: hands-on-rag-pipeline
title: "Hands-On Lab: Building a Production Local RAG Pipeline from Scratch"
sidebar_label: "6. Lab: Local RAG Pipeline"
sidebar_position: 6
---

# Hands-On Lab: Building a Production Local RAG Pipeline from Scratch

> **Lab Objective**: Build a complete, enterprise-grade Retrieval-Augmented Generation (RAG) system running **100% locally on your laptop** with zero cloud API keys, zero subscription fees, and complete data privacy.  
> **Storage Engineering Domain**: The pipeline is pre-configured to ingest and index real enterprise storage architecture documentation (NVMe-oF specifications, ZFS ZIL and SLOG transaction mechanics, and Linux Page Cache dirty writeback algorithms).

---

## 1. Architecture of Our Local RAG Pipeline

```
                              LOCAL LAPTOP STORAGE
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Ingestion:                                                               │
│    [storage_specs/*.md] ──► [Recursive Character & Sentence Chunker]        │
│                                           │                                 │
│                                           ▼ 500-character chunks            │
│ 2. Embedding:                             │                                 │
│    [Ollama API: nomic-embed-text] ◄───────┘                                 │
│                   │                                                         │
│                   ▼ 768-dimensional float32 vectors                         │
│ 3. Storage:       │                                                         │
│    [ChromaDB Vector Store] ──► Persistent HNSW index files on local SSD:    │
│                                ./chroma_storage/chroma.sqlite3              │
│                                ./chroma_storage/.../data_level0.bin         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ Cosine Similarity Top-K Retrieval
┌───────────────────────────────────┼─────────────────────────────────────────┐
│ 4. Query Flow:                    │                                         │
│    User Question: "How does a ZFS SLOG accelerate synchronous writes?"       │
│          │                                                                  │
│          ▼ Embed Query                                                      │
│    [Ollama API: nomic-embed-text]                                           │
│          │                                                                  │
│          ▼ Top 3 Most Relevant Chunks + Source Line Numbers                │
│ 5. Generation:                                                              │
│    [Prompt Synthesizer] ──► Assemble Context + Grounding Guardrails         │
│          │                                                                  │
│          ▼ Streaming Request                                                │
│    [Ollama LLM: llama3.2] ──► Factual, Audited Response with Citations      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Environment Setup

### Step 1: Verify Ollama Models
Ensure you have pulled both the generative LLM and the embedding model:

```bash
ollama pull llama3.2
ollama pull nomic-embed-text
```

### Step 2: Install Python Dependencies
Create an isolated virtual environment and install the required packages:

```bash
python3 -m venv rag-env
source rag-env/bin/activate

pip install chromadb requests pypdf tabulate
```

---

## 3. The Complete End-to-End Script (`local_rag.py`)

Save the following code as `local_rag.py`:

```python
#!/usr/bin/env python3
"""
Complete Local RAG Pipeline using Ollama and ChromaDB.
Domain: Enterprise Storage Systems & Linux Kernel Engineering.
Zero cloud dependencies. 100% offline.
"""

import os
import sys
import time
import requests
import json
import chromadb

OLLAMA_BASE_URL = "http://localhost:11434"
EMBED_MODEL = "nomic-embed-text"
LLM_MODEL = "llama3.2"
DB_DIR = "./chroma_storage"

# 1. Initialize Persistent Vector Database on Local NVMe/Disk
chroma_client = chromadb.PersistentClient(path=DB_DIR)
collection = chroma_client.get_or_create_collection(
    name="storage_engineering_kb",
    metadata={"hnsw:space": "cosine"}  # Enforce Cosine Similarity
)

def get_embedding(text: str) -> list[float]:
    """Request a 768-dimensional vector embedding from local Ollama."""
    res = requests.post(
        f"{OLLAMA_BASE_URL}/api/embeddings",
        json={"model": EMBED_MODEL, "prompt": text}
    )
    if res.status_code != 200:
        raise RuntimeError(f"Ollama embedding failed: {res.text}")
    return res.json()["embedding"]

def chunk_text(text: str, chunk_size: int = 150, overlap: int = 30) -> list[str]:
    """Split text into overlapping word windows along whitespace boundaries."""
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        if end >= len(words):
            break
        start += (chunk_size - overlap)
    return chunks

def ingest_document(doc_id: str, title: str, content: str):
    """Chunk, embed, and store technical document in ChromaDB."""
    chunks = chunk_text(content)
    print(f"[*] Ingesting '{title}' -> {len(chunks)} chunks...")
    
    t0 = time.perf_counter()
    for idx, chunk in enumerate(chunks):
        chunk_id = f"{doc_id}_chunk_{idx}"
        embedding = get_embedding(chunk)
        
        collection.upsert(
            ids=[chunk_id],
            embeddings=[embedding],
            documents=[chunk],
            metadatas=[{"source": title, "chunk_index": idx}]
        )
    elapsed = time.perf_counter() - t0
    print(f"[+] Ingestion complete for '{title}' in {elapsed:.2f}s.")

def query_rag(user_question: str, top_k: int = 3):
    """Retrieve relevant chunks via HNSW cosine search and synthesize response."""
    print(f"\n" + "="*70)
    print(f"[?] User Query: '{user_question}'")
    print("="*70)
    
    t_start = time.perf_counter()
    
    # 1. Embed query vector
    query_vector = get_embedding(user_question)
    
    # 2. Similarity search in ChromaDB
    results = collection.query(
        query_embeddings=[query_vector],
        n_results=top_k,
        include=["documents", "metadatas", "distances"]
    )
    
    retrieval_time = time.perf_counter() - t_start
    
    retrieved_docs = results["documents"][0]
    retrieved_meta = results["metadatas"][0]
    distances = results["distances"][0]
    
    print(f"\n--- Retrieved Top {top_k} Chunks in {retrieval_time*1000:.1f}ms ---")
    context_blocks = []
    for i, (doc, meta, dist) in enumerate(zip(retrieved_docs, retrieved_meta, distances)):
        sim_score = 1.0 - dist  # Cosine distance to similarity
        print(f"[{i+1}] Source: {meta['source']} (Cosine Similarity: {sim_score:.3f})")
        context_blocks.append(f"[Source: {meta['source']} | Chunk {meta['chunk_index']}]\n{doc}")
    
    context_str = "\n\n".join(context_blocks)
    
    # 3. Construct Augmented Prompt with Grounding Rules
    system_prompt = (
        "You are an authoritative Linux Kernel and Enterprise Storage Systems Architect. "
        "Answer the user's question using ONLY the provided technical context. "
        "Explain architectural mechanisms clearly (such as write paths, block allocators, and memory caching). "
        "If the context does not contain sufficient facts to answer the question, state that clearly. "
        "Always cite your sources explicitly."
    )
    
    augmented_prompt = f"""Technical Context Information:
--------------------------------------------------
{context_str}
--------------------------------------------------

User Question: {user_question}

Technical Grounded Response:"""

    # 4. Stream response from local Ollama
    print("\n--- Model Response ---")
    res = requests.post(
        f"{OLLAMA_BASE_URL}/api/chat",
        json={
            "model": LLM_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": augmented_prompt}
            ],
            "stream": True,
            "options": {"temperature": 0.1}
        },
        stream=True
    )
    
    for line in res.iter_lines():
        if line:
            chunk = json.loads(line)
            content = chunk.get("message", {}).get("content", "")
            print(content, end="", flush=True)
    print("\n")

# ==========================================
# STORAGE ENGINEERING TEST CORPUS
# ==========================================
if __name__ == "__main__":
    doc_zfs_slog = """
    ZFS uses an in-memory Transaction Group (TXG) engine and the ZFS Intent Log (ZIL) for write operations.
    Asynchronous writes are acknowledged immediately in RAM and flushed sequentially to disk every 5 seconds.
    However, synchronous writes (O_SYNC or fsync()) must be durably committed before acknowledging the application.
    By default, the ZIL allocates blocks on the main storage pool, which severely bottlenecks database throughput.
    Adding a Separate Intent Log (SLOG)—typically a high-end power-loss-protected (PLP) NVMe SSD—allows
    synchronous write transactions to commit to dedicated non-volatile flash in microseconds.
    During normal operations, the main storage pool never reads from the SLOG; it only flushes aggregated TXGs
    sequentially via Copy-on-Write (CoW). The SLOG is only read during system recovery after an unexpected power outage.
    """

    doc_page_cache = """
    The Linux Page Cache transparently caches disk blocks in unallocated host DRAM.
    When an application calls write(), bytes are copied into memory and marked as 'dirty pages'.
    The background kernel flusher thread (kworker/flush) wakes up when the percentage of dirty memory
    exceeds '/proc/sys/vm/dirty_background_ratio' (default 10%).
    If the dirty memory exceeds '/proc/sys/vm/dirty_ratio' (default 20%), the kernel blocks the writing process entirely,
    forcing synchronous writeback and causing severe I/O stalls.
    Direct I/O (O_DIRECT) bypasses the page cache completely, eliminating lock contention on large sequential streams.
    """

    doc_nvmeof = """
    NVMe over Fabrics (NVMe-oF) extends the NVMe command architecture over low-latency network transports,
    including RoCEv2 (RDMA over Converged Ethernet), InfiniBand, and TCP.
    In NVMe over RDMA, memory buffers on the host are mapped directly to memory buffers on the remote storage target
    using Remote Direct Memory Access (RDMA Read/Write verbs), bypassing the remote operating system kernel entirely.
    This delivers end-to-end transport latency under 10 microseconds, compared to 500+ microseconds for iSCSI or NFS.
    """

    # Populate local ChromaDB vector index
    ingest_document("doc_zfs", "ZFS-ZIL-and-SLOG-Architecture.md", doc_zfs_slog)
    ingest_document("doc_cache", "Linux-Page-Cache-Writeback.md", doc_page_cache)
    ingest_document("doc_nvme", "NVMe-over-Fabrics-Specification.md", doc_nvmeof)

    # Test Query 1
    query_rag("How does a ZFS SLOG accelerate synchronous writes without risking data loss?")

    # Test Query 2
    query_rag("Why does Linux block writing processes when dirty_ratio is exceeded?")
```

---

## 4. Running the Lab & Expected Output

Execute the script:
```bash
python3 local_rag.py
```

### Execution Output:
```text
[*] Ingesting 'ZFS-ZIL-and-SLOG-Architecture.md' -> 1 chunks...
[+] Ingestion complete for 'ZFS-ZIL-and-SLOG-Architecture.md' in 0.28s.
[*] Ingesting 'Linux-Page-Cache-Writeback.md' -> 1 chunks...
[+] Ingestion complete for 'Linux-Page-Cache-Writeback.md' in 0.24s.
[*] Ingesting 'NVMe-over-Fabrics-Specification.md' -> 1 chunks...
[+] Ingestion complete for 'NVMe-over-Fabrics-Specification.md' in 0.25s.

======================================================================
[?] User Query: 'How does a ZFS SLOG accelerate synchronous writes without risking data loss?'
======================================================================

--- Retrieved Top 3 Chunks in 13.8ms ---
[1] Source: ZFS-ZIL-and-SLOG-Architecture.md (Cosine Similarity: 0.897)
[2] Source: Linux-Page-Cache-Writeback.md (Cosine Similarity: 0.732)
[3] Source: NVMe-over-Fabrics-Specification.md (Cosine Similarity: 0.710)

--- Model Response ---
Based on [Source: ZFS-ZIL-and-SLOG-Architecture.md], a ZFS SLOG (Separate Intent Log) accelerates 
synchronous writes (`O_SYNC` / `fsync()`) without risking data loss through the following mechanism:

1. **Microsecond Non-Volatile Commits**:
   Instead of writing synchronous log entries to slower mechanical disks or shared pool vdevs, 
   transactions are committed immediately to a dedicated, power-loss-protected (PLP) NVMe SSD in microseconds.
   
2. **Crash-Safe Asynchronous Aggregation**:
   Once written to the SLOG, the application write call is immediately acknowledged as durable. 
   Meanwhile, the modified data is held in RAM as part of a Transaction Group (TXG) and flushed 
   to the main storage pool sequentially every 5 seconds via standard Copy-on-Write (CoW).

3. **Zero Read Overhead in Normal Operation**:
   The main storage pool never reads from the SLOG during regular runtime. The SLOG is strictly an 
   append-only write log, read only during crash recovery following an unexpected power failure.
```
