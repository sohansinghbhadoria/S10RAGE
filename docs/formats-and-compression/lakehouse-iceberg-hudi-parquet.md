---
id: lakehouse-iceberg-hudi-parquet
title: "Data Lakehouse: Apache Iceberg, Hudi & Parquet Internals"
sidebar_label: "Lakehouse: Iceberg, Hudi & Parquet"
sidebar_position: 3
---

# Data Lakehouse: Apache Iceberg, Hudi & Parquet Internals

> **Architectural Paradigm**: The Data Lakehouse brings ACID transactional semantics, snapshot isolation, schema evolution, and fine-grained pruning directly to low-cost, multi-petabyte object storage without requiring proprietary data warehouses.

---

## 1. The Lakehouse Evolution: Beyond the Hive Metastore

```
Traditional Hive Object Lake               Modern Lakehouse (Iceberg / Hudi)
+------------------------------------+    +------------------------------------+
| Hive Metastore (RDBMS)             |    | ACID Open Table Metadata Tree      |
|  - Tracks partitions by directories|    |  - Tracks individual data files    |
|  - S3 list operations: O(N) slow   |    |  - Atomic snapshot commits via CAS |
|  - Renames are non-atomic copies!  |    |  - Time travel, branch, and merge  |
+------------------------------------+    +------------------------------------+
```

Traditional data lakes relied on directory path conventions (e.g., `s3://bucket/table/year=2026/month=09/`). Because S3 lacks atomic directory renames and charges for `LIST` operations, large table scans suffered severe latency and corrupted writes during pipeline crashes.

---

## 2. Apache Iceberg: Hierarchical Metadata Architecture

Apache Iceberg tracks table state using an immutable, hierarchical tree of metadata files:

```
Apache Iceberg Metadata Hierarchy:
[ Catalog Pointer (REST / Nessie / DynamoDB) ]
       │
       ▼ References current table version
[ v3.metadata.json ]
  ├── Schema: [ id (1), timestamp (2), amount (3) ]
  ├── Partition Spec: identity(timestamp, "month")
  └── Snapshot Log: Snapshot ID #84920491
           │
           ▼
[ snap-84920491.avro (Manifest List) ]
  ├── Manifest File 1: Partition "month=2026-08" (Stats: min_id=1, max_id=5000)
  └── Manifest File 2: Partition "month=2026-09" (Stats: min_id=5001, max_id=12000)
           │
           ▼
[ manifest-file-2.avro (Manifest File) ]
  ├── data-file-01.parquet (Record count: 50,000, Column stats, Null counts)
  └── data-file-02.parquet (Record count: 75,000, Column stats, Null counts)
           │
           ▼
[ Actual Parquet Data Files in S3 / MinIO Object Storage ]
```

### Core Iceberg Architectural Guarantees
1. **Snapshot Isolation & Atomic Commits**: Writers create a new snapshot without locking the table. Commits execute via Compare-And-Swap (CAS) on the catalog pointer. If an optimistic concurrency collision occurs, Iceberg retries cleanly.
2. **Hidden Partitioning**: Users query `WHERE event_time >= '2026-09-01'` without knowing whether data is physically partitioned by day, month, or hash. If the partition spec changes, historical files do not need rewriting!
3. **Column ID Tracking**: Columns are identified by stable internal integer IDs rather than names. Columns can be renamed, reordered, or deleted without corrupting legacy data files.

---

## 3. Apache Hudi: High-Velocity Upserts & Streaming Ingestion

While Iceberg excels at general batch and analytical querying, **Apache Hudi** is designed for high-frequency streaming ingestion and row-level upserts:

```
+-----------------------------------+-----------------------------------+
| Copy-On-Write (COW) Tables        | Merge-On-Read (MOR) Tables        |
+-----------------------------------+-----------------------------------+
| Writes rewrite existing Parquet   | Writes append updates to compact  |
| files with updated records.       | row-based Avro delta logs (.log). |
| Highest query scan performance.   | Lowest ingestion write latency.   |
| High write amplification.         | Background Compaction merges logs |
| Best for: Read-heavy BI reporting | Best for: Real-time Kafka streams |
+-----------------------------------+-----------------------------------+
```

### Hudi Pluggable Indexing
To avoid scanning the entire table on every upsert, Hudi utilizes high-speed indexes:
- **Bloom Filter Index**: Pre-checks whether an incoming record key exists in a specific Parquet file.
- **Record-Level Index (RLI)**: Uses an internal metadata table to map record keys directly to file IDs in sub-millisecond lookups.

---

## 4. Apache Parquet File Format Internals

Apache Parquet is an open-source, columnar storage format optimized for vectorized execution (SIMD):

```
Parquet Physical File Layout:
+-------------------------------------------------------------+
| 4-Byte Magic Header ("PAR1")                                |
+-------------------------------------------------------------+
| Row Group 0 (128 MB - 512 MB chunk of table rows)           |
|  ├── Column Chunk 0 (User ID column: Snappy/Zstd compressed)|
|  │    ├── Data Page 0 (Dictionary Header + Bit-Packed Values|
|  │    └── Data Page 1                                       |
|  ├── Column Chunk 1 (Timestamp column: Delta encoded)       |
|  └── Column Chunk N                                         |
+-------------------------------------------------------------+
| Row Group 1                                                 |
+-------------------------------------------------------------+
| File Footer (Thrift Metadata: Schema, Column Min/Max Stats) |
+-------------------------------------------------------------+
| 4-Byte Footer Length + 4-Byte Magic ("PAR1")                |
+-------------------------------------------------------------+
```

### 1. Dremel Encoding: Definition & Repetition Levels
To store arbitrary nested JSON/protobuf data efficiently without storing null pointers, Parquet implements Google's Dremel algorithm:
- **Definition Level (DL)**: Encodes how many optional ancestors in the path are defined (handles NULL values with minimal bits).
- **Repetition Level (RL)**: Encodes at what depth level in the schema tree a list value repeats.

### 2. Columnar Encoding Schemes
- **Dictionary Encoding**: Replaces repetitive text strings (e.g. state names `"CA"`, `"NY"`) with 1-byte integer dictionary keys.
- **Run-Length Encoding (RLE) & Bit-Packing**: Compresses consecutive repeated integers (`1, 1, 1, 1, 2, 2` $\to$ `(4, 1), (2, 2)`).
- **Delta Binary Encoding**: Compresses timestamps and monotonically increasing IDs by storing only the differences (deltas) between consecutive values.

### 3. Vectorized Engine Dictionary & Min/Max Pruning
When an engine (Trino, ClickHouse, DuckDB) reads Parquet files from S3:
1. It downloads *only* the small Thrift footer to read Row Group min/max statistics.
2. If `query: WHERE age > 65` and Row Group 0 reports `max_age = 42`, the engine skips downloading that 256 MB Row Group entirely!
3. Remaining columns are decoded directly into CPU L1/L2 caches using vectorized SIMD registers.
