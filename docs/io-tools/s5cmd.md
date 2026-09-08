---
id: s5cmd
title: "s5cmd: Ultra-Fast Parallel S3 Client for 100GbE Pipelines"
sidebar_label: "8. S5cmd (High-Speed S3 Engine)"
sidebar_position: 9
---

# s5cmd: Ultra-Fast Parallel S3 Client for 100GbE Pipelines

> **Origin**: Open-sourced by Peak (peak.com) under the Apache 2.0 license.  
> **Applicability**: High-throughput S3 object pipelines, deep learning model checkpointing, saturating 10GbE/40GbE/100GbE network interfaces, parallel batch deletes, and big data ETL.

`s5cmd` is written in Go and designed from the ground up for **extreme concurrency**. While standard tools process S3 operations serially or with modest Python thread pools, `s5cmd` utilizes massive Go goroutine worker pools and non-blocking I/O routines, achieving up to **40x higher throughput** than standard tools when operating on thousands of objects.

---

## 1. Concurrency Architecture: Worker Pool Saturation

```
+----------------------------------------------------------------------------+
|                          s5cmd Engine Architecture                         |
|                                                                            |
|   +--------------------------------------------------------------------+   |
|   | Dispatcher Queue & File Scanner (Non-blocking I/O)                 |   |
|   +---------------------------------+----------------------------------+   |
|                                     |                                      |
|             +-----------------------+-----------------------+              |
|             |                       |                       |              |
|             v                       v                       v              |
|     +---------------+       +---------------+       +---------------+      |
|     | Goroutine 001 |       | Goroutine ... |       | Goroutine 256 |      |
|     +-------+-------+       +-------+-------+       +-------+-------+      |
|             |                       |                       |              |
|             +-----------------------+-----------------------+              |
|                                     |                                      |
|                                     v                                      |
|     +---------------------------------------------------------------+      |
|     | Fast HTTP Connection Pool (Keep-Alive, Reusable TLS Handshakes)|      |
|     +-------------------------------+-------------------------------+      |
+-------------------------------------+--------------------------------------+
                                      |
                                      v
      +---------------------------------------------------------------+
      | 100 GbE Network Fabric (To AWS S3 / MinIO / Ceph RGW)         |
      +---------------------------------------------------------------+
```

---

## 2. Installation & Credentials Setup

```bash
# macOS (Homebrew)
brew install peak/s5cmd/s5cmd

# Linux (Binary release)
curl -sL https://github.com/peak/s5cmd/releases/latest/download/s5cmd_$(uname -s)_$(uname -m).tar.gz | tar -xz -C /tmp
sudo mv /tmp/s5cmd /usr/local/bin/

# Verify installation
s5cmd version

# Configure environment variables for private S3 (MinIO / Ceph)
export AWS_ACCESS_KEY_ID="minioadmin"
export AWS_SECRET_ACCESS_KEY="minioadmin"
export S3_ENDPOINT_URL="http://192.168.10.50:9000"
export AWS_REGION="us-east-1"
```

---

## 3. The 10 Essential s5cmd Workload Snippets

### Snippet 1: Beginner Object Write (Single File Copy)
*Objective*: Upload a single file with automatic multipart chunking.

```bash
s5cmd --endpoint-url $S3_ENDPOINT_URL cp archive.tar.gz s3://benchmark-bucket/archive.tar.gz
```

---

### Snippet 2: Beginner Object Read (Single File Download)
*Objective*: Download an object from S3 to the current working directory.

```bash
s5cmd --endpoint-url $S3_ENDPOINT_URL cp s3://benchmark-bucket/archive.tar.gz .
```

---

### Snippet 3: Beginner Object Deletion
*Objective*: Remove a single object with instant sub-millisecond execution.

```bash
s5cmd --endpoint-url $S3_ENDPOINT_URL rm s3://benchmark-bucket/archive.tar.gz
```

---

### Snippet 4: Saturating Network Bandwidth (128 Concurrency Workers)
*Objective*: Upload a local directory of 50,000 files using 128 concurrent worker goroutines to saturate a 10GbE / 100GbE link.

```bash
s5cmd --endpoint-url $S3_ENDPOINT_URL --numworkers 128 \
  cp ./training_dataset/ s3://benchmark-bucket/training_dataset/
```

---

