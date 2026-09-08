---
id: elbencho
title: "Elbencho: High-Performance Distributed Storage & S3 Microbenchmark"
sidebar_label: "4. Elbencho (Distributed & S3)"
sidebar_position: 5
---

# Elbencho: High-Performance Distributed Storage & S3 Microbenchmark

> **Origin**: Developed by Sven Breuner (creator of BeeGFS).  
> **Applicability**: Multi-gigabyte POSIX filesystems, raw NVMe-oF block namespaces, object storage (S3), GPU Direct Storage (GDS), and 100GbE / 400GbE scale-out clusters.

Elbencho is a modern, high-performance distributed microbenchmark written in C++. Designed specifically for **high-IOPS flash arrays, fast network storage, and S3 object stores**, it features extreme multi-threading, live terminal curses dashboards, and native distributed coordination across multiple client servers.

---

## 1. Architecture: Unified Block, File & Object Engine

Unlike legacy tools tailored exclusively for POSIX files or block devices, Elbencho natively exposes a single syntax across all three major storage paradigms:

```
+-------------------------------------------------------------------------+
|                        Elbencho Master Coordinator                      |
|                (Multi-Threaded C++ Engine + Curses UI)                 |
+------------------------------------+------------------------------------+
                                     |
                +--------------------+--------------------+
                |                    |                    |
                v                    v                    v
      +--------------------+ +----------------+ +------------------+
      |  POSIX Filesystem  | |  Block Devices | |  S3 Object Store |
      |  (NFS, CephFS, XFS)| |  (/dev/nvmeX)  | |  (MinIO, Ceph)   |
      +--------------------+ +----------------+ +------------------+
                |                    |                    |
                +--------------------+--------------------+
                                     |
                                     v
       +-------------------------------------------------------------+
       | Remote Worker Nodes (--service mode via TCP/IP or RoCE)     |
       +-------------------------------------------------------------+
```

### Key Differentiators
- **Zero Kernel Lock Overhead**: Optimized multi-threading scales cleanly across 128+ CPU cores without thread lock contention.
- **Native S3 Client**: Benchmarks S3 PUT, GET, and DELETE operations directly without wrapping python or shell scripts.
- **GPU Direct Storage (GDS)**: Supports direct memory transfers between NVIDIA GPUs and NVMe-oF targets via cuFile.
- **Live Visual Curses Mode**: Real-time throughput, IOPS, and latency bar graphs updated dynamically in your terminal.

---

## 2. Installation & Quick Start

```bash
# Ubuntu / Debian (from official releases)
wget https://github.com/breuner/elbencho/releases/latest/download/elbencho-x86_64.tar.gz
tar -xzf elbencho-x86_64.tar.gz
sudo mv elbencho /usr/local/bin/

# RHEL / Rocky Linux
sudo dnf install -y ncurses-devel libaio-devel openssl-devel
# Or build from source
git clone https://github.com/breuner/elbencho.git && cd elbencho && make -j$(nproc)
sudo cp bin/elbencho /usr/local/bin/

# Verify installation
elbencho --version
```

---

## 3. The 10 Essential Elbencho Workload Snippets

### Snippet 1: Beginner Single-Thread File Write (Sanity Test)
*Objective*: Write a single 1 GiB file with 1 MiB blocks to verify filesystem throughput.

```bash
elbencho --write --size 1G --block 1M /mnt/storage/test_1g.dat
```

---

### Snippet 2: Beginner Single-Thread File Read (Verification)
*Objective*: Read the previously written file and record bandwidth.

```bash
elbencho --read --size 1G --block 1M /mnt/storage/test_1g.dat
```

---

### Snippet 3: Multi-Threaded High-Throughput Sequential Write
*Objective*: Saturate storage pipelines using 16 concurrent worker threads and 1 MiB blocks writing 16 distinct files.

```bash
elbencho --write --threads 16 --size 4G --block 1M --direct /mnt/storage/file_{t}.dat
```
*Note*: `{t}` automatically expands into the worker thread ID (`file_0.dat`, `file_1.dat`, etc.).

---

### Snippet 4: 4 KiB Random Read IOPS Stress Test
*Objective*: Stress Flash storage controllers with 32 concurrent threads executing 4 KiB random reads.

```bash
elbencho --read --threads 32 --size 10G --block 4k --rand --direct /mnt/storage/file_{t}.dat
```

