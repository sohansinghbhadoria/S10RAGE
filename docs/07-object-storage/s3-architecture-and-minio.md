---
id: s3-architecture-and-minio
title: "07. Object Storage Internals: S3 Protocol, Multipart Uploads & MinIO Architecture"
sidebar_label: 07. Object Storage
sidebar_position: 7
---

# 07. Object Storage Internals: S3 Protocol, Multipart Uploads & MinIO Architecture

> **Prerequisites**: Module 01 (Storage Metrics), Module 04 (Storage Interfaces & Protocols).  
> **Target Audience**: Cloud Architects, Distributed Systems Engineers, Data Platform SREs, and Backend Developers building large-scale object lakes.

Object storage fundamentally departs from the hierarchical directories of filesystems and fixed sector addresses of block devices. By managing data as immutable, globally addressable units over stateless HTTP/REST APIs, object storage achieves virtually infinite horizontal scale, cross-region replication, and automated lifecycle tiering at petabyte-to-exabyte volumes.

---

## 1. Architectural Paradigms: Block vs. File vs. Object Storage

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                            Core Architectural Triad                              │
├─────────────────────────┬──────────────────────────┬─────────────────────────────┤
│ 1. Block Storage        │ 2. File Storage (POSIX)  │ 3. Object Storage (S3)      │
├─────────────────────────┼──────────────────────────┼─────────────────────────────┤
│ Fixed-size raw sectors  │ Hierarchical tree        │ Flat global namespace       │
│ (LBA 0, 1, 2... N)      │ (directories / files)    │ (Bucket + Key + Payload)    │
│ Protocol: NVMe, iSCSI   │ Protocol: NFSv4, SMB     │ Protocol: HTTP REST (S3)    │
│ Sub-millisecond latency │ Low millisecond latency  │ 10 - 50 milliseconds        │
│ Single-host exclusive   │ Multi-host shared POSIX  │ Internet-scale multi-tenant │
│ Mutable in-place        │ Mutable in-place, append │ Strictly Immutable (WORM)   │
│ Scaling: Terabytes      │ Scaling: Petabytes       │ Scaling: Exabytes           │
└─────────────────────────┴──────────────────────────┴─────────────────────────────┘
```

### Key Object Storage Characteristics
1. **Flat Global Namespace**: Buckets contain objects directly. There are no actual physical folders or directories; the forward-slash (`/`) in `s3://bucket/2026/09/data.parquet` is merely a character in a flat string key.
2. **Immutability (Write-Once-Read-Many / WORM)**: An object cannot be partially modified in-place. Updating a 10 GB file by 1 byte requires uploading the entire 10 GB replacement object.
3. **Rich Extensible Metadata**: Every object carries immutable system metadata (ETag, Content-Length, Content-Type, Last-Modified) and arbitrary custom user metadata (`x-amz-meta-*`).

---

## 2. Core S3 Concepts & Deep Protocol Mechanics

```
s3://analytics-lake/production/2026/09/metrics.parquet
     ▲              ▲
     │              └──── Object Key (Flat string; '/' is a visual delimiter)
     └─────────────────── Bucket Name (Globally unique within cloud partition)

Anatomy of an Stored Object:
├── Unique Key String: "production/2026/09/metrics.parquet"
├── Binary Data Stream: Payload (0 bytes up to 5 TB)
├── Version ID: "3/L4kqtJlcpXroDTDmJ+rmSpXd3dIbrHY"
├── System Metadata:
│   ├── ETag: "b10a8db164e0754105b7a99be72e3fe5" (MD5 or multipart checksum)
│   ├── Size: 4,294,967,296 bytes (4 GiB)
│   ├── Storage Class: STANDARD / INTELLIGENT_TIERING / GLACIER
│   └── Last-Modified: Tue, 08 Sep 2026 14:00:00 GMT
└── User Custom Metadata:
    ├── x-amz-meta-retention: "7-years"
    └── x-amz-meta-owner: "finops-team"
```

### The S3 Consistency Model Evolution
- **Prior to December 2020**: S3 provided *eventual consistency* for overwrite `PUT` and `DELETE` requests. A client updating an object and immediately reading it could receive stale data.
- **Modern S3 (Current Standard)**: Provides **Strong Read-After-Write Consistency** for `PUT`, `POST`, `DELETE`, and `LIST` operations across all AWS regions.
  - A successful `PUT` (`200 OK`) guarantees that subsequent `GET` or `LIST` requests will immediately return the latest version.
  - Concurrent writes to the same key are serialized via timestamp order: the last write wins.

---

## 3. Deep Dive: S3 Multipart Upload Architecture

Standard single-part HTTP `PUT` requests are limited to **5 GB** and are vulnerable to transient network disconnects. S3 solves this with the **Multipart Upload Protocol**, required for objects $> 100\text{ MB}$ and supporting objects up to **5 TB**:

