---
id: query-lifecycle
title: "Under the Hood: The Complete End-to-End Query Lifecycle in ChatGPT & LLMs"
sidebar_label: "2. ChatGPT Query Lifecycle"
sidebar_position: 2
---

# Under the Hood: The Complete End-to-End Query Lifecycle in ChatGPT & LLMs

> **Target Audience**: AI Researchers, Kernel Storage Engineers, and Performance Architects.  
> **Core Objective**: Dissect the complete mathematical, algorithmic, and storage memory lifecycle of a single prompt—from subword BPE tokenization and RoPE positional rotations to GPU memory bandwidth bottlenecks, PagedAttention virtual memory systems, and NVMe KV-cache offloading.

When a user submits a prompt, modern LLMs execute a precise, dual-phase inference process: a **compute-bound Prefill Phase** followed by a **memory-bandwidth-bound Autoregressive Decode Loop**.

---

## 1. High-Level Architectural Pipeline

```
User Prompt: "Why is NVMe faster than SATA?"
   │
   ▼
[1. Tokenizer (BPE)] ──► Breaks string into Token IDs: [15438, 374, 38721, 6214, 1109, 58498, 30]
   │
   ▼
[2. Embedding Projection] ──► Lookup in Embedding Matrix W_E -> Vector X_0 in R^{N x 4096}
   │
   ▼
[3. Rotary Positional Encoding (RoPE)] ──► Injects sequence coordinates via 2D plane rotations
   │
   ▼
[4. PREFILL PHASE (Prompt Ingestion)]
   Parallel GEMM forward pass across all prompt tokens.
   Computes and stores Key-Value (KV) tensors in GPU Memory via PagedAttention.
   │
   ▼
┌──[5. AUTOREGRESSIVE DECODE LOOP (Token-by-Token)]──────────────────────────────────────────────┐
│                                                                                                │
│   a. GEMV Forward Pass on latest single token (T_i) using cached past Key/Value tensors        │
│   b. Final RMSNorm + Unembedding Projection W_U ──► Vocabulary Logits (Vector in R^{128256})   │
│   c. Temperature Scaling + Top-P / Top-K / Min-P Sampling ──► Samples Next Token ID (T_{i+1})  │
│   d. Append new (K, V) tensors to PagedAttention KV-Cache (or offload to NVMe if memory full)  │
│   e. Detokenize Token ID ──► UTF-8 Text Chunk                                                  │
│   f. Stream to Client via HTTP/2 Server-Sent Events (SSE)                                      │
│                                                                                                │
└─── Repeat until <|eot_id|> (End of Turn) or Max Tokens Reached ────────────────────────────────┘
```

---

## 2. Step 1: Subword Tokenization & Byte Pair Encoding (BPE)

An LLM operates strictly on discrete integer representations. Modern models employ **Byte Pair Encoding (BPE)** (such as OpenAI's `cl100k_base` or Meta's Llama 3 128K tokenizer).

BPE builds its vocabulary from single bytes (0-255) and iteratively merges the most frequently co-occurring byte pairs in the training corpus:

```
Step 0 (Byte Level):      ['S', 't', 'o', 'r', 'a', 'g', 'e']
Merge 1 ('t', 'o'):       ['S', 'to', 'r', 'a', 'g', 'e']
Merge 2 ('a', 'g'):       ['S', 'to', 'r', 'ag', 'e']
...
Final Vocabulary Entry:   "Storage" ──► Token ID: 47829
```

Because BPE operates down to raw bytes, it can represent any unicode sequence in existence without out-of-vocabulary (`<UNK>`) errors.

```python
import tiktoken

enc = tiktoken.get_encoding("cl100k_base")
prompt = "Why is NVMe faster than SATA?"
token_ids = enc.encode(prompt)

# Token IDs: [15438, 374, 38721, 6214, 1109, 58498, 30]
for tid in token_ids:
    print(f"Token ID {tid:5d} -> '{enc.decode([tid])}'")
```

---

## 3. Step 2: Embedding Layer & Rotary Position Embeddings (RoPE)

Token IDs $[t_1, t_2, \dots, t_N]$ index into the learned **Embedding Matrix** $W_E \in \mathbb{R}^{V \times d_{\text{model}}}$, producing continuous feature vectors $\mathbf{x}_i \in \mathbb{R}^{4096}$.

