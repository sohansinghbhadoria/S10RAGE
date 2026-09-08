---
id: local-llms-ollama
title: "Local LLM Engineering: Running Open-Source Models with Ollama"
sidebar_label: "5. Local LLMs with Ollama"
sidebar_position: 5
---

# Local LLM Engineering: Running Open-Source Models with Ollama

> **Target Audience**: AI Systems Engineers, Performance Architects, and Infrastructure Operators.  
> **Core Objective**: Master local-first LLM deployment using **Ollama** and **llama.cpp**, from the binary anatomy of GGUF files and `mmap` storage mechanics to quantization algorithms and local NVMe cold-start optimization.

---

## 1. Why Local LLMs? Architectural & Systems Analysis

| Dimension | Cloud SaaS APIs (OpenAI / Anthropic) | Local Execution (Ollama / llama.cpp) |
|---|---|---|
| **Data Privacy** | Prompts, proprietary IP, and logs leave your infrastructure boundary. | **Zero Data Egress**: Operates 100% air-gapped and offline. |
| **Storage & I/O** | Dependent on remote HTTP REST APIs and public network transit. | Direct memory bus transfers and local NVMe block access. |
| **Cost Scaling** | Pay-per-token model; costs scale linearly with batch size and context. | **Zero Marginal Cost**: Fixed hardware cost; unlimited tokens. |
| **Latency Profile** | Variable (150ms - 2,500ms) due to Internet jitter and cloud queues. | **Deterministic Sub-Millisecond** latency directly on PCIe / UMA bus. |

---

## 2. Under the Hood: The GGUF Format & Memory-Mapped Storage (`mmap`)

Modern local inference does not load multi-gigabyte models into memory using traditional `read()` system calls. Instead, it relies on the **GGUF (GPT-Generated Unified Format)** file standard and Linux **`mmap` (Memory-Mapped I/O)**.

```
+-------------------------------------------------------------------------------+
|                       GGUF File Binary Layout On Disk                         |
|                                                                               |
|  +-------------------------------------------------------------------------+  |
|  | Magic Header: "GGUF" (0x46554747) + Version (e.g. 3)                    |  |
|  +-------------------------------------------------------------------------+  |
|  | Tensor Count: uint64 | Metadata KV Count: uint64                        |  |
|  +-------------------------------------------------------------------------+  |
|  | Metadata Key-Value Table:                                               |  |
|  | - architecture = "llama"                                                |  |
|  | - context_length = 131072                                               |  |
|  | - block_count = 32 | head_count = 32                                    |  |
|  | - tokenizer.ggml.tokens = [ ... ]                                       |  |
|  +-------------------------------------------------------------------------+  |
|  | Tensor Information Table:                                               |  |
|  | - Name: "blk.0.attn_q.weight" | Dimensions: [4096, 4096] | Type: Q4_K_M    |  |
|  | - Offset: uint64 (Aligned to 32-byte boundary)                          |  |
|  +-------------------------------------------------------------------------+  |
|  | Binary Tensor Data Section (Raw Quantized Floats/Ints)                  |  |
|  | [Weight Block 0] [Weight Block 1] ... [Weight Block N]                  |  |
|  +-------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------+
                                        │
                                        ▼ sys_mmap(PROT_READ, MAP_SHARED)
+-------------------------------------------------------------------------------+
| Linux Virtual Memory Space (Zero-Copy Demand Paging via Linux Page Cache)     |
+-------------------------------------------------------------------------------+
```

### Why `mmap` is Critical for Local Storage Performance
When Ollama opens a 16 GB GGUF model:
1. It calls `mmap(NULL, file_size, PROT_READ, MAP_SHARED, fd, 0)`.
2. **Zero Bytes are Copied into RAM Initially**: The operating system assigns virtual memory page table entries pointing directly to the file on disk.
3. **Demand Paging**: As the GPU/CPU accesses specific layer weights during the forward pass, the Linux kernel triggers minor page faults, streaming only the requested weights into memory directly from the NVMe SSD.
4. **Instant Startup**: Model initialization takes **sub-100 milliseconds** because the engine does not wait for a monolithic 16 GB file read to finish!

---

## 3. Storage I/O Benchmark: NVMe vs. SATA in Model Cold-Starts

When model weights are not pre-warmed in the OS Page Cache, initial load latency is strictly governed by your physical storage controller throughput:

$$
\text{Cold-Start Time (Seconds)} = \frac{\text{Model GGUF Size (GB)}}{\text{Sequential Read Throughput (GB/s)}}
$$