```
Client Machine                                                  S3 Storage Service
      │                                                                  │
      ├─────── 1. InitiateMultipartUpload (Bucket, Key) ────────────────>│
      │<────── Returns UploadId: "VXBsb2FkIElE" ─────────────────────────┤
      │                                                                  │
      ├─────── 2. UploadPart (Part 1, Bytes 0-50MB) ────────────────────>│
      │<────── Returns ETag 1: "c4ca4238a0b923820dcc509a6f75849b" ──────┤
      │                                                                  │
      ├─────── 3. UploadPart (Part 2, Bytes 50-100MB) [Parallel] ───────>│
      │<────── Returns ETag 2: "c81e728d9d4c2f636f067f89cc14862c" ──────┤
      │                                                                  │
      ├─────── 4. UploadPart (Part N, Bytes ...) [Parallel] ────────────>│
      │<────── Returns ETag N: "eccbc87e4b5ce2fe28308fd9f2a7baf3" ──────┤
      │                                                                  │
      ├─────── 5. CompleteMultipartUpload (UploadId, Parts+ETags List) ─>│
      │<────── 200 OK, Object Manifest Assembled: ETag "hash-N" ─────────┤
```

### Multipart Upload Rules & Constraints
1. **Part Size Limits**: Minimum part size is **5 MB** (except for the final part); maximum part size is **5 GB**.
2. **Part Numbering**: Between $1$ and $10,000$ parts per object ($10,000 \times 5\text{ GB} = 50\text{ TB}$, though S3 caps max single object size at **5 TB**).
3. **ETag Manifest Hash**: The ETag of a multipart object is **not** an MD5 of the whole file. It is the MD5 checksum of the concatenated binary MD5 hashes of each individual part, suffixed with the part count (e.g., `"d41d8cd98f00b204e9800998ecf8427e-12"`).

> [!WARNING]
> If a client initiates a multipart upload, uploads 200 GB of parts, and then crashes before calling `CompleteMultipartUpload`, those parts remain stored in S3 indefinitely! You will be billed for that storage until you configure an **S3 Lifecycle Rule** to abort incomplete multipart uploads after 7 days.

---

## 4. Self-Hosted Object Storage: MinIO Architecture

MinIO is a high-performance, Kubernetes-native S3-compatible object storage server written in Go.

```
Incoming S3 API Request (PUT /bucket/object.bin)
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│ MinIO Server Node                                      │
│  - Stateless REST API Layer                            │
│  - Zero External Database (Metadata inlined in xl.meta)│
│  - SIMD-Accelerated Reed-Solomon Erasure Coding Engine │
│  - Bit-Rot Protection Engine (HighwayHash Checksum)   │
└────────────────────┬───────────────────────────────────┘
                     │
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
[ Drive 1 ]     [ Drive 2 ]     [ Drive N ]
xl.meta + part.1 xl.meta + part.2 xl.meta + parity.1
```

### 1. No External Database Architecture
Unlike legacy distributed storage systems (like OpenStack Swift or Ceph) that require external key-value stores (etcd, RocksDB, or MySQL) to track object metadata, MinIO is **stateless**:
- Every object is stored as a directory on standard filesystems (XFS/Ext4).
- The directory contains the raw data parts (`part.1`, `part.2`) and an atomic metadata file: `xl.meta`.
- `xl.meta` holds the complete manifest: ETag, custom metadata, timestamps, and erasure coding block locations.

### 2. Erasure Coding & HighwayHash Bit-Rot Protection
- MinIO slices objects into data and parity blocks using **Reed-Solomon Erasure Coding** ($k+m$).
- On every write, MinIO computes a high-speed **HighwayHash** (hashing at $> 10\text{ GB/s}$ per CPU core) of the payload.
- On every read, MinIO recalculates the HighwayHash. If silent disk bit-rot occurred, MinIO discards the corrupted block, reconstructs the data on the fly from surviving parity drives, and heals the bad drive in the background.

---

## 5. Governing Mathematical Formulations

### 1. Erasure Coding Storage Efficiency & Usable Space
For an erasure-coded storage cluster configured with $k$ data blocks and $m$ parity blocks:

$$\text{Storage Overhead Factor} = \frac{k + m}{k}$$

$$\text{Usable Storage Efficiency (\%)} = \frac{k}{k + m} \times 100\%$$

$$\text{Tolerable Drive Failures} = m$$

- Example: A MinIO deployment with $k=12$ data drives and $m=4$ parity drives:
  $$\text{Efficiency} = \frac{12}{12 + 4} = \frac{12}{16} = 75\% \quad (\text{Overhead } = 1.33\times)$$
  The system can lose any 4 drives simultaneously without data loss.

### 2. S3 Prefix Request Rate Limits
Amazon S3 partitions keys across internal storage partitions based on key prefixes:
- S3 delivers **3,500 `PUT`/`POST`/`DELETE` requests/sec** and **5,500 `GET`/`HEAD` requests/sec** per distinct key prefix.
- By distributing objects across prefixes, throughput scales horizontally to millions of requests per second:
  $$\text{Max Cluster Throughput} = N_{\text{prefixes}} \times 5,500\text{ GETs/second}$$

---

## 6. Hands-on Linux Lab: MinIO Cluster & S3 CLI Operations

