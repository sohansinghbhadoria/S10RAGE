---
id: s3-architecture-and-minio
title: 07. Object Storage Internals
sidebar_label: 07. Object Storage
sidebar_position: 7
---

# 07. Object Storage Internals

Object storage departs from the hierarchical directories of filesystems and fixed sector addresses of block storage by managing data as discrete, globally addressable units over HTTP REST APIs.

---

## 1. Paradigm Comparison: Block vs. File vs. Object

| Property | Block Storage | File Storage (POSIX) | Object Storage |
| :--- | :--- | :--- | :--- |
| **Data Unit** | Fixed-size sectors (4 KB) | Files in directory trees | Discrete objects in flat buckets |
| **Addressing** | LBA (Logical Block Address)| Hierarchical `/path/to/file` | Uniform URI: `s3://bucket/key` |
| **Metadata** | None (pure raw sectors) | Inode attributes (mode, size) | Unlimited custom key-value metadata |
| **Modification** | In-place overwrite | In-place overwrite, append | **Immutable** (Write-once, replace whole) |
| **Protocol** | NVMe, SCSI, Fibre Channel | NFS, SMB, POSIX syscalls | HTTP / REST (S3 API, OpenStack Swift)|
| **Scalability Limit** | Terabytes to Petabytes | Petabytes | **Exabytes (Virtually infinite)** |

---

## 2. Core S3 Concepts & Deep Dive

```
s3://analytics-lake/2026/09/metrics.parquet
     ▲              ▲
     │              └──── Object Key (Flat string, '/' is purely visual convention)
     └─────────────────── Bucket (Flat namespace per region)

Object Internal Anatomy:
├── Unique ID / Key: "2026/09/metrics.parquet"
├── Payload / Data: Binary payload (0 bytes to 5 TB)
├── System Metadata: ETag (MD5/SHA256 checksum), Size, Content-Type, Last-Modified
└── User Custom Metadata: x-amz-meta-department="finops", x-amz-meta-retention="7y"
```

### 1. Object Immutability & Versioning
Objects cannot be modified in-place. If you change a single byte in a 10 GB object, you must upload the entire 10 GB again or create a new object.
- **Versioning**: Preserves previous iterations of an object under a unique `VersionId`. Deleted objects receive a soft "Delete Marker", preventing accidental data loss or ransomware overwrite.

### 2. Multipart Uploads
For files larger than 100 MB (mandatory for objects $> 5\text{ GB}$):
1. **Initiate**: `CreateMultipartUpload` returns an `UploadId`.
2. **Upload Parts**: Application splits file into $5\text{ MB} - 5\text{ GB}$ parts, uploading them concurrently across multiple HTTP streams with unique `PartNumber`s and ETags.
3. **Complete**: `CompleteMultipartUpload` passes the ordered list of part ETags; the storage cluster concatenates parts atomically.

### 3. Lifecycle Policies & Tiering
Automated state machines transition objects between storage classes based on age prefix rules:
- **Hot Tier** (Standard): High-frequency access, immediate retrieval.
- **Warm Tier** (Infrequent Access - IA): Lower storage cost, higher per-GB retrieval fee.
- **Cold Tier** (Glacier Flexible / Deep Archive): Lowest storage cost, retrieval latency takes minutes to hours.

---

## 3. Hands-on Lab: Deploying & Interacting with a Local S3 MinIO Cluster

MinIO is a high-performance, Kubernetes-native S3-compatible object storage server.

### Step 1: Launch MinIO via Docker or Standalone Binary
```bash
# Run standalone MinIO server in Docker
docker run -d \
  -p 9000:9000 \
  -p 9001:9001 \
  --name minio-dev \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=<YOUR_STRONG_PASSWORD>" \
  -v /tmp/minio_data:/data \
  quay.io/minio/minio server /data --console-address ":9001"
```

### Step 2: Configure the AWS CLI to Interact with Local MinIO
```bash
# Install AWS CLI if not present, then configure local profile
export AWS_ACCESS_KEY_ID="minioadmin"
export AWS_SECRET_ACCESS_KEY="<YOUR_STRONG_PASSWORD>"
export AWS_DEFAULT_REGION="us-east-1"
S3_ENDPOINT="http://localhost:9000"

# 1. Create a Bucket
aws --endpoint-url $S3_ENDPOINT s3 mb s3://datalake-demo

# 2. Upload an Object with Custom Metadata
echo "Sample Storage Payload" > test_payload.txt
aws --endpoint-url $S3_ENDPOINT s3 cp test_payload.txt s3://datalake-demo/data/test_payload.txt \
  --metadata '{"classification":"confidential","retention":"30d"}'

# 3. Retrieve Object and Verify Metadata
aws --endpoint-url $S3_ENDPOINT s3api head-object \
  --bucket datalake-demo \
  --key data/test_payload.txt
```

### Step 3: Configure Object Lifecycle Rule (JSON)
```json
{
  "Rules": [
    {
      "ID": "MoveLogsToGlacierAfter30Days",
      "Prefix": "logs/",
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "GLACIER"
        }
      ],
      "Expiration": {
        "Days": 365
      }
    }
  ]
}
```
```bash
aws --endpoint-url $S3_ENDPOINT s3api put-bucket-lifecycle-configuration \
  --bucket datalake-demo \
  --lifecycle-configuration file://lifecycle.json
```
