---
id: compression-algorithms
title: Compression Algorithms & Encoding Strategies
description: Comparative benchmarks and mechanics of Zstandard (ZSTD), LZ4, Snappy, Finite State Entropy (FSE), and specialized numerical encodings.
sidebar_position: 2
---

# Compression Algorithms & Encoding Strategies

In storage engineering, compression is not merely about saving disk space; **it frequently improves query and I/O performance**. 

Because modern NVMe SSDs and memory buses are limited by transfer bandwidth, a CPU that quickly decompresses data in L1/L2 cache can stream data off disk significantly faster than an uncompressed pipeline!

---

## 1. Algorithmic Benchmark Matrix

Data compression algorithms balance three competing variables: **Compression Ratio**, **Compression Speed**, and **Decompression Speed**.

| Algorithm | Compression Speed | Decompression Speed | Ratio | Primary Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **LZ4** | $\approx 800\text{ MB/s}$ | **$> 4,500\text{ MB/s}$** | Low ($2.0\times$) | Real-time buffer caching, RocksDB L0/L1, RPC wire |
| **Snappy** | $\approx 250\text{ MB/s}$ | $\approx 500\text{ MB/s}$ | Low ($2.0\times$) | Legacy Parquet default, LevelDB |
| **Zstandard (ZSTD)**| $\approx 100 - 500\text{ MB/s}$ | **$\approx 1,500\text{ MB/s}$** | **High ($3.5\times - 5.0\times$)** | **Modern Standard**: Parquet, ClickHouse, RocksDB |
| **Gzip (zlib)** | $\approx 30\text{ MB/s}$ | $\approx 350\text{ MB/s}$ | Moderate ($3.0\times$) | Legacy web HTTP assets, slow cold archives |
| **Brotli** | $\approx 15\text{ MB/s}$ | $\approx 450\text{ MB/s}$ | Very High ($4.0\times$) | Static web font/asset delivery |

---

## 2. Why Zstandard (ZSTD) Dominates Modern Storage

Engineered by Yann Collet at Meta, **Zstandard** combines two breakthroughs:

1. **Rep-code match searching (Fast LZ77)**: Rapidly discovers repeated string subsequences using compact hash tables.
2. **Finite State Entropy (FSE)**: Based on Jarek Duda's **Asymmetric Numeral Systems (ANS)**, FSE achieves the theoretical compression limits of arithmetic coding while operating at the speed of table lookups with single-instruction state updates.

### Asymmetrical Decompression Speed
Zstandard offers tunable levels from `1` (fastest, $500\text{ MB/s}$) to `22` (maximum compression). Crucially, **decompression speed remains uniformly high ($\approx 1.5\text{ GB/s}$) regardless of the compression level used**! An engine can spend heavy background CPU cycles compressing historical data once, and subsequent analytical queries decompress it at bus speeds.

---

## 3. Specialized Numerical Encodings

General-purpose text compressors (like zlib) perform poorly on raw floating-point numbers and monotonically increasing timestamps. Modern storage engines prepend specialized columnar encodings:

### 1. Delta-of-Delta Encoding (Timestamps)
In time-series databases (InfluxDB, Prometheus, Timescale), timestamps usually arrive at fixed intervals (e.g. every 10 seconds):

```
Raw Timestamps: 1600000000, 1600000010, 1600000021, 1600000030
First Delta:                 10,          11,          9
Delta-of-Delta:                            1,         -2
```
Storing small deltas (`1, -2`) requires only **1 to 2 bits** instead of 64 bits per timestamp!

### 2. Gorilla XOR Floating-Point Encoding
Developed by Facebook for the Gorilla time-series engine:
- Computes `Current_Float XOR Previous_Float`.
- If values change slightly, the floating-point IEEE-754 sign, exponent, and leading mantissa bits remain identical.
- The XOR result contains long sequences of leading and trailing zeros, which are bit-packed into variable-length flags, reducing 64-bit doubles down to an average of **1.37 bytes per point**!
