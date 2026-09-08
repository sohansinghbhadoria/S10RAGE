---
id: overview
title: "AI Engineering: Transformers, LLM Architecture & Foundations"
sidebar_label: "1. AI & LLM Foundations"
sidebar_position: 1
---

# AI Engineering: Transformers, LLM Architecture & Foundations

> **Target Audience**: AI Researchers, Storage Architects, Systems Performance Engineers, and Infrastructure Specialists.  
> **Core Objective**: Master modern Generative AI from foundational neural mechanics and mathematical Transformer derivations to empirical scaling laws, checkpointing I/O bottlenecks, and GPUDirect Storage (GDS) architectures.

---

## 1. The Paradigm Shift: From Classical ML to Foundation Models

For decades, machine learning was defined by task-specific, supervised models. Building a sentiment analyzer or an entity extractor required manual feature engineering, custom architectures, and thousands of human-labeled samples:

```
Classical Machine Learning (Task-Specific, Supervised):
[Task Data] ──► [Feature Engineering] ──► [Train Specialized Model] ──► [Single Narrow Task]

Modern Foundation Models (Task-Agnostic, Self-Supervised):
[Trillions of Unlabeled Tokens] ──► [Next-Token Prediction] ──► [Base Foundation LLM]
                                                                        │
                   ┌─────────────────┬──────────────────────────────────┤
                   ▼                 ▼                                  ▼
             [Zero-Shot Q&A]    [Code Synthesis]              [Autonomous Storage Agents]
```

Modern Large Language Models (LLMs) are **foundation models**. Trained on web-scale text and code through self-supervised next-token prediction, they internalize grammar, world knowledge, mathematical reasoning, and API semantics.

---

## 2. The Transformer Primitive: Mathematical Derivation

Introduced by Vaswani et al. in 2017, the **Transformer** replaced recurrent neural networks (RNNs) and LSTMs by eliminating sequential temporal recurrences. Instead of processing tokens step-by-step ($O(N)$ sequential operations), Transformers process all tokens simultaneously using **Self-Attention**.

```
                           Scaled Dot-Product Attention
                           
                                 Q           K
                                 │           │
                                 └───► MatMul ◄───┘
                                         │
                                         ▼
                                    Scale (√d_k)
                                         │
                                         ▼
                                    Causal Mask (Optional)
                                         │
                                         ▼
                                      Softmax
                                         │
                                         └───► MatMul ◄─── V
                                                 │
                                                 ▼
                                              Output
```

### Mathematical Formulation
Let input sequence $X \in \mathbb{R}^{N \times d_{\text{model}}}$, where $N$ is sequence length and $d_{\text{model}}$ is hidden dimension. The input is projected into three distinct vector spaces via learned projection matrices $W_Q, W_K, W_V \in \mathbb{R}^{d_{\text{model}} \times d_k}$:

$$
Q = X W_Q, \quad K = X W_K, \quad V = X W_V
$$

The **Scaled Dot-Product Attention** is computed as:

$$
\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}} + M\right)V
$$

- **Attention Scores ($QK^T \in \mathbb{R}^{N \times N}$)**: Calculates the pairwise semantic correlation between every query token and key token.
- **Scaling Factor ($\sqrt{d_k}$)**: Prevents the dot product from growing excessively large for high dimensions. For large $d_k$, dot products have variance $d_k$, pushing the softmax function into regions with extremely small gradients ($\approx 0$), causing the vanishing gradient problem.
- **Causal Mask ($M$)**: An upper-triangular matrix where $M_{ij} = 0$ for $j \le i$ and $M_{ij} = -\infty$ for $j > i$. This ensures that in decoder-only models, token $i$ can only attend to preceding tokens $j \le i$, preventing information leakage from the future.
- **Softmax Normalization**: Computes row-wise probability distributions:

$$
\text{softmax}(S)_{ij} = \frac{\exp(S_{ij} - \max_k S_{ik})}{\sum_l \exp(S_{il} - \max_k S_{ik})}
$$
*(where subtracting $\max_k S_{ik}$ ensures numerical stability against floating-point overflow)*.