Because Transformer attention is order-agnostic, the network must inject positional information. Modern architectures discard static additive embeddings in favor of **Rotary Position Embedding (RoPE)** (Su et al., 2021).

### The Mathematics of RoPE
RoPE splits the $d$-dimensional Query and Key vectors into $d/2$ consecutive pairs of 2D coordinates: $[x_1, x_2], [x_3, x_4], \dots$. For token position $m$, each 2D sub-vector is multiplied by a 2D rotation matrix:

$$
R_{\Theta, m}^{(i)} = \begin{pmatrix} \cos(m \theta_i) & -\sin(m \theta_i) \\ \sin(m \theta_i) & \cos(m \theta_i) \end{pmatrix}
$$

where $\theta_i = 10000^{-2(i-1)/d}$.

When calculating the dot product between a query at position $m$ and a key at position $n$:

$$
\langle R_m q, R_n k \rangle = q^T R_m^T R_n k = q^T R_{n-m} k
$$

The attention score depends strictly on the **relative distance** $(n - m)$, allowing the model to smoothly extrapolate attention across long context windows.

---

## 4. Step 3: The Prefill Phase (Compute-Bound)

In the Prefill Phase, the model processes the entire prompt of $N$ tokens in parallel.

Because all input activations are known, every matrix operation is a **General Matrix-Matrix Multiplication (GEMM)**:
- High arithmetic intensity ($\text{FLOPs} / \text{Byte} \gg 1$).
- Satures GPU Tensor Cores (NVIDIA H100 achieves up to 989 TFLOPs of BF16 compute).
- Output: Computes the first generated token and populates the **Key-Value (KV) Cache** with Key and Value tensors for all $N$ prompt tokens across all layers.

---

## 5. Step 4: The Decode Phase (Memory-Bandwidth Bound)

Once prefill completes, the model generates output tokens sequentially. At step $i$, it passes only the single latest token into the network.

Every matrix operation in the decode phase degenerates into a **General Matrix-Vector Multiplication (GEMV)**:

$$
\mathbf{y} = W \mathbf{x} \quad \text{where } W \in \mathbb{R}^{d \times d}, \ \mathbf{x} \in \mathbb{R}^{d}
$$

### The Arithmetic Intensity Crisis
To compute a single forward pass for a 70B parameter model:
- The GPU must load **70 GB of weights** (at 8-bit quantization) from VRAM across the memory bus to the processing cores.
- Number of operations performed: $2 \times 70 \times 10^9 = 140 \text{ GFLOPs}$.
- Arithmetic Intensity:

$$
\frac{140 \times 10^9 \text{ FLOPs}}{70 \times 10^9 \text{ Bytes}} = 2 \text{ FLOPs/Byte}
$$

Modern GPUs (like the H100) are capable of over $150\text{ FLOPs/Byte}$. During generation, the GPU cores spend $98\%$ of their time **stalled waiting for memory bandwidth**.

This is why token generation throughput is strictly governed by memory bandwidth:

$$
\text{Max Generation Speed (Tokens/sec)} = \frac{\text{Memory Bandwidth (GB/s)}}{\text{Active Model Memory Footprint (GB)}}
$$

---

## 6. KV-Cache Storage Architecture: PagedAttention & NVMe Offloading

The Key-Value (KV) Cache stores past Key and Value vectors to prevent quadratic $O(N^2)$ recalculation of attention during decoding.

### Calculating KV-Cache Footprint
For sequence length $L$, the memory footprint is:

$$
\text{KV-Cache Size (Bytes)} = 2 \times n_{\text{layers}} \times n_{\text{kv\_heads}} \times d_{\text{head}} \times L \times \text{bytes\_per\_element}
$$

*Example*: For Llama 3 70B with 128,000 context length (BF16):
- $n_{\text{layers}} = 80$
- $n_{\text{kv\_heads}} = 8$ (Grouped-Query Attention)
- $d_{\text{head}} = 128$
- $L = 128{,}000$
- Element size = 2 bytes

$$
\text{KV-Cache} = 2 \times 80 \times 8 \times 128 \times 128{,}000 \times 2 = \mathbf{41.94\text{ GB per Single Concurrent User!}}
$$

At high concurrency, KV-cache memory rapidly exceeds available GPU VRAM.