---

### Snippet 5: High-Density Directory & File Tree Creation (Metadata Bench)
*Objective*: Benchmark filesystem metadata engine by creating 100 directories containing 1,000 small files each (100,000 total files).

```bash
elbencho --mkdirs --dirs 100 --files 1000 --size 4k --threads 16 /mnt/storage/tree/dir_{d}/file_{f}.dat
```

---

### Snippet 6: High-Speed Parallel File & Directory Deletion
*Objective*: Benchmark filesystem metadata unlink throughput by rapidly deleting the previously generated tree.

```bash
# Delete all files concurrently across 16 worker threads
elbencho --delfiles --dirs 100 --files 1000 --threads 16 /mnt/storage/tree/dir_{d}/file_{f}.dat

# Remove the directory tree
elbencho --deldirs --dirs 100 --threads 8 /mnt/storage/tree/dir_{d}
```

---

### Snippet 7: Direct I/O Raw NVMe Block Device Benchmark
*Objective*: Bypass filesystem overhead completely to benchmark a raw block device namespace.

```bash
sudo elbencho --write --threads 32 --block 128k --direct --size 20G /dev/nvme0n1
```

---

### Snippet 8: S3 Object Storage High-Throughput Write Benchmark
*Objective*: Upload 10,000 objects (1 MiB each) to an S3-compatible object store (MinIO/Ceph RGW) using 32 parallel connections.

```bash
elbencho --s3-endpoint 192.168.10.50:9000 \
  --s3-accesskey minioadmin \
  --s3-secretkey minioadmin \
  --s3-bucket benchmark-bucket \
  --write --threads 32 --files 10000 --size 1M \
  s3://benchmark-bucket/obj_{t}_{f}
```

---

### Snippet 9: S3 Object Read & Cleanup Deletion Benchmark
*Objective*: Benchmark S3 GET request throughput followed by high-speed concurrent object deletion.

```bash
# High-concurrency S3 GET read
elbencho --s3-endpoint 192.168.10.50:9000 \
  --s3-accesskey minioadmin \
  --s3-secretkey minioadmin \
  --s3-bucket benchmark-bucket \
  --read --threads 32 --files 10000 --size 1M \
  s3://benchmark-bucket/obj_{t}_{f}

# Concurrent S3 object DELETE
elbencho --s3-endpoint 192.168.10.50:9000 \
  --s3-accesskey minioadmin \
  --s3-secretkey minioadmin \
  --s3-bucket benchmark-bucket \
  --delfiles --threads 32 --files 10000 \
  s3://benchmark-bucket/obj_{t}_{f}
```

---

### Snippet 10: Multi-Host Distributed Benchmark with Live Visual Curses UI
*Objective*: Coordinate multiple client machines to simultaneously stress a shared distributed storage cluster while displaying real-time metrics.

```bash
# On Worker Nodes (192.168.10.11, 192.168.10.12):
elbencho --service

# On Master Coordinator Node:
elbencho --hosts 192.168.10.11,192.168.10.12 \
  --live --write --threads 32 --size 10G --block 1M \
  --direct /mnt/shared_lustre/bench_{h}_{t}.dat
```

---

## 4. Reading Elbencho's Live Dashboard

When `--live` is specified, Elbencho displays a high-resolution terminal dashboard:

```
+========================================================================+
|                       ELBENCHO REAL-TIME MONITOR                       |
+========================================================================+
  Threads: 64  | Block Size: 1.00 MiB | Direct I/O: YES
  Targets: /mnt/shared_lustre/bench_{h}_{t}.dat
--------------------------------------------------------------------------
  WRITE THROUGHPUT : [||||||||||||||||||||||||||||||||    ] 11.42 GiB/s
  WRITE IOPS       : [||||||||||||||||||||||||||||||||    ] 11,694 IOPS
  AVG LATENCY      : 5.47 ms  |  MIN: 1.12 ms  |  MAX: 18.94 ms
--------------------------------------------------------------------------
  Host 192.168.10.11:  5.71 GiB/s ( 5,847 IOPS) Lat: 5.41 ms
  Host 192.168.10.12:  5.71 GiB/s ( 5,847 IOPS) Lat: 5.53 ms
+========================================================================+
```
This multi-host telemetry allows engineers to pinpoint client imbalances or network fabric drops instantaneously.
