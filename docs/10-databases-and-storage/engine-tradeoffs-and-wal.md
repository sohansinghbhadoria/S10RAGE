---
id: engine-tradeoffs-and-wal
title: "10. Databases & Storage Internals: B-Trees, LSM-Trees, WAL & Buffer Pools"
sidebar_label: 10. Databases & Storage
sidebar_position: 10
---

# 10. Databases & Storage Internals: B-Trees, LSM-Trees, WAL & Buffer Pools

> **Prerequisites**: Module 01 (Storage Metrics), Module 02 (The Linux I/O Path), Module 05 (Filesystems Deep-Dive).  
> **Target Audience**: Database Architects, Backend Systems Engineers, Storage Engine Developers, and High-Scale DBA/SREs.

Database management systems are specialized, high-concurrency storage engines. Rather than treating disk media as a passive filesystem repository, database engines take direct control of page layouts, in-memory caching pools, write-ahead logging (WAL), and concurrent lock management to enforce the strict invariants of **ACID** (Atomicity, Consistency, Isolation, Durability).

---

## 1. Physical Page Organization: The Slotted Page Architecture

Databases cannot store arbitrary variable-length records sequentially on disk without catastrophic fragmentation. They partition table spaces into uniform, fixed-size **Pages** (8 KB in PostgreSQL, 16 KB in MySQL InnoDB).

```
+-----------------------------------------------------------------------------------+
| Page Header (24 bytes)                                                            |
|  - LSN (Log Sequence Number of last modifying transaction)                        |
|  - Page Checksum, Flags, Lower Free Space Offset, Upper Free Space Offset         |
+-----------------------------------------------------------------------------------+
| Line Pointer Array (ItemIds) [Grows Downward ▼]                                  |
| [ Item 0: Offset 8104, Len 88 ] [ Item 1: Offset 7984, Len 120 ] [ Item 2 ... ]   |
+-----------------------------------------------------------------------------------+
|                          Unallocated Free Space Hole                              |
|                                       ▼                                           |
|                                       ▲                                           |
+-----------------------------------------------------------------------------------+
| Tuple / Record 1 Data (120 bytes)                                                 |
+-----------------------------------------------------------------------------------+
| Tuple / Record 0 Data (88 bytes)                                                  |
+-----------------------------------------------------------------------------------+
```

### Key Properties of Slotted Pages
1. **Bidirectional Growth**: The array of line pointers (ItemIds) grows *downward* from the page header; the raw row/tuple byte streams are written *upward* from the end of the page.
2. **Stable Record Identifiers (Tuple ID / RID / ctid)**: A database tuple is identified by a stable 6-byte pointer:
   $$\text{TID} = (\text{Page Number}, \text{Line Pointer Index})$$
   If an in-place update shifts a record within the page during defragmentation, the Line Pointer offset updates internally, but the external TID pointer **never changes**. This prevents expensive cascading index updates across secondary indexes.

---

## 2. The Storage Engine Tradeoff: The RUM Conjecture

When architecting a persistent storage engine, systems are fundamentally governed by the **RUM Conjecture** (Read, Update, Memory/Space Amplification). Optimizing for two dimensions inevitably degrades the third:

```
                            Read Amplification (RAF)
                                       ▲
                                      / \
                                     /   \
                                    /     \
                                   /       \
                                  /  B-Tree \
                                 /  (OLTP)   \
                                /             \
                               /               \
                              /                 \
                             /     LSM-Tree      \
                            /   (Write-Heavy)     \
                           /                       \
                          /                         \
                         ▼                           ▼
            Update Amplification (WAF) ◄────────► Space Amplification (SAF)
```

