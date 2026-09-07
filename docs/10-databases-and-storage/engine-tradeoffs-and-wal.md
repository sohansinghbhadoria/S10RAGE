---
id: engine-tradeoffs-and-wal
title: 10. Databases & Storage Internals
sidebar_label: 10. Databases & Storage
sidebar_position: 10
---

# 10. Databases & Storage Internals

Database management systems are specialized storage managers designed to maintain the ACID invariants (Atomicity, Consistency, Isolation, Durability) despite hardware crashes, power loss, and concurrent transactions.

---

## 1. Slotted Page Architecture: Record Layout on Disk

Databases cannot store records as arbitrary variable-length byte streams without catastrophic internal fragmentation. They organize disk space into fixed-size **Pages** (8 KB in PostgreSQL, 16 KB in MySQL InnoDB).

```
+---------------------------------------------------------------+
| Page Header (LSN, Transaction IDs, Free space offsets)       |
+---------------------------------------------------------------+
| Line Pointer Array (ItemIds):                                 |
| [ Item 0: Offset 8100, Len 92 ] [ Item 1: Offset 7980, Len 120]
+---------------------------------------------------------------+
|                     Unallocated Free Space                    |
|                               ▼                               |
|                               ▲                               |
+---------------------------------------------------------------+
| Tuple / Record 1 Data (Length 120)                            |
+---------------------------------------------------------------+
| Tuple / Record 0 Data (Length 92)                             |
+---------------------------------------------------------------+
```

- **Slotted Pages**: Line pointers grow *downward* from the page header; actual tuple payloads are inserted *upward* from the end of the page.
- **Record Identifier (Tuple ID / ctid)**: A stable pointer composed of `(Page_Number, Slot_Index)`. Even if a record is modified, the slot index remains stable, preventing cascading index rebuilds.

---

## 2. Storage Engines: B-Trees vs. LSM-Trees

| Dimension | **B-Tree Engines** (PostgreSQL, MySQL InnoDB) | **LSM-Tree Engines** (RocksDB, Cassandra, ScyllaDB) |
| :--- | :--- | :--- |
| **Write Model** | In-place random page updates | Sequential append-only (MemTable + WAL) |
| **Write Amplification (WA)** | High ($\approx 20 - 50\times$ due to dirty 8K/16K pages)| Moderate to High ($\approx 10 - 30\times$ during Compaction) |
| **Point Read Latency** | Ultra-low ($O(\log_B N)$, single page hit in buffer pool) | Higher (checks MemTable, then multi-level SSTables) |
| **Range Scan Performance** | Excellent (leaf nodes linked sequentially) | Moderate (merges iterators across levels via priority queue) |
| **Disk Space Overhead** | Higher (internal page fragmentation 30-50%) | Lower (high compression on immutable SSTables) |
| **Ideal Hardware** | Low-latency random-access NVMe | Write-intensive SSDs or spinning HDDs |

---

## 3. Write Amplification Factor (WAF) & Read Amplification (RAF)

### Write Amplification Factor (WAF)
$$\text{WAF} = \frac{\text{Total Bytes Written to Storage Media}}{\text{Bytes Issued by Application}}$$

- If an application updates a 50-byte record in PostgreSQL, PostgreSQL must write:
  1. The 50-byte update record to the WAL (`pg_wal`).
  2. The entire dirty 8,192-byte page to disk during checkpointing!
  $$\text{WAF} = \frac{50 + 8192}{50} \approx 164.8!$$

---

## 4. Write-Ahead Logging (WAL) & The ARIES Recovery Protocol

To achieve high write throughput without risking data corruption on crash, databases enforce the **Write-Ahead Logging rule**:

> **The WAL Invariant**: Never write a dirty page to disk until the corresponding log records describing the change have been flushed and fsynced to persistent media.

```
Application Transaction
       │
       ├── 1. Append Log Record to WAL Buffer ──► fsync(wal_fd) [SYNCHRONOUS]
       ├── 2. Modify in-memory Page in Buffer Pool [DIRTY]
       └── 3. Return "COMMIT OK" to Client!
                  │
                  ▼ Asynchronously / Background
         Checkpoint / BgWriter flushes Dirty Page to disk
```

### The Three Passes of ARIES Crash Recovery
1. **Analysis Pass**: Scans forward from the last checkpoint to identify active uncommitted transactions (loser transactions) and dirty pages at the moment of the crash.
2. **Redo Pass**: Scans forward from the oldest un-flushed LSN, repeating history to bring all pages to the exact physical state before the crash.
3. **Undo Pass**: Scans backward, rolling back the mutations of all active uncommitted transactions to guarantee atomicity.

---

## 5. Storage Engine Choices: PostgreSQL, MySQL, and NoSQL

| Database | Default Engine | On-Disk Structure | Concurrency Control |
| :--- | :--- | :--- | :--- |
| **PostgreSQL** | Heap Storage + B-Tree indexes | Append-only tuple heap, VACUUM GC | Multi-Version Concurrency Control (MVCC)|
| **MySQL** | InnoDB | Clustered Index B+ Tree | MVCC + Undo Log segments |
| **Apache Cassandra** | LSM-Tree Engine | MemTable + Level/Size SSTables | Cassandra Tombstones + Read Repair |
| **MongoDB** | WiredTiger | B-Tree (Default) or In-Memory | Document-level concurrency |
