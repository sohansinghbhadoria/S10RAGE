---
id: system-design-patterns
title: 16. Storage Architecture & System Design
sidebar_label: 16. Architecture & Design
sidebar_position: 16
---

# 16. Storage Architecture & System Design

Architecting an enterprise storage system is the process of selecting and composing storage tiers to satisfy six competing dimensions: **Capacity**, **Performance**, **Availability**, **Durability**, **Scalability**, and **Cost**.

---

## 1. The Six-Dimensional Storage Decision Matrix

```
                          Capacity
                             ▲
                             │
            Cost ◄───────────┼───────────► Performance (IOPS / Latency)
                             │
                             │
            Durability ◄─────┼─────► Availability / Scalability
                             ▼
```

1. **Capacity**: How many Terabytes or Petabytes must be retained?
2. **Performance**: What are the strict $p99$ read/write latency SLAs and required peak IOPS/throughput?
3. **Availability**: How many nines of uptime ($99.9\%$ vs. $99.999\%$)?
4. **Durability**: What is the risk tolerance for permanent bit loss (e.g., 11 nines)?
5. **Scalability**: Can storage grow linearly without downtime or complex re-sharding?
6. **Cost**: Capital expense (hardware/servers) vs Operational expense (cloud egress/retrieval).

---

## 2. Industry Reference Architectures

### 1. High-Concurrency Web Application (e.g., E-Commerce)
- **Session & Caching Tier**: In-memory Redis cluster (sub-millisecond reads).
- **Transactional State**: PostgreSQL with primary-replica streaming replication on NVMe block storage.
- **Static Assets & User Uploads**: S3 / Cloudflare R2 object storage fronted by a global CDN (CloudFront / Fastly).

### 2. Video Streaming & Distribution Platform (e.g., YouTube / Netflix)
- **Ingestion & Transcoding**: Local high-speed NVMe scratch storage (`O_DIRECT` raw streaming).
- **Master Archive**: Multi-AZ Object storage with cold tiering policies.
- **Edge Delivery**: Segmented HLS/DASH video chunks cached on NVMe edge proxy servers using large sequential reads.

### 3. Core Banking & Ledger System
- **ACID Primary**: Multi-AZ distributed SQL (CockroachDB / Spanner) or active-passive Oracle/PostgreSQL with synchronous quorum replication.
- **Durability Tier**: Synchronous SAN mirroring (Zero RPO), write-once audit logs stored with WORM compliance.

### 4. Big Data & Analytics Lakehouse
- **Storage Format**: Apache Parquet or Apache Iceberg on S3/Ceph object storage.
- **Query Engines**: Trino / ClickHouse querying columnar files using vectorized SIMD instructions, caching hot data locally on ephemeral NVMe disks.

---

## 3. Capacity Planning & Failure Domain Modeling

$$\text{Usable Capacity} = \text{Raw Disk Space} \times \text{RAID / EC Efficiency} \times (1 - \text{Reserve}) \times (1 - \text{FS Overhead})$$

- **Filesystem & Inode Overhead**: Reserve $5 - 10\%$ for metadata and root reservation.
- **SSD Over-Provisioning**: Reserve $10 - 20\%$ unallocated space to allow the SSD controller to run Garbage Collection efficiently without write cliff degradation.
- **Failure Domain Isolation**: Ensure that redundant replicas never share the same power distribution unit (PDU), top-of-rack (ToR) switch, or cooling circuit.

---

## 4. Top Common Storage Architecture Anti-Patterns

1. **Using Object Storage as a POSIX Filesystem**: Mount tools like `s3fs` simulate filesystems over HTTP, but lack atomic renames, have no append operations, and incur massive latency penalties for small reads.
2. **Ignoring Write Amplification in SSD Workloads**: Subjecting consumer QLC SSDs to random database writes exhausts flash endurance within months.
3. **Neglecting Disk Rebuild Times**: Rebuilding an 18 TB hard drive in a degraded RAID 5 array takes 24 to 72 hours of constant random reads, during which the probability of a second disk failure (Unrecoverable Read Error - URE) approaches 100%!