```
+-------------------------------------------------------------------------------+
|                       PagedAttention Virtual Memory System                    |
|                        (vLLM / Kwon et al., 2023)                             |
|                                                                               |
|  Logical KV Blocks (Sequence: "The quick brown fox jumps...")                  |
|  [Block 0: "The quick"]  [Block 1: "brown fox"]  [Block 2: "jumps over"]      |
|           │                       │                       │                   |
|           ▼                       ▼                       ▼                   |
|  +-------------------------------------------------------------------------+  |
|  | Page Table: Block 0 -> Physical Frame 7                                 |  |
|  |             Block 1 -> Physical Frame 2                                 |  |
|  |             Block 2 -> Physical Frame 19                                |  |
|  +-------------------------------------------------------------------------+  |
|           │                       │                       │                   |
|           ▼                       ▼                       ▼                   |
|  Physical GPU HBM Frames (Non-Contiguous, Zero External Fragmentation)        |
|  [Frame 2: Block 1] ... [Frame 7: Block 0] ... [Frame 19: Block 2]            |
+-------------------------------------------------------------------------------+
                                        │
                                        │ Memory Exhaustion (Context > 64K)
                                        ▼ Tiered Storage Swap
+-------------------------------------------------------------------------------+
| Fast Local NVMe SSD Tier (io_uring Async Block Swapping)                      |
| Inactive KV-cache blocks are asynchronously staged to enterprise NVMe drives  |
| and paged back into GPU VRAM before generation resumes.                       |
+-------------------------------------------------------------------------------+
```

### 1. PagedAttention: Applying OS Paging to LLM Inference
Traditional serving systems allocated contiguous VRAM for the maximum possible context length (e.g., reserving 128K tokens of space even if the user only used 500 tokens). This caused **60% to 80% memory fragmentation**.

**PagedAttention** (pioneered by vLLM) applies the classical operating system concept of **Virtual Memory Paging** to the KV-Cache:
- Dynamic non-contiguous allocation in small blocks (e.g., 16 tokens per block).
- Eliminates external memory fragmentation entirely (dropping waste under 4%).
- Enables zero-copy prompt sharing across parallel decoding branches via Copy-on-Write (CoW).

### 2. Tiered KV-Cache Offloading to Local NVMe SSDs
When serving thousands of long-context sessions, active KV-cache blocks remain in GPU HBM, while idle or historical conversation segments are offloaded to **local NVMe storage** via asynchronous Linux `io_uring` direct I/O routines:
- Bandwidth: Enterprise PCIe Gen5 NVMe drives sustain $14\text{ GB/s}$ read speeds.
- Latency: Retrieving a 16-token KV-block ($10\text{ KiB}$) over NVMe takes $\approx 15\text{ µs}$, perfectly concealed behind current token computation.

---

## 7. Step 5: Sampling Mechanics & The Unembedding Projection

The final hidden vector $\mathbf{h} \in \mathbb{R}^{4096}$ is projected onto the vocabulary by the unembedding matrix $W_U \in \mathbb{R}^{4096 \times 128256}$, producing raw **Logits** $\mathbf{z}$:

$$
\mathbf{z} = \mathbf{h} W_U \in \mathbb{R}^{128256}
$$

### Sampling Algorithms
1. **Temperature Division**: $z_i \leftarrow z_i / T$. Lower temperatures magnify differences; higher temperatures equalize logits.
2. **Top-K Truncation**: Masks all logits outside the top $K$ values to $-\infty$.
3. **Top-P (Nucleus) Filter**: Calculates cumulative probabilities and masks all tokens outside the smallest set summing to $P$:

$$
\sum_{i \in \text{Top-P}} \text{softmax}(\mathbf{z})_i \ge P
$$

4. **Categorical Sampling**: Samples a token ID according to the normalized multinomial distribution.

---

## 8. Step 6: Detokenization & Streaming Protocol

Once the token ID is sampled:
1. **Detokenization**: The integer ID is mapped back to its corresponding UTF-8 byte chunk.
2. **HTTP/2 Server-Sent Events (SSE)**: The chunk is pushed over an open persistent HTTP connection:

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Transfer-Encoding: chunked

data: {"choices": [{"delta": {"content": " NVMe"}}]}
data: {"choices": [{"delta": {"content": " uses"}}]}
data: {"choices": [{"delta": {"content": " dedicated"}}]}
data: [DONE]
```

3. **Termination**: Loop breaks when `<|eot_id|>` is sampled or when maximum tokens is reached.
