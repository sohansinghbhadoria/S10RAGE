---
id: ai-terminologies-glossary
title: "AI & LLM Terminologies: The Definitive Engineering Glossary"
sidebar_label: "0. AI Terminologies Glossary"
sidebar_position: 1
---

# AI & LLM Terminologies: The Definitive Engineering Glossary

> **Target Audience**: Systems Engineers, Software Architects, and DevOps Professionals requiring authoritative, mathematically precise definitions of modern Artificial Intelligence, Large Language Model, and Agentic terminology.

---

## 1. Core Architecture & Neural Primitives

### Transformer
The dominant deep learning architecture introduced in 2017 (Vaswani et al.) that replaced recurrence (RNNs/LSTMs) and convolutions (CNNs) with pure **Self-Attention**. Transformers process entire sequences simultaneously in parallel, enabling massive scaling over trillions of training tokens.

### Self-Attention Mechanism
The foundational mathematical operation that enables every token in a sequence to dynamically weigh and attend to every other token. Computed as:

$$
\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V
$$

where $Q$ (Query), $K$ (Key), and $V$ (Value) are linear projections of input embeddings.

### Attention Heads & Multi-Head Attention (MHA)
Rather than performing a single attention calculation, **Multi-Head Attention** splits queries, keys, and values into $H$ distinct subspaces (heads). Each head learns different relationships (e.g., one head attends to grammatical subject-verb agreement, another to long-range pronoun references, and another to punctuation).

### Multi-Query (MQA) & Grouped-Query Attention (GQA)
- **Multi-Head Attention (MHA)**: Every query head has its own independent Key and Value head. Highly expressive, but consumes massive KV-cache memory during inference.
- **Multi-Query Attention (MQA)**: All query heads share a single Key and single Value head. Drastically cuts memory bandwidth, but can degrade quality on complex reasoning.
- **Grouped-Query Attention (GQA)**: The modern standard (used in Llama 3 and Mistral). Groups query heads (e.g., 8 query heads share 1 Key/Value head pair), delivering 99% of MHA quality while slashing KV-cache memory footprint by $4\times$ to $8\times$.

### Rotary Position Embedding (RoPE)
A positional encoding technique that encodes token sequence order by rotating Query and Key vectors in the 2D complex plane. It captures **relative distance** $(m - n)$ between tokens rather than absolute index numbers, allowing models to generalize to context lengths far longer than seen during pre-training.

### Feed-Forward Network (FFN) & SwiGLU
The non-linear multilayer perceptron applied after attention in each Transformer block. Modern models replace standard ReLU activations with **SwiGLU (Swish Gated Linear Unit)**:

$$
\text{SwiGLU}(x) = (xW \cdot \text{swish}(xV))W_2
$$

providing higher parameter efficiency and training stability.

### LayerNorm vs. RMSNorm
- **Layer Normalization (LayerNorm)**: Normalizes inputs across features by subtracting the mean and dividing by the standard deviation.
- **RMSNorm (Root Mean Square Normalization)**: Omits the computationally expensive mean-centering step, normalizing purely by the root mean square of the inputs. Used in modern models to accelerate GPU forward passes by 15-20%.

### Context Window
The maximum number of tokens (prompt + output) an LLM can hold in active memory during a single forward pass. Modern models range from 8,192 tokens (`llama3.2`) to 128,000 tokens (`llama3.1`, `gpt-4o`) and 1,000,000+ tokens (`gemini-1.5-pro`).

---

## 2. Training, Alignment & Fine-Tuning

### Pre-Training
The initial, compute-intensive phase where a base model learns language, world knowledge, and reasoning by predicting the next token across trillions of unlabelled tokens from web scrapes, books, and code. Consumes 95-99% of the total training budget.

### Supervised Fine-Tuning (SFT / Instruction Tuning)
Training a pre-trained base model on hundreds of thousands of curated `[User Instruction, Ideal Assistant Answer]` dialogue pairs to transform it from an uncontrolled sentence completer into an instruction-following assistant.

