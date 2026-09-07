---
id: parquet-avro-arrow
title: Parquet, Avro & Apache Arrow
description: Engineering deep dive into binary data layouts, Dremel record shredding, Parquet metadata footers, and Arrow zero-copy memory buffers.
sidebar_position: 1
---

# Parquet, Avro & Apache Arrow

When transferring and storing data at scale, text formats like JSON and CSV waste massive CPU cycles on parsing numbers and consuming $3\times - 10\times$ more storage than necessary. Modern data engineering relies on specialized binary serialization layouts: **Apache Parquet**, **Apache Avro**, and **Apache Arrow**.

---

## 1. Quick Format Matrix

| Format | Orientation | Schema Handling | Best Suited For | Primary Ecosystem |
| :--- | :--- | :--- | :--- | :--- |
| **Apache Avro** | **Row-Oriented** | Schema evolution with JSON schema header | Event streaming, Kafka messages, ETL ingestion | Confluent, Kafka, Hadoop |
| **Apache Parquet**| **Columnar (Disk)** | Embedded in footer; Dremel record shredding | Analytical queries, Data Lakes, long-term storage | Spark, DuckDB, ClickHouse, Presto |
| **Apache Arrow** | **Columnar (RAM)** | Standardized C-data interface | In-memory analytics, zero-copy cross-language IPC | Pandas, Polars, DuckDB, PyArrow |

---

## 2. Apache Parquet File Internals

Parquet is based on Google's **Dremel paper (2010)** and stores nested data structures efficiently in a columnar format:

```
+-----------------------------------------------------------+
| Magic Number: 'PAR1' (4 Bytes)                            |
+-----------------------------------------------------------+
| ROW GROUP 0 (e.g. 500,000 rows)                           |
|  - Column Chunk: 'user_id' [Dictionary + Data Pages]       |
|  - Column Chunk: 'price'   [Snappy/ZSTD Data Pages]       |
+-----------------------------------------------------------+
| ROW GROUP 1 (e.g. 500,000 rows)                           |
|  - Column Chunk: 'user_id'                                |
|  - Column Chunk: 'price'                                  |
+-----------------------------------------------------------+
| FILE METADATA FOOTER (Thrift Encoded)                     |
|  - Schema declaration                                     |
|  - Row Group offsets & lengths                            |
|  - Column Statistics: [min, max, null_count, num_values]  |
+-----------------------------------------------------------+
| Footer Length (4 Bytes) | Magic Number: 'PAR1' (4 Bytes)  |
+-----------------------------------------------------------+
```

### Why the Footer is at the End of the File
Writing streams sequentially means the total record count, column min/max statistics, and byte offsets are only known **after all rows have been written**. Placing the metadata in the footer enables single-pass streaming writes without seeking backward!

### Predicate Pushdown (Min / Max Pruning)
When a query executes:
```sql
SELECT count(*) FROM sales WHERE price > 1000;
```
The query engine reads only the small footer metadata ($\approx \text{a few KB}$). If a Row Group's metadata states `max_price = 450`, the query engine **skips the entire multi-gigabyte Row Group without reading a single byte from disk**!

---

## 3. Dremel Record Shredding: Definition & Repetition Levels

How can arbitrary nested JSON structures with lists and optional fields be decomposed into flat columnar arrays without losing their structure?

Dremel introduces two compact integer markers prepended to every value:

1. **Definition Level (DL)**: How many optional ancestor fields in the schema path are defined. Used to track `NULL` values at any depth.
2. **Repetition Level (RL)**: At what schema depth a value repeats in an array.

```json
// Example: user with multiple phone numbers
{
  "name": "Alice",
  "phones": ["555-01", "555-02"]
}
```

```
Field: phones.list.element
Values:            ["555-01", "555-02"]
Repetition Levels: [   0,        1    ]  <-- 1 indicates second element of same list
Definition Levels: [   2,        2    ]  <-- Both ancestor fields exist
```

---

## 4. Apache Arrow: Zero-Copy In-Memory Standard

Before Apache Arrow, passing a table between Python (Pandas), Java (Spark), and C++ (DuckDB) required expensive serialization and deserialization (SerDe), with over 70% of CPU time wasted copying bytes:

```mermaid
graph LR
    subgraph WithoutArrow ["Traditional Multi-Language SerDe"]
        Py1["Python"] -->|Serialize to Byte Stream| Wire["Socket / IPC"]
        Wire -->|Deserialize| Java1["Java / Spark"]
    end

    subgraph WithArrow ["Apache Arrow Shared Memory"]
        Py2["Python (Polars / PyArrow)"] <-->|Shared mmap buffer (Zero Copy)| Cpp2["C++ Engine (DuckDB)"]
    end
```

Arrow defines a contiguous C-level memory specification with exact bit-width offsets for integers, floating points, strings, and dictionaries. Two processes can share a multi-gigabyte Arrow table via `shm_open()` and execute SIMD queries **with zero memory copying**.