---

## 3. Scaling Laws: Compute, Parameters & Data

AI researchers quantify model training efficiency using empirical **Scaling Laws** (Kaplan et al., 2020; Chinchilla / Hoffmann et al., 2022).

### The Compute Equation
The total floating-point operations ($C$, in FLOPs) required to pre-train a decoder-only Transformer is approximated by:

$$
C \approx 6 N D
$$

where:
- $N$ is the number of non-embedding model parameters.
- $D$ is the number of training tokens ingested.
- The factor of $6$ stems from: $2$ FLOPs per parameter per token in the forward pass + $4$ FLOPs per parameter per token in the backward pass (gradients with respect to activations and weights).

### The Chinchilla Compute-Optimal Frontier
Hoffmann et al. demonstrated that for compute-optimal training, **model parameters and training tokens should scale in equal proportion**:

$$
N_{\text{opt}} \propto C^{0.5}, \quad D_{\text{opt}} \propto C^{0.5} \quad \implies \quad D \approx 20 N
$$

*Practical Implication*: A 70-billion parameter model (`llama3.1:70b`) requires at least:
$$70 \times 10^9 \times 20 = 1.4 \times 10^{12} \text{ tokens (1.4 Trillion Tokens)}$$
Llama 3 was trained on 15 Trillion tokens (significantly "over-trained" beyond Chinchilla optimality) to produce smaller, faster models that minimize inference latency and storage footprint.

---

## 4. Storage Architecture for AI Training & High-Performance Computing

In multi-thousand GPU clusters (e.g., NVIDIA H100/B200 clusters), **storage I/O is the primary source of GPU stall time and multi-million-dollar training delays**.

```
+-------------------------------------------------------------------------------+
|                       Multi-Node GPU AI Training Cluster                      |
|                                                                               |
|  Node 1 (8x H100 GPUs)       Node 2 (8x H100 GPUs)       Node K (8x H100 GPUs)|
|  +-----------------------+   +-----------------------+   +-------------------+|
|  | GPU HBM3e Memory      |   | GPU HBM3e Memory      |   | GPU HBM3e Memory  |
|  | (80GB @ 3.35 TB/s)    |   | (80GB @ 3.35 TB/s)    |   | (80GB @ 3.35 TB/s)|
|  +-----------+-----------+   +-----------+-----------+   +---------+---------+|
+--------------|---------------------------|-------------------------|----------+
               |                           |                         |
               v                           v                         v
+-------------------------------------------------------------------------------+
| 400 Gb/s RoCEv2 / InfiniBand Low-Latency Fabric (Lossless RDMA Network)       |
+--------------------------------------+----------------------------------------+
                                       │
                                       ▼ GPUDirect Storage (GDS) Direct DMA
+-------------------------------------------------------------------------------+
| Parallel Distributed File System / NVMe-oF Tier (Lustre / WekaFS / CephFS)   |
| - High Sustained Bandwidth (> 2 TB/s aggregate throughput)                    |
| - Sub-millisecond direct block metadata operations                            |
+-------------------------------------------------------------------------------+
```

### 1. The Checkpointing I/O Bottleneck
During distributed training, models must periodically write a complete state snapshot to non-volatile storage to survive hardware node failures.

A training state checkpoint consists of:
- **Model Weights**: 2 bytes per parameter in 16-bit (BF16/FP16).
- **Gradients**: 2 bytes per parameter.
- **AdamW Optimizer States**: 4 bytes for first momentum ($m_t$) + 4 bytes for second momentum ($v_t$) + 4 bytes for FP32 master weights = **12 bytes per parameter**.
- **Total Checkpoint Footprint**: $2 + 2 + 12 = \mathbf{16\text{ bytes per parameter}}$.

For a 70B parameter model:
$$70{,}000{,}000{,}000 \times 16\text{ bytes} = \mathbf{1.12\text{ Terabytes per Checkpoint}}$$

If thousands of GPUs synchronize and dump 1.12 TB to disk every 30 minutes, a slow parallel storage array that takes 5 minutes to flush causes an immediate **16.6% GPU idle penalty**. High-speed NVMe burst buffers and asynchronous checkpointing (e.g., Megatron-LM async flush) are mandatory.

