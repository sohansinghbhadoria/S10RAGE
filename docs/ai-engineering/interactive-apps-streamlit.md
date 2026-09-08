---
id: interactive-apps-streamlit
title: "Hands-On Lab: Interactive AI Chatbots & Agent Dashboards with Streamlit"
sidebar_label: "8. Lab: Streamlit AI Apps"
sidebar_position: 8
---

# Hands-On Lab: Interactive AI Chatbots & Agent Dashboards with Streamlit

> **Lab Objective**: Build a modern, full-stack web application in pure Python using **Streamlit** that integrates both your **Local Storage RAG Pipeline** and **Autonomous Storage SRE Agent** with real-time streaming tokens and an expandable reasoning trace.

---

## 1. Application Architecture: Storage Engineering AI Studio

```
+----------------------------------------------------------------------------+
|                  Storage Engineering AI Studio (Streamlit :8501)          |
|                                                                            |
|  +--------------------+  +----------------------------------------------+  |
|  | Sidebar Controls   |  | Main Chat Canvas                             |  |
|  | - Model Selector   |  |                                              |  |
|  | - Temp Slider      |  | [User: "Check RAID-6 usable capacity for     |  |
|  | - Storage Docs RAG |  |         8x16TB drives and diagnose /dev/nvme"]|  |
|  |   Uploader         |  |                                              |  |
|  | - Storage SRE Agent|  | [Agent Status Box (Expandable Thought)]      |  |
|  |   Toggle           |  |  * Invoking calculate_raid(8, 16, '6')...   |  |
|  |                    |  |  * Result: 96 TB Usable (87.31 TiB), 6x Pen. |  |
|  |                    |  |                                              |  |
|  |                    |  | [Assistant Streaming Token Response...]      |  |
|  +--------------------+  +----------------------------------------------+  |
+-------------------------------------+--------------------------------------+
                                      |
         +----------------------------+----------------------------+
         |                                                         |
         v                                                         v
+-------------------------------+                         +------------------+
| Local Ollama LLM Engine       |                         | ChromaDB Store   |
| (http://localhost:11434)      |                         | (Local Vectors)  |
+-------------------------------+                         +------------------+
```

---

## 2. Environment Setup

Install Streamlit and dependencies:

```bash
pip install streamlit requests chromadb psutil
```

Ensure Ollama is running:
```bash
ollama serve
```

---

## 3. The Complete Streamlit Application (`app.py`)

Save the following code as `app.py`:

```python
"""
Storage Engineering AI Studio in Streamlit.
Full-stack RAG pipeline and Autonomous SRE Agent powered by 100% Local Ollama.
"""

import streamlit as st
import requests
import json
import psutil
import chromadb
import time

# Page Configuration
st.set_page_config(
    page_title="S10RAGE AI Studio",
    page_icon="💾",
    layout="wide"
)

OLLAMA_BASE_URL = "http://localhost:11434"

# -------------------------------------------------------------
# 1. SIDEBAR CONTROLS & SESSION STATE
# -------------------------------------------------------------
st.sidebar.title("💾 S10RAGE AI Studio")
st.sidebar.markdown("*Storage Systems Architecture & Local LLM Lab*")

# Model Selection
available_models = ["llama3.2", "llama3.1:8b", "mistral", "qwen2.5:3b", "deepseek-r1:8b"]
selected_model = st.sidebar.selectbox("Active Foundation Model", available_models, index=0)

# Inference Hyperparameters
temperature = st.sidebar.slider("Sampling Temperature", min_value=0.0, max_value=1.5, value=0.1, step=0.05)
enable_agent = st.sidebar.toggle("Enable Autonomous Storage SRE Agent", value=True)

# Document Upload for Instant Storage RAG
st.sidebar.subheader("📄 Ingest Storage Technical Specs")
uploaded_file = st.sidebar.file_uploader("Upload Markdown / Text Storage Manuals", type=["txt", "md"])

# Initialize Chat Memory
if "messages" not in st.session_state:
    st.session_state.messages = [
        {
            "role": "assistant",
            "content": (
                "Hello! I am your **Autonomous Storage Systems Architect Copilot**. "
                "I can analyze storage protocols (NVMe-oF, Ceph, ZFS), calculate RAID capacities & write penalties, "
                "inspect real-time laptop disk I/O metrics, or answer questions from your uploaded technical manuals."
            )
        }
    ]

# -------------------------------------------------------------
# 2. LOCAL VECTOR DATABASE FOR RAG
# -------------------------------------------------------------
@st.cache_resource
def get_vector_db():
    client = chromadb.PersistentClient(path="./streamlit_chroma_db")
    return client.get_or_create_collection(name="storage_manuals", metadata={"hnsw:space": "cosine"})

vector_db = get_vector_db()

def get_embedding(text: str) -> list[float]:
    res = requests.post(
        f"{OLLAMA_BASE_URL}/api/embeddings",
        json={"model": "nomic-embed-text", "prompt": text}
    )
    return res.json()["embedding"]

# Handle Document Ingestion
if uploaded_file is not None:
    content = uploaded_file.read().decode("utf-8")
    words = content.split()
    chunks = [" ".join(words[i:i+150]) for i in range(0, len(words), 120)]
    
    with st.sidebar.status("Indexing storage manual into ChromaDB..."):
        for idx, chunk in enumerate(chunks):
            embedding = get_embedding(chunk)
            vector_db.upsert(
                ids=[f"{uploaded_file.name}_{idx}"],
                embeddings=[embedding],
                documents=[chunk],
                metadatas=[{"source": uploaded_file.name, "chunk": idx}]
            )
        st.sidebar.success(f"Successfully indexed {len(chunks)} chunks from {uploaded_file.name}!")

# -------------------------------------------------------------
# 3. AUTONOMOUS STORAGE SRE AGENT TOOLS
# -------------------------------------------------------------
def calculate_raid(disks: int, size_tb: float, raid_level: str) -> str:
    r = str(raid_level).upper().replace("RAID", "").strip()
    if r == "0":
        usable = disks * size_tb
        penalty = "1x"
    elif r == "1":
        usable = size_tb
        penalty = "2x"
    elif r == "5":
        usable = (disks - 1) * size_tb
        penalty = "4x (Read-Modify-Write)"
    elif r == "6":
        usable = (disks - 2) * size_tb
        penalty = "6x (Dual-Parity Read-Modify-Write)"
    elif r == "10":
        usable = (disks / 2) * size_tb
        penalty = "2x"
    else:
        usable = disks * size_tb
        penalty = "Unknown"
    
    tib = round(usable * (1000**4) / (1024**4), 2)
    return json.dumps({
        "raid_level": f"RAID-{r}",
        "raw_tb": disks * size_tb,
        "usable_tb": usable,
        "usable_tib": tib,
        "write_penalty": penalty
    })

def get_live_storage_telemetry() -> str:
    disk = psutil.disk_usage('/')
    io_counters = psutil.disk_io_counters()
    return json.dumps({
        "mount": "/",
        "total_gb": round(disk.total / (1024**3), 2),
        "used_gb": round(disk.used / (1024**3), 2),
        "free_gb": round(disk.free / (1024**3), 2),
        "percent_used": disk.percent,
        "read_bytes_mb": round(io_counters.read_bytes / (1024**2), 2),
        "write_bytes_mb": round(io_counters.write_bytes / (1024**2), 2)
    })

def recommend_io_scheduler(device_type: str) -> str:
    dev = device_type.lower().strip()
    if "nvme" in dev or "ssd" in dev:
        rec = "none (or kyber)"
        rationale = "NVMe drives possess up to 64,000 hardware queues. OS-level elevator algorithms introduce lock contention."
    else:
        rec = "bfq (or mq-deadline)"
        rationale = "Rotating magnetic media benefits from elevator sector merging to minimize physical head seek times."
    return json.dumps({"media": device_type, "recommended_scheduler": rec, "rationale": rationale})

TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "calculate_raid",
            "description": "Calculate raw capacity, usable capacity in TB/TiB, and random write penalty for RAID arrays (0, 1, 5, 6, 10).",
            "parameters": {
                "type": "object",
                "properties": {
                    "disks": {"type": "integer", "description": "Number of drives in the storage array"},
                    "size_tb": {"type": "number", "description": "Capacity of each disk in Terabytes"},
                    "raid_level": {"type": "string", "description": "RAID level: '0', '1', '5', '6', or '10'"}
                },
                "required": ["disks", "size_tb", "raid_level"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_live_storage_telemetry",
            "description": "Inspect real-time laptop root disk utilization, free gigabytes, and cumulative read/write I/O bytes.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "recommend_io_scheduler",
            "description": "Recommend optimal Linux kernel block I/O schedulers based on storage media (NVMe vs SATA SSD vs HDD).",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_type": {"type": "string", "description": "'nvme', 'sata_ssd', or 'hdd'"}
                },
                "required": ["device_type"]
            }
        }
    }
]

# -------------------------------------------------------------
# 4. CHAT CANVAS & INTERACTION
# -------------------------------------------------------------
st.title("💾 S10RAGE Interactive AI Engineering Studio")
st.caption(f"Active Model: `{selected_model}` | Knowledge Base Chunks: `{vector_db.count()}` | Agent Status: `{'Enabled' if enable_agent else 'Disabled'}`")

# Render Conversation History
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

# User Input
if prompt := st.chat_input("Ask a storage question, calculate RAID pools, or query uploaded manuals..."):
    # Render User Message
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    # Prepare Assistant Response
    with st.chat_message("assistant"):
        # 1. RAG Context Search (if documents are uploaded)
        rag_context = ""
        if vector_db.count() > 0:
            query_emb = get_embedding(prompt)
            rag_results = vector_db.query(query_embeddings=[query_emb], n_results=2)
            if rag_results["documents"] and len(rag_results["documents"][0]) > 0:
                chunks = rag_results["documents"][0]
                sources = [m["source"] for m in rag_results["metadatas"][0]]
                rag_context = "\n\nRetrieved Technical Context:\n" + "\n".join(chunks)
                with st.expander(f"🔍 Retrieved {len(chunks)} Context Chunks from {set(sources)}"):
                    for c in chunks:
                        st.info(c)

        # 2. Agent Reasoning & Tool Calling
        agent_messages = [
            {
                "role": "system",
                "content": (
                    "You are S10RAGE AI, an authoritative Linux Kernel and Storage Infrastructure Architect. "
                    "You have access to tools that calculate RAID capacity & write penalties, inspect local disk metrics, "
                    "and recommend kernel I/O schedulers. Use them whenever calculations or telemetry are requested. "
                    f"{rag_context}"
                )
            }
        ]
        for m in st.session_state.messages[-4:]:
            agent_messages.append({"role": m["role"], "content": m["content"]})

        tools_to_pass = TOOLS_SCHEMA if enable_agent else []
        
        # Call Ollama API
        api_payload = {
            "model": selected_model,
            "messages": agent_messages,
            "tools": tools_to_pass,
            "stream": False,
            "options": {"temperature": temperature}
        }
        
        res = requests.post(f"{OLLAMA_BASE_URL}/api/chat", json=api_payload).json()
        model_msg = res.get("message", {})
        
        # Check for Tool Calls
        if model_msg.get("tool_calls"):
            with st.status("Storage SRE Agent executing diagnostic tools...", expanded=True) as status:
                for tc in model_msg["tool_calls"]:
                    fn_name = tc["function"]["name"]
                    fn_args = tc["function"]["arguments"]
                    st.write(f"⚙️ **Invoking Tool**: `{fn_name}` with arguments `{fn_args}`")
                    
                    if fn_name == "calculate_raid":
                        tool_res = calculate_raid(**fn_args)
                    elif fn_name == "get_live_storage_telemetry":
                        tool_res = get_live_storage_telemetry()
                    elif fn_name == "recommend_io_scheduler":
                        tool_res = recommend_io_scheduler(**fn_args)
                    else:
                        tool_res = "Tool not recognized"
                    
                    st.write(f"📥 **Tool Result**: `{tool_res}`")
                    agent_messages.append(model_msg)
                    agent_messages.append({"role": "tool", "content": tool_res})
                status.update(label="Diagnostic tools completed successfully!", state="complete", expanded=False)
            
            # Final Answer Synthesis
            api_payload["messages"] = agent_messages
            api_payload["tools"] = []
            api_payload["stream"] = True
            
            stream_res = requests.post(f"{OLLAMA_BASE_URL}/api/chat", json=api_payload, stream=True)
            
            def token_generator():
                for line in stream_res.iter_lines():
                    if line:
                        chunk = json.loads(line)
                        yield chunk.get("message", {}).get("content", "")
            
            response_text = st.write_stream(token_generator())
        else:
            # Standard Text Response (Streaming)
            api_payload["stream"] = True
            stream_res = requests.post(f"{OLLAMA_BASE_URL}/api/chat", json=api_payload, stream=True)
            
            def token_generator():
                for line in stream_res.iter_lines():
                    if line:
                        chunk = json.loads(line)
                        yield chunk.get("message", {}).get("content", "")
            
            response_text = st.write_stream(token_generator())

        st.session_state.messages.append({"role": "assistant", "content": response_text})
```

---

## 4. Running the Web Application

Launch the Streamlit app from your terminal:

```bash
streamlit run app.py
```

Open `http://localhost:8501` to test:
- Interactive conversations on Linux I/O paths, NVMe-oF, and file systems.
- Drag-and-drop ingestion of storage technical documentation.
- Live Autonomous Agent tool execution for RAID sizing and disk telemetry.