### Snippet 5: High-Speed Recursive Directory Download
*Objective*: Pull a large dataset from S3 to local NVMe storage using 64 concurrent threads.

```bash
s5cmd --endpoint-url $S3_ENDPOINT_URL --numworkers 64 \
  cp s3://benchmark-bucket/training_dataset/* ./local_cache/
```

---

### Snippet 6: Incremental Differential Synchronization (`sync`)
*Objective*: Synchronize local directory with S3, skipping identical objects based on size and timestamp.

```bash
s5cmd --endpoint-url $S3_ENDPOINT_URL sync ./data/ s3://benchmark-bucket/data/
```

---

### Snippet 7: Blazing Fast Parallel Wildcard Deletion
*Objective*: Purge millions of temporary objects using parallel wildcard expansion.

```bash
# Deletes thousands of objects per second using parallel REST DELETE calls
s5cmd --endpoint-url $S3_ENDPOINT_URL --numworkers 64 \
  rm s3://benchmark-bucket/logs/2026-05-*
```

---

### Snippet 8: Direct Standard Input Streaming (`pipe`)
*Objective*: Compress a 50 GiB directory and stream it directly to S3 without writing intermediate archive files to local disk.

```bash
tar -czf - /var/log/ | s5cmd --endpoint-url $S3_ENDPOINT_URL pipe s3://benchmark-bucket/system_logs.tar.gz
```

---

### Snippet 9: Batch Command Pipeline Execution (`s5cmd run`)
*Objective*: Execute thousands of heterogeneous operations (cp, rm, mv) from a single batch command file with zero process startup overhead.

Create `batch_operations.txt`:
```text
cp /data/report_01.csv s3://benchmark-bucket/reports/
cp /data/report_02.csv s3://benchmark-bucket/reports/
rm s3://benchmark-bucket/temp/old_checkpoint.pt
cp s3://benchmark-bucket/models/weights.bin /mnt/nvme/
```

Execute batch:
```bash
s5cmd --endpoint-url $S3_ENDPOINT_URL --numworkers 32 run batch_operations.txt
```

---

### Snippet 10: Performance Profiling Benchmark Script
*Objective*: Measure upload throughput across small (64 KiB) vs large (100 MiB) object distributions.

Create `s5cmd_profile.sh`:
```bash
#!/usr/bin/env bash
set -e

ENDPOINT="http://192.168.10.50:9000"
BUCKET="s3://benchmark-bucket"
WORKERS=64

# Test 1: 10,000 Small Objects (Metadata & Connection Stress)
echo "=== Phase 1: Small Objects (64 KiB x 2,000) ==="
mkdir -p /tmp/s5_small
for i in $(seq -w 1 2000); do
  dd if=/dev/urandom of=/tmp/s5_small/obj_${i}.dat bs=64k count=1 status=none
done

START=$(date +%s%N)
s5cmd --endpoint-url $ENDPOINT --numworkers $WORKERS cp /tmp/s5_small/* ${BUCKET}/small_test/
END=$(date +%s%N)
ELAPSED=$(echo "scale=3; ($END - $START) / 1000000000" | bc)
echo "Small objects completed in ${ELAPSED} seconds ($(echo "scale=1; 2000 / $ELAPSED" | bc) IOPS)"

# Test 2: Rapid Wildcard Deletion
echo "=== Phase 2: Parallel Wildcard Deletion ==="
START=$(date +%s%N)
s5cmd --endpoint-url $ENDPOINT --numworkers $WORKERS rm ${BUCKET}/small_test/*
END=$(date +%s%N)
ELAPSED=$(echo "scale=3; ($END - $START) / 1000000000" | bc)
echo "Deleted 2,000 objects in ${ELAPSED} seconds"

rm -rf /tmp/s5_small
```

Make executable and run:
```bash
chmod +x s5cmd_profile.sh && ./s5cmd_profile.sh
```

---

## 4. Tuning `s5cmd` for Maximum Throughput

1. **`--numworkers`**: Default is 256. For 100GbE network cards and high-concurrency Ceph/MinIO nodes, setting `--numworkers 512` eliminates idle socket waits.
2. **Connection Pooling**: Keep-Alive TCP connections are maintained across the worker pool, avoiding TCP three-way handshakes and TLS certificate validation overhead on each request.