### B-Trees vs. LSM-Trees: Architectural Comparison
| Dimension | B+ Tree (PostgreSQL, InnoDB, SQLite) | LSM-Tree (RocksDB, Cassandra, Pebble) |
| :--- | :--- | :--- |
| **Write Pattern** | In-place random page overwrites | Strictly append-only sequential writes |
| **Write Amplification (WAF)**| **High ($10 - 40\times$)** due to full page writes | **Low to Moderate ($3 - 10\times$)** |
| **Read Latency (Point Lookups)**| **Optimal ($O(\log_B N)$ page accesses)** | Variable (MemTable + Bloom Filters + SSTables) |
| **Read Latency (Range Scans)**| **Optimal (Leaf node linked list traversal)** | Requires multi-way merge heap of all SSTables |
| **Space Amplification (SAF)** | Moderate ($30 - 50\%$ empty page fragmentation)| Low to Moderate (periodic compaction needed) |
| **Hardware Sympathy** | Optimized for fast random read SSDs / RAM | Optimized for flash endurance and fast write append |

---

## 3. Deep Dive: Log-Structured Merge Trees (LSM-Trees)

LSM-Trees eliminate random disk writes by converting all mutations into fast sequential memory appends:

```
Client Writes (INSERT / UPDATE / DELETE)
                 │
                 ├──► 1. Sequential Append to on-disk Write-Ahead Log (WAL) [Durability]
                 │
                 └──► 2. In-Memory Sorted MemTable (SkipList or Red-Black Tree)
                             │
                             ▼ When MemTable exceeds threshold (e.g., 64 MB)
                 [ Immutable MemTable ] ──Flush to Disk──> [ Level 0 SSTable ]
                                                                 │
                                                                 ▼ Background Compaction
                                                           [ Level 1 SSTables ]
                                                                 │
                                                                 ▼ Background Compaction
                                                           [ Level 2 SSTables ]
```

### 1. The MemTable & WAL
Incoming writes are written to a sequential Write-Ahead Log (WAL) on disk for crash durability and simultaneously inserted into an in-memory **MemTable** (typically a SkipList). The write returns immediately.

### 2. SSTables (Sorted String Tables)
When the MemTable fills up ($32\text{ MB} - 128\text{ MB}$), it becomes immutable and is flushed sequentially to disk as a **Level 0 SSTable**. An SSTable consists of sorted key-value pairs indexed by a summary block and paired with a **Bloom Filter**.

### 3. Compaction (Leveled vs. Size-Tiered)
Over time, multiple SSTables accumulate duplicate updates and tombstone records (deletions). Background **Compaction** reads multiple overlapping SSTables, merges the sorted streams, discards stale versions and tombstones, and writes clean, sorted Level $N+1$ SSTables.

---

## 4. Write-Ahead Logging (WAL) & The ARIES Recovery Protocol

To provide ACID durability without forcing the database to flush full 8 KB or 16 KB data pages to disk on every single commit, database engines use **Write-Ahead Logging**.

```
Transaction T1 commits:
1. Generate compact WAL record: [LSN 42918, Txn T1, Page 104, Op: UPDATE, Diff: col=42]
2. Synchronously flush WAL buffer to disk via fsync()
3. Return "SUCCESS" to user application!
4. The actual dirty Page 104 in DRAM is NOT written to disk yet!
   (It will be flushed asynchronously minutes later during a background checkpoint)
```

### The Inviolable WAL Invariant
> [!IMPORTANT]
> **The WAL Rule**: An in-memory dirty data page must **never** be written to non-volatile disk storage until the corresponding WAL log record describing that update has already been physically flushed to persistent media:
> $$\text{PageLSN} \le \text{FlushedLSN}$$

### The ARIES Recovery Algorithm
When a database crashes and restarts after an abrupt power loss, it recovers state using the three-phase **ARIES** protocol:

1. **Analysis Phase**: Scans the WAL forward from the last recorded clean **Checkpoint**. Reconstructs the state of the system at the moment of the crash, identifying all active transactions (**Transaction Table**) and all unwritten pages in memory (**Dirty Page Table**).
2. **Redo Phase**: Scans forward from the earliest unwritten LSN in the Dirty Page Table. Repeats history, reapplying all logged operations (including those of uncommitted transactions) to restore the database to the exact physical state it held at the millisecond of the crash.
3. **Undo Phase**: Scans backward through the WAL, rolling back all operations performed by transactions that were still active (uncommitted) when the power failed, writing **Compensation Log Records (CLRs)** to ensure undo actions are never repeated.