### 2. GPUDirect Storage (GDS) & NVMe-oF
Traditional Linux I/O paths require the CPU to read data from storage into kernel bounce buffers, copy data to user space, and then issue a CUDA memory copy over the PCIe bus to GPU HBM:

$$
\text{Traditional Storage Path: Storage} \longrightarrow \text{CPU Page Cache} \longrightarrow \text{Host Memory} \longrightarrow \text{GPU HBM}
$$

**NVIDIA GPUDirect Storage (GDS)** utilizes PCIe Peer-to-Peer (P2P) Direct Memory Access (DMA):

$$
\text{GPUDirect Storage Path: NVMe-oF Target} \overset{\text{RDMA / P2P DMA}}{\xrightarrow{\hspace*{4cm}}} \text{GPU HBM3e Memory}
$$

- Bypasses CPU cores and OS Page Cache completely.
- Reduces end-to-end I/O latency from 50 ms down to sub-1 ms.
- Saturates PCIe Gen5 bandwidth ($64\text{ GB/s}$ bidirectional per $x16$ slot).

---

## 5. Modern Decoder Blocks: State-of-the-Art Optimizations

```
Input Token IDs
      │
      ▼
[Embedding Layer + RoPE Positional Encoding]
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│ Transformer Decoder Layer (Repeated 32 to 80 Times)         │
│                                                             │
│   ┌──────────────────────────────────────────────────────┐  │
│   │ Input RMSNorm: x_norm = x / RMS(x)                   │  │
│   └──────────────────────────┬───────────────────────────┘  │
│                              ▼                              │
│   ┌──────────────────────────────────────────────────────┐  │
│   │ Grouped-Query Attention (GQA) with KV-Cache          │  │
│   └──────────────────────────┬───────────────────────────┘  │
│                              ▼                              │
│                     [Residual Add (+)]                      │
│                              │                              │
│   ┌──────────────────────────┴───────────────────────────┐  │
│   │ Post-Attention RMSNorm                               │  │
│   └──────────────────────────┬───────────────────────────┘  │
│                              ▼                              │
│   ┌──────────────────────────────────────────────────────┐  │
│   │ SwiGLU Feed-Forward Network: (xW1 * swish(xV)) W2    │  │
│   └──────────────────────────┬───────────────────────────┘  │
│                              ▼                              │
│                     [Residual Add (+)]                      │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
                        [Final RMSNorm]
                               │
                               ▼
                       [Unembedding Head] ──► Logits over Vocabulary
```

---

## 6. Quantization & Model Sizing for Local Laptops

Model weights are trained in 16-bit (FP16 or BF16, 2 bytes per weight). To compute the bare-minimum RAM/VRAM required to load a model for inference:

$$
\text{Memory (GB)} = \left(\text{Parameters in Billions} \times \text{Bytes per Parameter}\right) \times 1.25
$$

*(where the $1.25$ multiplier accounts for activation memory and KV-cache overhead)*.

| Model Size | FP16 (2 Bytes) | Q8_0 (1 Byte) | Q4_K_M (0.5 Bytes) | Recommended Laptop Hardware |
|---|---|---|---|---|
| **3B (Llama 3.2)** | 7.5 GB | 3.8 GB | 2.5 GB | Any M1/M2/M3 MacBook Air (8GB RAM) |
| **8B (Llama 3.1)** | 20.0 GB | 10.0 GB | 6.0 GB | MacBook Pro / PC (16GB RAM) |
| **14B (Qwen 2.5)** | 35.0 GB | 17.5 GB | 11.0 GB | MacBook Pro / PC (32GB RAM) |
| **32B (Qwen / DeepSeek)**| 80.0 GB | 40.0 GB | 24.0 GB | High-End Workstation (64GB RAM) |
| **70B (Llama 3.3)**| 175.0 GB | 87.5 GB | 50.0 GB | Mac Studio / Multi-GPU Rig (64GB-128GB RAM) |
