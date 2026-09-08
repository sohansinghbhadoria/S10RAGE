---
id: awscli
title: "AWS CLI & S3API: Cloud-Native Storage Operations & Benchmarking"
sidebar_label: "9. AWS CLI (aws s3 & s3api)"
sidebar_position: 10
---

# AWS CLI & S3API: Cloud-Native Storage Operations & Benchmarking

> **Origin**: Developed and maintained officially by Amazon Web Services.  
> **Applicability**: AWS S3 (Standard, Intelligent-Tiering, Glacier, Express One Zone), MinIO, Ceph RADOS Gateway, and any S3-compatible cloud object store.

The AWS Command Line Interface provides two distinct command layers for object storage:
1. **`aws s3` (High-Level)**: User-friendly commands (`cp`, `sync`, `rm`, `mb`) with built-in multi-threading and directory recursion.
2. **`aws s3api` (Low-Level)**: Direct 1-to-1 mapping to raw HTTP REST API actions (`PutObject`, `GetObject`, `DeleteObjects`), providing complete control over byte-range requests, multipart tokens, legal holds, and ACLs.

---

## 1. High-Level (`aws s3`) vs Low-Level (`aws s3api`)

```
+-------------------------------------------------------------------------+
|                                AWS CLI                                  |
|                                                                         |
|   +---------------------------------+ +------------------------------+  |
|   | High-Level: aws s3              | | Low-Level: aws s3api         |  |
|   | - High abstraction              | | - Raw REST API call mapping  |  |
|   | - Auto multipart chunking       | | - Byte-range query headers   |  |
|   | - Automatic recursive directory | | - Exact JSON request/response|  |
|   | - File-level sync algorithms    | | - WORM Object Lock & Tags    |  |
|   +----------------+----------------+ +--------------+---------------+  |
+--------------------|---------------------------------|------------------+
                     |                                 |
                     v                                 v
          +-------------------------------------------------------+
          | S3 Storage Engine (AWS / MinIO / Ceph Object Gateway) |
          +-------------------------------------------------------+
```

---

## 2. Installation & Profile Configuration

```bash
# Linux (Official AWS CLI v2 bundle)
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install

# macOS
brew install awscli

# Verify version
aws --version

# Configure named credentials profile
aws configure --profile benchmark-user
# AWS Access Key ID: minioadmin
# AWS Secret Access Key: minioadmin
# Default region name: us-east-1
# Default output format: json
```

---

## 3. The 10 Essential AWS CLI Workload Snippets

### Snippet 1: S3 Performance Tuning Configuration
*Objective*: Tune the AWS CLI transfer manager parameters to maximize network bandwidth and concurrent thread utilization.

```bash
# Maximize concurrent worker threads (default is 10)
aws configure set default.s3.max_concurrent_requests 64

# Increase multipart chunksize to 64MB for large files
aws configure set default.s3.multipart_chunksize 64MB

# Set multipart threshold to 64MB
aws configure set default.s3.multipart_threshold 64MB
```

---

### Snippet 2: High-Level Object Write (`aws s3 cp`)
*Objective*: Upload a file to S3 with explicit storage class definition.

```bash
aws --profile benchmark-user --endpoint-url http://192.168.10.50:9000 \
  s3 cp payload.bin s3://benchmark-bucket/payload.bin \
  --storage-class STANDARD
```

---

### Snippet 3: High-Level Object Read (`aws s3 cp`)
*Objective*: Download an object from S3 to local storage and display transfer progress.

```bash
aws --profile benchmark-user --endpoint-url http://192.168.10.50:9000 \
  s3 cp s3://benchmark-bucket/payload.bin downloaded_payload.bin
```

---

### Snippet 4: High-Level Recursive Object Deletion (`aws s3 rm`)
*Objective*: Concurrently remove all objects matching a prefix.

```bash
aws --profile benchmark-user --endpoint-url http://192.168.10.50:9000 \
  s3 rm s3://benchmark-bucket/logs/ --recursive
```

---

### Snippet 5: High-Speed Directory Synchronization with Deletion (`sync --delete`)
*Objective*: Mirror a local directory to an S3 bucket, automatically removing remote objects that no longer exist locally.

