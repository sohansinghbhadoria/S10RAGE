---
id: replication-and-erasure-coding
title: 08. Network & Distributed Storage
sidebar_label: 08. Distributed Storage
sidebar_position: 8
---

# 08. Network & Distributed Storage

When data volume or availability demands outstrip the physical constraints of a single physical server, data must be distributed across an untrusted network of nodes.

---

## 1. Why Distributed Storage?

1. **Horizontal Scalability**: Add commodity storage nodes dynamically rather than purchasing prohibitively expensive proprietary SAN arrays.
2. **High Availability**: Continuous operations despite disk failures, node crashes, power outages, and top-of-rack (ToR) switch partitions.
3. **Failure Domains**: Distribute redundant copies across independent electrical, cooling, rack, and geographic boundaries.

```
Failure Domain Hierarchy:
+-----------------------------------------------------------+
| Region: us-east-1                                         |
|  +-----------------------------+-----------------------+  |
|  | Data Center A (AZ-1)        | Data Center B (AZ-2)  |  |
|  |  +-----------------------+  |  +-----------------+  |  |
|  |  | Rack 1 (PDU-1, ToR-1) |  |  | Rack 2 (PDU-2)  |  |  |
|  |  |  [Node 1]  [Node 2]   |  |  |  [Node 3]       |  |  |
|  |  +-----------------------+  |  +-----------------+  |  |
|  +-----------------------------+-----------------------+  |
+-----------------------------------------------------------+
```

---

## 2. Replication Models: Synchronous vs. Asynchronous

### Synchronous Replication
The primary node writes to local storage and concurrently transmits data to replica nodes. The client request does NOT return success until a quorum of replicas acknowledge stable write.

```
Client         Primary Node       Replica 1       Replica 2
  │                  │                │               │
  │── write(K, V) ──►│                │               │
  │                  │── replicate ──►│               │
  │                  │── replicate ──────────────────►│
  │                  │◄── ack ────────│               │
  │                  │◄── ack ────────────────────────│
  │◄── 200 OK ───────│                │               │
```
- **RPO (Recovery Point Objective)**: $0$ (Zero data loss on primary crash).
- **Latency**: Bound by the slowest replica in the quorum ($T_{\text{network}} + T_{\text{disk\_fsync}}$).

### Asynchronous Replication
The primary node acknowledges write completion immediately after writing locally. Replicas pull or receive stream updates asynchronously in the background.
- **Latency**: Ultra-low.
- **RPO**: $>0$. If the primary suffers sudden hardware failure before updates replicate, committed data is lost permanently.

---

## 3. Quorum Consensus Formula

In a cluster with $N$ total replicas, consistency is governed by Read Quorum ($R$) and Write Quorum ($W$):

$$R + W > N$$

- **Strong Consistency (Strict Quorum)**: Every read is guaranteed to observe the latest committed write because the read set and write set must overlap by at least one replica.
- **Common Configuration ($N=3$)**:
  - $W = 2$, $R = 2$ ($2 + 2 = 4 > 3$). Can tolerate the loss of $1$ node without downtime.
  - High Write Speed: $W = 1$, $R = 3$ (Requires fast writes, but reads must query all 3 nodes).

---

## 4. Replication vs. Erasure Coding (EC)

As dataset sizes swell into petabytes, 3x replication (200% storage overhead) becomes economically unsustainable.

```
3x Replication:
[ Original Object: 10 MB ]
  ├── Replica 1: 10 MB
  ├── Replica 2: 10 MB
  └── Replica 3: 10 MB
Total Stored: 30 MB (Storage Efficiency = 33.3%, Overhead = 200%)

Erasure Coding (Reed-Solomon RS 4+2):
[ Original Object: 10 MB ]
  ├── Split into 4 Data Chunks (2.5 MB each):   [ D1 ] [ D2 ] [ D3 ] [ D4 ]
  └── Compute 2 Parity Chunks (2.5 MB each):    [ P1 ] [ P2 ]
Total Stored: 15 MB (Storage Efficiency = 66.7%, Overhead = 50%)
Can survive any 2 chunk failures simultaneously!
```

### Mathematical Tradeoffs

| Criterion | 3-Way Replication | Erasure Coding (e.g., $k=8, m=4$) |
| :--- | :--- | :--- |
| **Storage Overhead** | $200\%$ ($3\times$ cost) | $50\%$ ($1.5\times$ cost) |
| **Fault Tolerance** | Any 2 nodes can fail | Any $m$ (4) nodes can fail |
| **Compute / CPU Overhead** | Zero (simple bit copies) | High (Galois Field matrix multiplication) |
| **Network Reconstruction Penalty** | Reads 1 replacement stream | Must read $k$ chunks across network to rebuild 1 lost chunk |
| **Primary Workload** | Latency-sensitive DBs, WAL | Warm/Cold Object storage, Big Data, S3 |
