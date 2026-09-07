---
id: aws-azure-gcp-comparison
title: 13. Cloud Storage (AWS, Azure, GCP)
sidebar_label: 13. Cloud Storage
sidebar_position: 13
---

# 13. Cloud Storage (AWS, Azure, GCP)

Public cloud providers partition storage offerings into three distinct service classes: Block, File, and Object. Selecting the wrong tier or failing to optimize lifecycle rules leads to severe cloud invoice overruns.

---

## 1. Cloud Storage Architecture Matrix

```
+----------------+-------------------------------+-------------------------------+-------------------------------+
| Tier           | Amazon Web Services (AWS)     | Microsoft Azure               | Google Cloud Platform (GCP)   |
+----------------+-------------------------------+-------------------------------+-------------------------------+
| Block Storage  | Amazon EBS                    | Azure Managed Disks           | Persistent Disk & Hyperdisk   |
| (Raw Virtual)  | (gp3, io2 Block Express)      | (Premium SSD v2, Ultra Disk)  | (pd-ssd, pd-balanced, extreme)|
+----------------+-------------------------------+-------------------------------+-------------------------------+
| File Storage   | Amazon EFS (NFS)              | Azure Files                   | Google Cloud Filestore        |
| (POSIX Shared) | Amazon FSx (Lustre / NetApp)  | (SMB / NFSv4)                 | (NFSv3 / NFSv4.1)             |
+----------------+-------------------------------+-------------------------------+-------------------------------+
| Object Storage | Amazon S3                     | Azure Blob Storage            | Google Cloud Storage (GCS)    |
| (REST / HTTP)  | (Standard, Infrequent, Glacier)| (Hot, Cool, Cold, Archive)   | (Standard, Nearline, Archive) |
+----------------+-------------------------------+-------------------------------+-------------------------------+
```

---

## 2. Block Storage Deep Dive: EBS vs. Azure Disks vs. GCP Hyperdisk

### AWS Elastic Block Store (EBS)
- **`gp3` (General Purpose SSD)**: Baseline 3,000 IOPS and 125 MB/s throughput included free with any volume size. Can scale up to 16,000 IOPS and 1,000 MB/s independently of disk size.
- **`io2 Block Express`**: High-performance NVMe SAN volume delivering up to 256,000 IOPS, 4,000 MB/s throughput, and sub-millisecond latency. 99.999% volume durability.

### Azure Managed Disks
- **Premium SSD v2**: Offers flexible provisioning of IOPS (up to 80,000) and throughput (up to 1,200 MB/s) independently of disk capacity.
- **Ultra Disk**: Designed for SAP HANA and mission-critical SQL Server clusters, scaling to 160,000 IOPS and sub-millisecond latency.

### GCP Hyperdisk
- Dynamically decouple capacity from performance. `Hyperdisk Extreme` provides up to 500,000 IOPS and 10 GB/s throughput per instance.

---

## 3. Object Storage Lifecycle & Tiering Economics

```
+----------------------+--------------------+--------------------+--------------------+
| Tier                 | Cost per GB / Mo   | Retrieval Fee / GB | Access Latency     |
+----------------------+--------------------+--------------------+--------------------+
| AWS S3 Standard      | ~$0.023            | $0.00              | Milliseconds (ms)  |
| AWS S3 Infrequent (IA)| ~$0.0125          | $0.01              | Milliseconds (ms)  |
| AWS S3 Glacier Flex  | ~$0.0036           | $0.03              | 1 - 5 Minutes      |
| AWS S3 Deep Archive  | ~$0.00099          | $0.05              | 12 - 48 Hours      |
+----------------------+--------------------+--------------------+--------------------+
```

> [!CAUTION]
> **The Retrieval Fee Trap**: If your application transitions data to an archive tier (e.g., S3 Glacier) but continues scanning it daily, retrieval and per-request API fees (`GET/LIST`) will rapidly eclipse your storage cost savings!

---

## 4. Cloud Storage Cost Optimization Strategies

1. **Migrate from `gp2` to `gp3` on AWS**: Instant 20% cost reduction per gigabyte, with guaranteed baseline IOPS decoupled from volume size.
2. **Automate Object Lifecycle Rules**: Transition data from S3 Standard $\to$ S3 Standard-IA at 30 days $\to$ Glacier Flexible at 90 days $\to$ Delete or Deep Archive at 365 days.
3. **Beware of Inter-AZ and Inter-Region Data Egress**: Transferring storage blocks across Availability Zones (AZs) or across cloud regions incurs steep network egress charges ($0.01 - $0.09 per GB). Colocate compute instances in the exact same AZ as the storage volumes.
4. **Delete Orphaned EBS Snapshots & Unattached Volumes**: Regularly scan for unattached volumes (`State: available`) and old point-in-time snapshots using automated AWS Lambda or Cloud Custodian policies.