---

## 5. Buffer Pool Management: Memory vs. Disk Coordination

Databases implement their own **Buffer Pool** in user-space DRAM (e.g., `shared_buffers` in PostgreSQL, `innodb_buffer_pool_size` in MySQL) rather than relying exclusively on the OS Page Cache:

```
Database Query Engine
         │
         ├── Request Page 1042
         ▼
┌────────────────────────────────────────────────────────┐
│ Database Buffer Pool (User Space DRAM)                 │
│  - Buffer Page Frames (e.g., 32 GB of 8 KB slots)      │
│  - Hash Table: Page ID -> Frame ID mapping             │
│  - Eviction Strategy: Clock Sweep / LRU-2              │
│  - Dirty Page Tracking (PageLSN, dirty bit)            │
└──────────────────┬─────────────────────────────────────┘
                   │
    Cache Miss?    │ Fetch Page 1042 via O_DIRECT
                   ▼
       [ Physical Block Device ]
```

### Why Databases Bypass the OS Page Cache:
1. **Eviction Intelligence**: The OS has no semantic knowledge of database queries. It might evict the root page of a critical B-tree index to cache a temporary bulk file scan. The database buffer pool knows which pages are roots, leaf nodes, or transient query temp files.
2. **Double Caching**: Without `O_DIRECT`, identical data pages sit in both user-space buffer pools and the kernel Page Cache, wasting 50% of host DRAM.
3. **Control over Flushing**: The database must control the exact sequencing of page flushes to enforce the WAL invariant ($\text{PageLSN} \le \text{FlushedLSN}$).

---

## 6. Hands-on Linux Lab: PostgreSQL Storage & WAL Telemetry

Run these queries on any PostgreSQL instance to inspect physical page layouts, dirty page flushing, and WAL generation rates.

### Step 1: Inspect Physical Tuple Layout with `pageinspect`
```sql
-- Enable the low-level page inspection extension
CREATE EXTENSION IF NOT EXISTS pageinspect;

-- Inspect the page header of the 'users' table at block 0
SELECT lsn, checksum, lower, upper, special, pagesize 
FROM page_header(get_raw_page('users', 0));

-- Inspect the individual slotted line pointers (ItemIds) on block 0
SELECT lp, lp_off, lp_len, lp_flags 
FROM heap_page_items(get_raw_page('users', 0)) 
LIMIT 5;
```

### Step 2: Measure Real-Time WAL Generation Rates
```sql
-- Check current Write-Ahead Log position and filename
SELECT pg_current_wal_lsn(), pg_walfile_name(pg_current_wal_lsn());

-- Measure bytes of WAL generated over a 10-second benchmark interval
WITH start_state AS (SELECT pg_current_wal_lsn() AS lsn1)
SELECT pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), lsn1)) AS wal_bytes_generated
FROM start_state, pg_sleep(10);
```

### Step 3: Monitor Database Buffer Pool Cache Hit Ratio
```sql
-- A production OLTP database should maintain > 99% buffer cache hit ratio
SELECT 
    sum(heap_blks_read) as disk_reads,
    sum(heap_blks_hit)  as cache_hits,
    round(sum(heap_blks_hit)::numeric / (sum(heap_blks_hit) + sum(heap_blks_read)) * 100, 2) as cache_hit_percentage
FROM pg_statio_user_tables;
```

---

## 7. Real-World Production Failure Scenarios

### Failure Scenario 1: The PostgreSQL Checkpoint Spike Avalanche
#### Incident
Every 5 minutes, an e-commerce database experienced a 10-second freeze where transaction throughput dropped from 15,000 TPS to **0 TPS**. Web app worker connections backlogged, triggering a cascading outage.

#### Root Cause
Default aggressive checkpointing configuration:
- `checkpoint_completion_target` was left at legacy default `0.5`, with a small `max_wal_size = 1GB`.
- Every time 1 GB of WAL was written, PostgreSQL triggered a **Checkpoint**: it forced hundreds of thousands of dirty pages to disk as fast as possible.
- The storage subsystem saturated at 100% disk utilization (`iowait > 90%`), blocking incoming transaction WAL flushes (`fsync`).

