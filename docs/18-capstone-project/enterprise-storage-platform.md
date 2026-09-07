---
id: enterprise-storage-platform
title: 18. Final Capstone Project
sidebar_label: 18. Capstone Project
sidebar_position: 18
---

# 18. Final Capstone Project: Enterprise Storage Platform

The capstone project synthesizes all theoretical concepts, hardware mechanics, distributed consensus protocols, and performance engineering practices learned across Modules 01 through 17.

---

## 1. Project Requirements & Engineering Specifications

You are appointed Principal Storage Architect for an enterprise fintech platform. You must design and present the complete storage infrastructure specification satisfying the following parameters:

```
+------------------------------------+---------------------------------------------------+
| Parameter                          | Value / Constraint                                |
+------------------------------------+---------------------------------------------------+
| Initial Usable Data Footprint      | 100 TB                                            |
| Projected Data Growth Rate         | 30% Compound Annual Growth Rate (CAGR)            |
| Availability SLA                   | 99.99% (Maximum 52.6 minutes downtime per year)   |
| Durability SLA                     | 99.999999999% (11 nines)                          |
| Workload Classification            | Mixed: Transactional OLTP + Analytics + Media     |
| Kubernetes Orchestration           | EKS / GKE StatefulSets running distributed DBs    |
| Recovery Objectives                | RPO <= 5 minutes; RTO <= 30 minutes               |
+------------------------------------+---------------------------------------------------+
```

---

## 2. Workload Breakdown & Storage Tier Assignment

| Workload Component | Data Size (Year 1) | Access Pattern | Target Storage Subsystem | Redundancy & Protection |
| :--- | :--- | :--- | :--- | :--- |
| **Transactional Ledger** | 10 TB | Random 8K OLTP, 80/20 Read/Write | NVMe Block Storage (RAID 10 / AWS io2) | Synchronous Multi-AZ Quorum + WAL PITR |
| **Object Data & User Documents** | 70 TB | Sequential, Immutable, Write-Once | Ceph / MinIO / S3 Object Storage | Reed-Solomon Erasure Coding (8+4) |
| **Analytics & Data Lake** | 20 TB | Columnar scans, Parquet batches | High-throughput object storage + NVMe cache | S3 lifecycle policies |

---

## 3. Five-Year Capacity & Growth Modeling

With a $30\%$ annual compound growth rate:

$$\text{Capacity}(t) = \text{Initial} \times (1 + g)^t$$

```
Year 0: 100.0 TB Usable
Year 1: 130.0 TB Usable
Year 2: 169.0 TB Usable
Year 3: 219.7 TB Usable
Year 4: 285.6 TB Usable
Year 5: 371.3 TB Usable
```

### Raw Disk Calculations (Erasure Coded 8+4 + 20% Overhead)
For the 70 TB object storage tier:
- Erasure Coding factor (8 data + 4 parity): $\frac{8+4}{8} = 1.5\times$
- Filesystem & Over-Provisioning reserve: $1.20\times$
$$\text{Raw Physical Disk Required (Year 0)} = 70 \text{ TB} \times 1.5 \times 1.20 = 126 \text{ TB Raw}$$
$$\text{Raw Physical Disk Required (Year 5)} = 260 \text{ TB} \times 1.5 \times 1.20 = 468 \text{ TB Raw}$$

---

## 4. Disaster Recovery & Failure Domain Architecture

```
+-----------------------------------------------------------+
| Region A (Primary Operational DC - us-east-1)             |
|  +-----------------------------+-----------------------+  |
|  | AZ-A1                       | AZ-A2                 |  |
|  |  [Postgres Primary]        |  [Postgres Sync]      |  |
|  |  [Ceph OSD Rack 1]          |  [Ceph OSD Rack 2]    |  |
|  +-----------------------------+-----------------------+  |
+------------------------------|----------------------------+
                               | Asynchronous Replication Link
                               | (Dedicated 10 Gbps DirectConnect)
+------------------------------v----------------------------+
| Region B (Disaster Recovery DC - us-west-2)               |
|  +-----------------------------------------------------+  |
|  | AZ-B1                                               |  |
|  |  [Postgres Async Read-Replica]                      |  |
|  |  [Ceph Cross-Region Target / S3 Object Mirror]      |  |
|  +-----------------------------------------------------+  |
+-----------------------------------------------------------+
```

### Failover Runbook (RTO = 18 minutes, RPO = 0 for Ledger, < 1 min for Objects)
1. **Automated Health Probe**: 3 consecutive failed health checks across all Region A endpoints (15 seconds).
2. **Promote Region B Read-Replica**: Run `pg_ctl promote` on the standby Postgres node (45 seconds).
3. **DNS / Anycast BGP Shift**: Route53 latency/health check updates Anycast IP routes to Region B ingress controllers (60 seconds).
4. **Validation**: Smoke test database read/write integrity against automated canary suite.

---

## 5. Comprehensive Deliverables Checklist

To complete this capstone, your design document must include:
- [x] **Architecture Diagram**: Visual mapping of all compute, block, and object tiers.
- [x] **IOPS & Throughput Sizing**: Calculation of peak IOPS and bandwidth requirements per subsystem.
- [x] **Failure Scenario Analysis**: Detailed matrix demonstrating survival of a lost disk, lost rack, and entire lost availability zone.
- [x] **Cost Optimization Analysis**: 3-year TCO comparison between purely Cloud-native (EBS/S3) vs. Hybrid On-Premises Ceph cluster.