```bash
aws --profile benchmark-user --endpoint-url http://192.168.10.50:9000 \
  s3 sync ./assets/ s3://benchmark-bucket/assets/ --delete
```

---

### Snippet 6: Low-Level Write with Metadata & Checksums (`aws s3api put-object`)
*Objective*: Upload an object directly using the REST API, attaching custom user metadata headers and SHA256 checksum validation.

```bash
aws --profile benchmark-user --endpoint-url http://192.168.10.50:9000 \
  s3api put-object \
  --bucket benchmark-bucket \
  --key dataset/features.parquet \
  --body ./features.parquet \
  --checksum-algorithm SHA256 \
  --metadata '{"environment":"benchmark","pipeline":"ml-ingest"}'
```

---

### Snippet 7: Low-Level Byte-Range Partial Read (`aws s3api get-object --range`)
*Objective*: Measure partial object retrieval latency (essential for Parquet / Iceberg footer reads) by reading only bytes 0 through 1048575 (first 1 MiB).

```bash
aws --profile benchmark-user --endpoint-url http://192.168.10.50:9000 \
  s3api get-object \
  --bucket benchmark-bucket \
  --key dataset/features.parquet \
  --range bytes=0-1048575 \
  /tmp/parquet_footer.bin
```

---

### Snippet 8: Low-Level Bulk Multi-Object Delete via JSON Payload
*Objective*: Atomically delete up to 1,000 objects in a single HTTP POST request using `delete-objects`.

Create `delete_manifest.json`:
```json
{
  "Objects": [
    {"Key": "dataset/file_01.dat"},
    {"Key": "dataset/file_02.dat"},
    {"Key": "dataset/file_03.dat"}
  ],
  "Quiet": false
}
```

Execute atomic delete:
```bash
aws --profile benchmark-user --endpoint-url http://192.168.10.50:9000 \
  s3api delete-objects \
  --bucket benchmark-bucket \
  --delete file://delete_manifest.json
```

---

### Snippet 9: WORM Object Lock & Compliance Retention Testing
*Objective*: Test Write-Once-Read-Many (WORM) immutability by locking an object against modification or deletion until a future timestamp.

```bash
# Apply a 30-day compliance retention lock
aws --profile benchmark-user --endpoint-url http://192.168.10.50:9000 \
  s3api put-object-retention \
  --bucket benchmark-bucket \
  --key critical_audit.log \
  --retention '{ "Mode": "COMPLIANCE", "RetainUntilDate": "2026-12-31T00:00:00Z" }'

# Attempt to delete (Expected: AccessDenied 403 Forbidden)
aws --profile benchmark-user --endpoint-url http://192.168.10.50:9000 \
  s3api delete-object \
  --bucket benchmark-bucket \
  --key critical_audit.log
```

---

### Snippet 10: Legal Hold Immutability & Audit Inspection
*Objective*: Place an immutable Legal Hold on a sensitive storage object and inspect its status.

```bash
# Apply Legal Hold
aws --profile benchmark-user --endpoint-url http://192.168.10.50:9000 \
  s3api put-object-legal-hold \
  --bucket benchmark-bucket \
  --key financial_record.csv \
  --legal-hold Status=ON

# Query Legal Hold status
aws --profile benchmark-user --endpoint-url http://192.168.10.50:9000 \
  s3api get-object-legal-hold \
  --bucket benchmark-bucket \
  --key financial_record.csv
```

---

## 4. Benchmark Performance Best Practices

1. **Prefix Sharding**: In high-TPS S3 systems, Amazon S3 automatically partitions prefixes to scale request rates (3,500 PUT/POST/DELETE and 5,500 GET per second per partitioned prefix). Structure benchmark object keys with randomized or hashed prefixes (`s3://bucket/a7b2/obj.dat`) rather than monotonic sequential numbers.
2. **Byte-Range Fetching**: When reading large files, multiple concurrent threads issuing `Range: bytes=X-Y` requests will saturate network links much faster than a single monolithic `GetObject` request.
