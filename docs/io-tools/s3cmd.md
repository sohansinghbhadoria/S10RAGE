---
id: s3cmd
title: "s3cmd: S3 Object Management & Administrative Benchmarking"
sidebar_label: "7. S3cmd (S3 Admin & Scripting)"
sidebar_position: 8
---

# s3cmd: S3 Object Management & Administrative Benchmarking

> **Origin**: Written in Python by Michal Ludvig; widely adopted open-source S3 management tool.  
> **Applicability**: AWS S3, MinIO, Ceph RADOS Gateway (RGW), Google Cloud Storage (S3 API), and Cloudian HyperStore.

`s3cmd` is the veteran command-line client for Amazon S3 and compatible object storage systems. It provides fine-grained control over **configuration profiles, custom HTTPS endpoints, multipart chunk sizing, server-side encryption, recursive folder synchronization, and bucket lifecycle rule management**.

---

## 1. Architecture & Request Pipeline

```
+----------------------------------------------------------------------------+
|                             s3cmd CLI Engine                               |
|       (Python Requests / Urllib3 / MD5 Hash / Multipart Manager)           |
+-------------------------------------+--------------------------------------+
                                      |
                     [Read ~/.s3cfg Configuration]
                     - host_base = minio.corp:9000
                     - signature_v2 = False (AWS4-HMAC-SHA256)
                     - multipart_chunk_size_mb = 64
                                      |
                                      v
       +-------------------------------------------------------------+
       | HTTP / HTTPS REST API Requests                              |
       | - PUT (Single / Multipart Part Upload)                      |
       | - GET (Download / Byte-Range Fetch)                         |
       | - DELETE (Multi-Object XML Batch Purge)                     |
       +------------------------------+------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       | Object Storage Engine (AWS S3, Ceph RGW, MinIO)             |
       +-------------------------------------------------------------+
```

---

## 2. Installation & Profile Configuration

```bash
# Ubuntu / Debian
sudo apt-get update && sudo apt-get install -y s3cmd

# RHEL / Rocky Linux
sudo dnf install -y epel-release && sudo dnf install -y s3cmd

# macOS (Homebrew)
brew install s3cmd

# Run interactive configuration wizard
s3cmd --configure
```

---

## 3. The 10 Essential s3cmd Workload Snippets

### Snippet 1: Custom S3 Endpoint Configuration (`.s3cfg`)
*Objective*: Configure `s3cmd` to connect to a private on-premises MinIO or Ceph RGW cluster using Signature Version 4.

Create `~/.s3cfg`:
```ini
[default]
access_key = minioadmin
secret_key = minioadmin
host_base = 192.168.10.50:9000
host_bucket = 192.168.10.50:9000/%(bucket)
use_https = False
signature_v2 = False
multipart_chunk_size_mb = 32
```

Verify connection:
```bash
s3cmd ls
```

---

### Snippet 2: Beginner Object Write (Upload Single File)
*Objective*: Upload a 500 MiB file with real-time transfer progress and MD5 verification.

```bash
# Generate dummy payload
dd if=/dev/urandom of=payload_500m.bin bs=1M count=500

# Upload object
s3cmd put payload_500m.bin s3://benchmark-bucket/payload_500m.bin
```

---

### Snippet 3: Beginner Object Read (Download Single File)
*Objective*: Retrieve an object from the S3 bucket to local disk and verify MD5 checksum.

```bash
s3cmd get s3://benchmark-bucket/payload_500m.bin downloaded_payload.bin
```

---

### Snippet 4: Beginner Object Deletion
*Objective*: Remove a specific object from the target bucket.

```bash
s3cmd del s3://benchmark-bucket/payload_500m.bin
```

---

### Snippet 5: High-Speed Recursive Synchronization (`sync`)
*Objective*: Synchronize a local directory tree of thousands of files to an S3 prefix, uploading only new or modified objects.

```bash
s3cmd sync ./dataset/ s3://benchmark-bucket/dataset/ --skip-existing --preserve
```

---

