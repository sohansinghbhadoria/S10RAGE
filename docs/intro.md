---
id: intro
title: Introduction & Architecture Overview
description: Overview of the S10RAGE engineering documentation portal covering modern data storage systems from hardware to distributed consensus.
sidebar_position: 1
---

# S10RAGE Docs

Welcome to **S10RAGE**, the engineer's reference manual for data storage fundamentals, hardware physics, operating system I/O primitives, storage engine data structures, and distributed persistence architectures.

:::note About S10RAGE
Modeled after the depth, precision, and clarity of **Mozilla Developer Network (MDN Web Docs)**, S10RAGE provides deep technical documentation for database developers, infrastructure architects, and systems programmers.
:::

---

## The 7 Pillars of Modern Storage

```mermaid
graph LR
    A["Hardware Physics"] --> B["Kernel & OS I/O"]
    B --> C["Storage Engines"]
    C --> D["Database Systems"]
    D --> E["Distributed Storage"]
    E --> F["Data Formats"]
    F --> G["Caching Layers"]
```

### 1. [Physical Layer & Hardware Media](/docs/physical-layer/memory-hierarchy)
Understand the mechanical sympathy required to squeeze performance out of silicon.
- **[Memory Hierarchy & Latency Numbers](/docs/physical-layer/memory-hierarchy)**: CPU caches, DRAM, NVMe PCIe lanes, and nanosecond physics.
- **[NAND Flash, FTL & SSD Internals](/docs/physical-layer/ssd-nand-ftl)**: Flash Translation Layer (FTL), SLC/MLC/TLC/QLC cells, wear leveling, and TRIM.
- **[HDDs & Magnetic Recording](/docs/physical-layer/hdds-and-magnetic-media)**: Rotational latency, CMR vs SMR, and head arm mechanics.

### 2. [Kernel & OS Storage Subsystem](/docs/os-subsystem/page-cache-vfs)
How operating systems bridge user-space applications and disk controllers.
- **[Virtual File System (VFS) & Page Cache](/docs/os-subsystem/page-cache-vfs)**: Dirty page writeback, buffer heads, and readahead algorithms.
- **[io_uring vs epoll vs POSIX AIO](/docs/os-subsystem/io-uring-vs-epoll)**: Linux 5.x+ submission/completion queue rings and true zero-copy asynchronous I/O.
- **[Direct I/O (O_DIRECT) & Memory Mapped I/O (mmap)](/docs/os-subsystem/direct-io-and-mmap)**: Bypassing the page cache and userspace buffer management.

### 3. [Storage Engines & Data Structures](/docs/storage-engines/b-trees)
The computational building blocks that organize bits on disk.
- **[B-Trees & B+ Trees](/docs/storage-engines/b-trees)**: Page layout, branch splitting, prefix compression, and write amplification.
- **[LSM Trees & Compaction](/docs/storage-engines/lsm-trees)**: MemTables, SSTables, Bloom filters, and Leveled vs Size-Tiered compaction.
- **[Append-Only Logs & SkipLists](/docs/storage-engines/append-only-logs)**: Segmented logs, zero-copy socket transfers, and in-memory indexing.

### 4. [Database Storage Architectures](/docs/database-architecture/row-vs-columnar)
How modern relational and analytical databases guarantee durability and consistency.
- **[Row-Oriented vs Columnar Storage](/docs/database-architecture/row-vs-columnar)**: OLTP vs OLAP, vectorization, dictionary encoding, and SIMD scanning.
- **[Write-Ahead Logging (WAL) & ARIES Recovery](/docs/database-architecture/wal-and-aries)**: Checkpointing, physiological logging, and Analysis-Redo-Undo passes.
- **[MVCC & ACID Isolation Levels](/docs/database-architecture/mvcc-and-acid)**: Snapshot isolation, write skew, 2-phase locking, and tuple visibility.

### 5. [Distributed Storage & Consensus](/docs/distributed-storage/consistent-hashing-quorum)
Scaling persistence across fault-prone networks and machine boundaries.
- **[Consistent Hashing & Quorum Consensus](/docs/distributed-storage/consistent-hashing-quorum)**: Dynamo architectures, virtual nodes, vector clocks, and $R + W > N$.
- **[Raft Consensus Protocol](/docs/distributed-storage/raft-consensus)**: Leader election, log replication, safety invariants, and joint consensus.
- **[Object Storage & S3 Internals](/docs/distributed-storage/object-storage-s3-internals)**: Immutable blobs, Reed-Solomon erasure coding, and bit rot detection.

### 6. [Data Formats & Compression](/docs/formats-and-compression/parquet-avro-arrow)
Binary serialization and encoding efficiency.
- **[Parquet, Avro & Apache Arrow](/docs/formats-and-compression/parquet-avro-arrow)**: Dremel record shredding, columnar chunks, and memory sharing.
- **[Compression Algorithms & Trade-offs](/docs/formats-and-compression/compression-algorithms)**: Zstandard, LZ4, Snappy, and Gorilla compression benchmarks.

### 7. [Caching & Memory Management](/docs/caching/eviction-policies)
Accelerating data access via multi-tier caching architectures.
- **[Cache Eviction Algorithms](/docs/caching/eviction-policies)**: LRU, LFU, ARC, Clock, and W-TinyLFU (Caffeine).
- **[Caching Topologies](/docs/caching/caching-topologies)**: Cache-aside, read-through, write-through, and write-behind.

---

## Interactive Playgrounds & Tools

- [⏱️ Latency Numbers Explorer](/docs/interactive/latency-explorer): Compare access latencies from CPU registers to intercontinental cables.
- [🧭 Storage Engine Decision Matrix](/docs/interactive/storage-engine-matrix): Pick the right storage engine structure for your access patterns.
- [🔬 LSM Compaction Visualizer](/docs/interactive/lsm-visualizer): Step through MemTable flushes and background SSTable compactions.