### RLHF (Reinforcement Learning from Human Feedback)
An alignment technique where humans score model response pairs. A **Reward Model** is trained on these human preferences, and the policy model is optimized using Proximal Policy Optimization (PPO) to maximize helpfulness and safety.

### DPO (Direct Preference Optimization)
A modern alternative to RLHF that eliminates the need for training a separate reward model. DPO derives an exact closed-form loss function that optimizes the language model directly on paired preferred/rejected responses:

$$
\mathcal{L}_{\text{DPO}}(\pi_\theta; \pi_{\text{ref}}) = -\mathbb{E}_{(x, y_w, y_l)}\left[\log \sigma \left(\beta \log \frac{\pi_\theta(y_w|x)}{\pi_{\text{ref}}(y_w|x)} - \beta \log \frac{\pi_\theta(y_l|x)}{\pi_{\text{ref}}(y_l|x)}\right)\right]
$$

### LoRA (Low-Rank Adaptation) & QLoRA
- **LoRA**: Parameter-Efficient Fine-Tuning (PEFT) that freezes base model weights $W \in \mathbb{R}^{d \times k}$ and injects low-rank trainable decomposition matrices $\Delta W = B \times A$, where $B \in \mathbb{R}^{d \times r}$, $A \in \mathbb{R}^{r \times k}$, and rank $r \ll d$. Reduces trainable parameters by $>99\%$.
- **QLoRA**: Quantizes the frozen base model to 4-bit NormalFloat (NF4) while fine-tuning 16-bit LoRA adapters in memory, allowing a 70B model to be fine-tuned on a single consumer GPU.

### Loss Function & Perplexity
- **Cross-Entropy Loss**: Measures the divergence between predicted token probabilities and actual ground truth tokens.
- **Perplexity (PPL)**: The exponential of cross-entropy loss ($e^{\text{loss}}$). Represents the effective number of equally likely tokens the model is choosing from. Lower perplexity indicates superior predictive confidence.

---

## 3. Inference, Quantization & Sampling

### Prefill Phase vs. Decode Phase
- **Prefill Phase**: The model processes all input prompt tokens simultaneously in parallel. Compute-bound (Matrix-Matrix multiplication / GEMM). Fully utilizes GPU Tensor Cores.
- **Decode Phase**: The model generates output tokens sequentially, one by one. Memory-bandwidth bound (Matrix-Vector multiplication / GEMV). Speed is determined by how fast weights and KV-cache can be read from VRAM.

### KV-Cache (Key-Value Cache)
A memory buffer in GPU VRAM storing the computed Key and Value tensors for all preceding tokens. Prevents quadratic $O(N^2)$ recomputation of attention at each generation step, dropping per-token generation complexity to $O(N)$.

### Quantization (GGUF, AWQ, GPTQ)
The mathematical reduction of model weight precision from 16-bit floating point (FP16/BF16) to 8-bit, 4-bit, or 2-bit integers:
- **GGUF (GPT-Generated Unified Format)**: The standard format used by `llama.cpp` and `Ollama` for high-performance CPU and Apple Silicon unified memory execution.
- **AWQ (Activation-Aware Weight Quantization)**: Preserves the top 1% most important "salient" weights in FP16 while quantizing the remaining 99% to 4-bit, maximizing model reasoning quality.

### Temperature ($T$)
A hyperparameter that divides raw logits before the Softmax function:

$$
P(w_i) = \frac{\exp(z_i / T)}{\sum_j \exp(z_j / T)}
$$

- $T \to 0$: Deterministic, greedy decoding; always picks the highest-probability token.
- $T = 0.7$: Balanced creativity and coherence.
- $T > 1.0$: Flattens probabilities; increases lexical diversity and hallucination risk.