| Storage Media | Sequential Read Bandwidth | 8B Model (4.7 GB) Cold-Start | 70B Model (40 GB) Cold-Start |
|---|---|---|---|
| **Mechanical HDD** | 180 MB/s ($0.18\text{ GB/s}$) | 26.1 seconds | 222.2 seconds (3.7 mins!) |
| **SATA III SSD** | 520 MB/s ($0.52\text{ GB/s}$) | 9.0 seconds | 76.9 seconds |
| **PCIe Gen3 NVMe** | 3,500 MB/s ($3.50\text{ GB/s}$) | 1.3 seconds | 11.4 seconds |
| **PCIe Gen4 NVMe** | 7,200 MB/s ($7.20\text{ GB/s}$) | 0.65 seconds | 5.5 seconds |
| **PCIe Gen5 NVMe** | 14,000 MB/s ($14.0\text{ GB/s}$)| **0.33 seconds** | **2.8 seconds** |
| **Apple Silicon UMA**| Up to 800 GB/s (Internal) | **Zero-Copy Instantaneous** | **Zero-Copy Instantaneous** |

---

## 4. Quantization Mathematics: Compressing Neural Weights

Foundation models are trained in FP16/BF16 (16-bit floating point, 2 bytes per weight). **Quantization** maps 16-bit real numbers into compact low-bit integer representations.

### Block-Wise Linear Quantization (Q4_0 / Q8_0)
Rather than quantizing the entire matrix with a single scale factor (which causes large rounding errors when outliers are present), weights are partitioned into small blocks of $B = 32$ numbers:

For block $\mathbf{w} = [w_1, \dots, w_{32}]$:
1. Calculate the maximum absolute value in the block:
   $$d = \frac{\max_{i} |w_i|}{2^{b-1} - 1}$$
   *(where $b$ is the target bit width, e.g., $b=4$ for 4-bit quantization)*.
2. Quantize each weight to a signed integer:
   $$q_i = \text{round}\left(\frac{w_i}{d}\right) \in [-8, 7]$$
3. Store the 32 small 4-bit integers alongside a single 16-bit scale factor $d$.
4. **De-quantization during inference**:
   $$\hat{w}_i = q_i \times d$$

Advanced schemes (like **Q4_K_M**) use variable quantization depths—allocating 6 bits to critical attention and output projection layers while using 4 bits for non-critical feed-forward weights.

---

## 5. Ollama Installation & Setup

```bash
# macOS (Apple Silicon or Intel)
brew install ollama

# Linux (Debian, Ubuntu, RHEL, Arch)
curl -fsSL https://ollama.com/install.sh | sh

# Verify installation
ollama --version
```

Start the daemon:
```bash
ollama serve
```

### Essential CLI Operations
```bash
# Pull model weights directly to ~/.ollama/models
ollama pull llama3.2
ollama pull nomic-embed-text

# List local models and storage footprint
ollama list

# Inspect model architecture, quantization type, and context window
ollama show llama3.2 --modelfile
```

---

## 6. Custom Modelfiles: Building Domain Storage Personas

Create `StorageArchitect.Modelfile`:
```dockerfile
FROM llama3.2:latest

# Sampling hyperparameters
PARAMETER temperature 0.1
PARAMETER top_p 0.9
PARAMETER num_ctx 8192
PARAMETER stop "<|eot_id|>"
PARAMETER stop "<|end_of_text|>"

# Authoritative Systems Persona
SYSTEM """
You are S10RAGE AI, an authoritative Linux Kernel and Storage Infrastructure Architect.
You specialize in NVMe-oF, Ceph BlueStore, ZFS, io_uring, and performance engineering.
Provide rigorous, technically accurate explanations with concrete CLI flags and equations.
"""
```

Build and register the custom model:
```bash
ollama create s10rage-architect -f StorageArchitect.Modelfile
ollama run s10rage-architect "Explain how ZFS ZIL and SLOG accelerate synchronous writes."
```

---

## 7. Ollama REST API Integration

Ollama provides a native HTTP REST API listening on port 11434.

### 1. Generating Embeddings (`/api/embeddings`)
```bash
curl -s http://localhost:11434/api/embeddings -d '{
  "model": "nomic-embed-text",
  "prompt": "NVMe queue depth tuning with fio"
}' | jq '.embedding[:5]'
```

### 2. Streaming Chat Completion via Python
```python
import requests
import json

payload = {
    "model": "llama3.2",
    "messages": [
        {"role": "system", "content": "You are a Linux storage kernel engineer."},
        {"role": "user", "content": "How does io_uring eliminate context switch overhead?"}
    ],
    "stream": True,
    "options": {"temperature": 0.2, "num_ctx": 4096}
}

res = requests.post("http://localhost:11434/api/chat", json=payload, stream=True)

print("Assistant: ", end="", flush=True)
for line in res.iter_lines():
    if line:
        chunk = json.loads(line)
        content = chunk.get("message", {}).get("content", "")
        print(content, end="", flush=True)
print()
```