#### Remediation
Smooth out checkpoint writes over the entire checkpoint interval:
```ini
# postgresql.conf tuning
max_wal_size = 16GB
min_wal_size = 2GB
checkpoint_timeout = 15min
checkpoint_completion_target = 0.9  # Spread writes over 90% of the 15-minute window
```

---

### Failure Scenario 2: RocksDB / Cassandra Compaction Death Spiral
#### Incident
A write-heavy event telemetry cluster using RocksDB sustained 80,000 writes/second. After 48 hours, write throughput collapsed to **$400\text{ writes/sec}$**, while disk write throughput was maxed out at $800\text{ MB/s}$.

#### Root Cause
**Write Stall due to Compaction Debt**:
- Incoming write volume exceeded the storage drive's ability to compact Level 0 SSTables down to Level 1.
- Level 0 accumulated $> 20$ uncompacted files.
- In LSM engines, because Level 0 SSTables can have overlapping key ranges, every point read must check all Level 0 files.
- To protect read performance, RocksDB engaged its emergency **Write Stall**: it intentionally throttled and paused all application writes until background threads cleared the compaction debt.

#### Solution
1. Allocate more background compaction threads (`max_background_jobs = 8`).
2. Implement **Dynamic Level Base Sizing** in RocksDB.
3. Migrate to ultra-fast NVMe storage with higher sustained random read/write throughput.

---

## 8. Practical Engineering Exercises (With Solutions)

### Exercise: Sizing WAL Disk Write Bandwidth for High-TPS Workloads
**Problem**: An order-matching engine commits **$25,000\text{ transactions/second}$**. Each transaction generates an average of **$800\text{ bytes}$** of WAL log data.
1. What sustained write bandwidth (in MB/s) must the dedicated WAL storage volume sustain?
2. If using an enterprise NVMe SSD with an average `fsync` latency of $30\text{ \mu s}$, can a single thread achieve this rate?
3. How does **Group Commit** resolve this throughput constraint?

#### Solution:
1. Calculate sustained WAL throughput:
   $$\text{Throughput} = 25,000\text{ txns/s} \times 800\text{ bytes} = 20,000,000\text{ bytes/s} \approx 19.07\text{ MB/s}$$
2. Single-thread synchronous commit limit:
   $$\text{Max Single-Thread TPS} = \frac{1}{0.000030\text{ s}} \approx 33,333\text{ TPS}$$
   A single thread can barely keep up with 25,000 TPS, leaving zero headroom for tail latency spikes.
3. **The Group Commit Solution**:
   Instead of issuing an independent `fsync` for every transaction, the database locks the WAL buffer briefly, allows multiple concurrent worker threads ($N=20$) to append their transaction records to the buffer, and issues a **single shared `fsync()`** for all 20 transactions simultaneously.
   - Total `fsync` calls reduced from 25,000/s to $1,250/\text{s}$, dramatically cutting I/O queue overhead while guaranteeing ACID durability for all 25,000 transactions.

---

## 9. Summary Checklist & Key Takeaways

1. **Slotted Pages Provide Stable TIDs**: Row payloads grow upward while line pointers grow downward, ensuring stable row identifiers without index rewrite penalties.
2. **The RUM Conjecture Governs Engine Selection**: B-Trees optimize for fast reads ($O(\log N)$); LSM-Trees optimize for high write throughput by converting random updates into sequential appends.
3. **The Inviolable WAL Invariant**: Data pages must never be flushed to disk before their corresponding WAL records are persistent ($\text{PageLSN} \le \text{FlushedLSN}$).
4. **Databases Bypass the OS Page Cache**: Enterprise databases use user-space buffer pools and `O_DIRECT` to eliminate double caching and control page eviction semantics.
5. **Smooth Out Checkpoints**: Configure `checkpoint_completion_target = 0.9` to prevent catastrophic I/O storms and database transaction freezes.