### Top-K & Top-P (Nucleus) Sampling
- **Top-K**: Truncates the sampling pool to strictly the top $K$ most likely tokens (e.g., $K=50$).
- **Top-P (Nucleus)**: Dynamically selects the smallest set of tokens whose cumulative probability equals or exceeds threshold $P$ (e.g., $P=0.90$). Adapts dynamically to model confidence.

### Time-to-First-Token (TTFT) & Tokens-Per-Second (TPS)
- **TTFT**: Time elapsed from user prompt submission to the arrival of the first generated token (measures prefill speed).
- **TPS**: The sustained throughput of token generation during the decode phase (measures inference memory bandwidth).

---

## 4. RAG & Vector Search

### Vector Embedding
A continuous numerical representation ($\mathbb{R}^D$) capturing the semantic essence of text. Words or sentences with similar meanings occupy adjacent geometric coordinates.

### Cosine Similarity
The cosine of the angle between two vectors in $D$-dimensional space:

$$
\cos(\theta) = \frac{\mathbf{u} \cdot \mathbf{v}}{\|\mathbf{u}\| \|\mathbf{v}\|}
$$

Measures orientation rather than magnitude; invariant to document length.

### Chunking & Chunk Overlap
- **Chunking**: Splitting large documents into smaller textual segments (e.g., 500 characters or 200 tokens) to fit within retrieval granularity limits.
- **Chunk Overlap**: Repeating trailing tokens from chunk $N$ at the beginning of chunk $N+1$ to ensure sentences spanning chunk boundaries are not conceptually severed.

### HNSW (Hierarchical Navigable Small World)
The premier graph-based Approximate Nearest Neighbor (ANN) index. Constructs a multi-layer graph with logarithmic $O(\log N)$ search complexity, dropping query latency from hundreds of milliseconds to under 5 ms.

### Hybrid Search & Reciprocal Rank Fusion (RRF)
- **Hybrid Search**: Combines Dense Vector Search (semantic concepts) with Sparse Lexical Search (BM25 exact keywords).
- **RRF**: Merges rankings from multiple retrieval engines using the reciprocal rank formula $1 / (k + r)$, avoiding the need to calibrate disparate raw score scales.

### Cross-Encoder Re-Ranking
A secondary classification model that evaluates the user query and candidate document chunks together using full cross-attention. Re-ranks the top 50 fast vector candidates down to the top 5 most semantically authoritative chunks.

### HyDE (Hypothetical Document Embeddings)
A query transformation technique where the LLM generates a fictitious answer to the prompt first. Embedding this hypothetical document retrieves significantly more accurate vector matches than embedding the raw question.

### Hallucination (Intrinsic vs. Extrinsic)
- **Intrinsic Hallucination**: The model's generated output directly contradicts the source documents provided in the prompt context.
- **Extrinsic Hallucination**: The model's generated output introduces new "facts" that cannot be verified or found anywhere in the provided context.

---

## 5. Agentic AI & Autonomous Systems

### AI Agent
An autonomous software entity powered by an LLM that perceives its environment, reasons through goals, generates plans, invokes external software tools via APIs, inspects observations, and iterates until the objective is achieved.

### ReAct (Reason + Act)
The core cognitive prompting loop that interleaves internal reasoning traces (`Thought: ...`), actions (`Action: tool_name(args)`), and environmental feedback (`Observation: ...`).

### Tool Calling (Function Calling)
The structured protocol where an LLM is provided with JSON schemas of local functions. When appropriate, the model halts text generation and outputs a structured JSON tool call payload. The host runtime executes the code and feeds the return value back to the model.

### Agent Memory Tiers
1. **Short-Term Memory**: The active context window holding the current conversational turn and scratchpad tool results.
2. **Episodic Memory**: A vector database storing summaries of past interactions and resolved tasks across sessions.
3. **Semantic Memory**: The agent's static domain knowledge, internal runbooks, and environmental constraints.

### Human-in-the-Loop (HITL)
An architectural guardrail where high-impact agent actions (e.g., deleting a storage pool, modifying firewall rules, or executing financial transactions) are paused to require explicit human operator confirmation before execution.