### Step 1: Deploy a Multi-Drive MinIO Storage Server
```bash
# 1. Download MinIO server binary
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio && sudo mv minio /usr/local/bin/

# 2. Start MinIO with 4 local disk directories (Erasure Coded 2+2)
export MINIO_ROOT_USER="admin"
export MINIO_ROOT_PASSWORD="SuperSecretPassword2026!"
minio server /data/disk{1...4} --console-address ":9001" &
```

### Step 2: Configure the MinIO Client (`mc`) & S3 Operations
```bash
# Download and install mc client
wget https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc && sudo mv mc /usr/local/bin/

# Configure alias for local MinIO
mc alias set myminio http://localhost:9000 admin SuperSecretPassword2026!

# Create an S3 bucket with object versioning enabled
mc mb myminio/telemetry-data
mc version enable myminio/telemetry-data

# Upload a file with custom metadata
mc cp /etc/os-release myminio/telemetry-data/node-info.txt --attr "department=infra,env=prod"

# Inspect object metadata
mc stat myminio/telemetry-data/node-info.txt
```

### Step 3: Generate a Time-Limited Presigned URL
```bash
# Generate a presigned GET URL valid for 30 minutes
mc share download --expire 30m myminio/telemetry-data/node-info.txt
```

---

## 7. Real-World Production Failure Scenarios

### Failure Scenario 1: The Multi-Terabyte Multipart Billing Leak
#### Incident
A media encoding company processed thousands of video uploads daily. Over 6 months, their monthly AWS S3 bill climbed from $1,200 to **$14,500**, even though their reported object catalog showed steady data sizes.

#### Root Cause
Client mobile apps frequently dropped connections mid-upload:
- The apps called `InitiateMultipartUpload` and uploaded hundreds of 10 MB parts, but failed to call `CompleteMultipartUpload` or `AbortMultipartUpload` on connection drop.
- S3 retained over **380 TB of orphan multipart upload parts**, invisible to normal `aws s3 ls` queries but fully billable as active storage!

#### Remediation
Deploy an automated S3 Lifecycle Rule to purge incomplete multipart uploads across all buckets:
```json
{
  "Rules": [
    {
      "ID": "AbortIncompleteMultipartUploads",
      "Status": "Enabled",
      "Filter": {},
      "AbortIncompleteMultipartUpload": {
        "DaysAfterInitiation": 7
      }
    }
  ]
}
```

---

### Failure Scenario 2: S3 `503 Slow Down` Rate Limiting Storm
#### Incident
A Spark analytics job running on 500 EC2 nodes crashed with hundreds of `503 Slow Down: Reduce your request rate` errors when reading data from S3.

#### Root Cause
The data pipeline wrote all files using a monotonically increasing timestamp key prefix:
`s3://lake/logs/2026-09-08T14:00:00-worker1.parquet`
- Because all keys shared the identical prefix `logs/2026-09-08...`, S3 routed all 50,000 requests to a **single backend partition** capped at 5,500 GETs/sec.

#### Solution
1. Introduce hash-partitioned prefixes to distribute load across S3 partitions:
   `s3://lake/{hash}/logs/2026-09-08-...`
2. Configure AWS SDK exponential backoff and jitter retry algorithms.

---

## 8. Practical Engineering Exercises (With Solutions)

### Exercise: Erasure Coding Sizing for an On-Premises Object Lake
**Problem**: An organization builds an on-premises MinIO object storage cluster across 16 storage servers, each equipped with one $18\text{ TB}$ disk. The organization requires tolerance against **up to 4 simultaneous disk or server failures**.
1. What Reed-Solomon erasure coding configuration ($k+m$) should be configured?
2. What is the cluster’s total raw capacity, usable capacity, and storage efficiency?

#### Solution:
1. **Erasure Coding Profile**:
   - Total nodes/disks: $N = 16$.
   - Required fault tolerance: $m = 4$ parity drives.
   - Data drives: $k = N - m = 16 - 4 = 12$.
   - Profile: **$12 + 4$**.
2. **Capacity Calculations**:
   $$\text{Raw Capacity} = 16 \times 18\text{ TB} = 288\text{ TB}$$
   $$\text{Usable Capacity} = 288\text{ TB} \times \left(\frac{12}{16}\right) = 288 \times 0.75 = 216\text{ TB}$$
   $$\text{Storage Efficiency} = 75\% \quad (\text{Overhead } = 1.33\times)$$
- **Engineering Conclusion**: S3/MinIO erasure coding provides $4\text{-drive}$ fault tolerance with only **$33\%$ storage overhead**, compared to traditional 3x replication which imposes **$200\%$ storage overhead** ($33\%$ efficiency).

---

## 9. Summary Checklist & Key Takeaways

1. **Flat Hierarchy**: S3 has no directories; keys are flat strings where `/` is merely a convention.
2. **Always Use Multipart for $> 100\text{ MB}$**: Enables parallel uploading and network failure resilience.
3. **Always Set Incomplete Multipart Lifecycle Rules**: Prevent orphan upload parts from generating silent cloud bills.
4. **Erasure Coding Beats Replication**: Modern object storage achieves 75% usable efficiency while surviving 4 disk failures.
5. **Strong Consistency is Now Standard**: S3 provides strong read-after-write consistency for all operations.