### Snippet 6: Multipart Chunk Sizing Optimization (Multi-GB Objects)
*Objective*: Upload a large 10 GiB ISO image with custom 64 MiB multipart chunks to prevent network timeout retries.

```bash
s3cmd put large_system.iso s3://benchmark-bucket/large_system.iso \
  --multipart-chunk-size-mb=64 \
  --max-retries=5
```

---

### Snippet 7: Batch Recursive Deletion & Prefix Purge
*Objective*: Concurrently delete all objects under a specific bucket prefix.

```bash
s3cmd del --recursive --force s3://benchmark-bucket/dataset/
```

---

### Snippet 8: Server-Side Encryption (SSE) & Storage Tiering Benchmark
*Objective*: Measure the throughput impact of AES-256 server-side encryption and apply cold storage classes.

```bash
# Upload with SSE-S3 AES-256 encryption
s3cmd put payload_500m.bin s3://benchmark-bucket/encrypted.bin \
  --server-side-encryption

# Upload with Glacier Flexible Retrieval storage class
s3cmd put payload_500m.bin s3://benchmark-bucket/archive.bin \
  --storage-class=GLACIER
```

---

### Snippet 9: Automated Bucket Lifecycle Policy Creation (Wipe Rules)
*Objective*: Apply an automated XML lifecycle policy to purge objects older than 7 days automatically.

Create `lifecycle.xml`:
```xml
<LifecycleConfiguration>
  <Rule>
    <ID>ExpireTemporaryLogs</ID>
    <Prefix>logs/</Prefix>
    <Status>Enabled</Status>
    <Expiration>
      <Days>7</Days>
    </Expiration>
  </Rule>
</LifecycleConfiguration>
```

Apply rule:
```bash
s3cmd setlifecycle lifecycle.xml s3://benchmark-bucket
s3cmd getlifecycle s3://benchmark-bucket
```

---

### Snippet 10: Multi-Iteration Benchmarking Loop Script
*Objective*: Execute a structured test script measuring write bandwidth, read bandwidth, and delete operations across 10 iterations.

Create `s3cmd_benchmark.sh`:
```bash
#!/usr/bin/env bash
set -e

BUCKET="s3://benchmark-bucket"
FILE_SIZE_MB=100
ITERATIONS=5

echo "--- Generating ${FILE_SIZE_MB}MB Test File ---"
dd if=/dev/urandom of=bench_${FILE_SIZE_MB}M.dat bs=1M count=$FILE_SIZE_MB status=none

echo "--- Starting Upload (Write) Benchmark ---"
for i in $(seq 1 $ITERATIONS); do
  START=$(date +%s%N)
  s3cmd put bench_${FILE_SIZE_MB}M.dat ${BUCKET}/run_${i}.dat > /dev/null 2>&1
  END=$(date +%s%N)
  ELAPSED=$(echo "scale=3; ($END - $START) / 1000000000" | bc)
  MBPS=$(echo "scale=2; $FILE_SIZE_MB / $ELAPSED" | bc)
  echo "Iteration $i: Uploaded in ${ELAPSED}s (${MBPS} MB/s)"
done

echo "--- Starting Download (Read) Benchmark ---"
for i in $(seq 1 $ITERATIONS); do
  START=$(date +%s%N)
  s3cmd get ${BUCKET}/run_${i}.dat /tmp/download_${i}.dat --force > /dev/null 2>&1
  END=$(date +%s%N)
  ELAPSED=$(echo "scale=3; ($END - $START) / 1000000000" | bc)
  MBPS=$(echo "scale=2; $FILE_SIZE_MB / $ELAPSED" | bc)
  echo "Iteration $i: Downloaded in ${ELAPSED}s (${MBPS} MB/s)"
  rm -f /tmp/download_${i}.dat
done

echo "--- Cleaning Up (Delete) ---"
s3cmd del --recursive --force ${BUCKET}/run_*.dat > /dev/null 2>&1
rm -f bench_${FILE_SIZE_MB}M.dat
echo "Benchmark completed successfully."
```

Make executable and run:
```bash
chmod +x s3cmd_benchmark.sh && ./s3cmd_benchmark.sh
```
