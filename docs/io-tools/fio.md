---
id: fio
title: "FIO (Flexible I/O Tester): The Industry-Standard Synthetic Engine"
sidebar_label: "1. FIO (Flexible I/O Tester)"
sidebar_position: 2
---

# FIO (Flexible I/O Tester): The Industry-Standard Synthetic Engine

> **Origin**: Created by Jens Axboe (Linux kernel block layer maintainer).  
> **Applicability**: Block devices (`/dev/nvmeXnY`, `/dev/sdX`), filesystems (ext4, XFS, ZFS, NFS), character devices, and user-space drivers (SPDK, RDMA).

FIO is the de facto industry benchmark for characterizing storage hardware and kernel I/O subsystems. It allows engineers to control block size, I/O patterns, concurrency, asynchronous engines, and queue depths while tracking nanosecond-precision latency percentiles.

---

## 1. Architecture & Core Concepts

```
+-------------------------------------------------------------------------+
|                              fio Process                                |
|  +-------------------------------------------------------------------+  |
|  | Jobs / Threads (numjobs=N)                                        |  |
|  |  +---------------------+  +---------------------+                 |  |
|  |  | Thread 1 (iodepth=M)|  | Thread N (iodepth=M)|                 |  |
|  |  +----------+----------+  +----------+----------+                 |  |
|  +-------------|------------------------|----------------------------+  |
|                v                        v                               |
|  +-------------------------------------------------------------------+  |
|  | I/O Engine Interface (ioengine=...)                               |  |
|  |  - sync / psync (Standard POSIX pread/pwrite)                     |  |
|  |  - libaio (Linux native asynchronous I/O)                         |  |
|  |  - io_uring (Modern Linux ring-buffer async engine)               |  |
|  |  - spdk (User-space NVMe driver via DPDK, zero kernel overhead)  |  |
|  +-------------------------------------------------------------------+  |
+------------------------------------+------------------------------------+
                                     |
                                     v
                 +---------------------------------------+
                 | Kernel VFS / Direct I/O / Block Layer |
                 +-------------------+-------------------+
                                     |
                                     v
                 +---------------------------------------+
                 | Physical NVMe / SSD / Network Target  |
                 +---------------------------------------+
```

### Essential Flag Dictionary
- `direct=1`: Opens the file/device with `O_DIRECT`, completely bypassing the Linux Page Cache.
- `ioengine=libaio` or `ioengine=io_uring`: Selects the asynchronous submission engine.
- `iodepth=32`: Keeps 32 I/O requests simultaneously in flight per thread.
- `numjobs=4`: Spawns 4 independent worker processes or threads.
- `group_reporting=1`: Aggregates metrics across all worker jobs into a single unified summary.
- `time_based=1` + `runtime=60`: Runs the workload for exactly 60 seconds regardless of file size.
- `ramp_time=10`: Discards the first 10 seconds of measurements to ignore cache-warming spikes.

---

## 2. Installation & Quick Start

```bash
# Ubuntu / Debian
sudo apt-get update && sudo apt-get install -y fio

# RHEL / Rocky Linux / AlmaLinux
sudo dnf install -y epel-release && sudo dnf install -y fio

# macOS (Homebrew)
brew install fio

# Verify version and compiled engines
fio --version
fio --enghelp
```

---

## 3. The 10 Essential Workload Snippets

### Snippet 1: Beginner Sequential Write (Throughput Baseline)
*Objective*: Measure peak sequential write bandwidth to a file using large 1 MiB blocks.

```bash
fio --name=seq-write-test \
  --filename=test_file.dat \
  --size=4G \
  --rw=write \
  --bs=1M \
  --direct=1 \
  --ioengine=libaio \
  --iodepth=8 \
  --numjobs=1 \
  --group_reporting
```

---

### Snippet 2: Beginner Sequential Read (Direct I/O Cache Bypass)
*Objective*: Measure maximum read throughput from physical media without host DRAM caching.

```bash
fio --name=seq-read-test \
  --filename=test_file.dat \
  --size=4G \
  --rw=read \
  --bs=1M \
  --direct=1 \
  --ioengine=libaio \
  --iodepth=8 \
  --numjobs=1 \
  --group_reporting
```

---

### Snippet 3: 4 KiB Random Write (Steady-State OLTP IOPS)
*Objective*: Stress the storage controller and Flash Translation Layer (FTL) with small 4 KiB writes.

```bash
fio --name=rand-write-4k \
  --filename=/dev/nvme0n1 \
  --rw=randwrite \
  --bs=4k \
  --direct=1 \
  --ioengine=libaio \
  --iodepth=32 \
  --numjobs=4 \
  --time_based \
  --runtime=120 \
  --ramp_time=10 \
  --group_reporting
```

---

### Snippet 4: 4 KiB Random Read (Single-Thread Tail Latency)
*Objective*: Characterize baseline unloaded read access latency ($Queue\ Depth = 1$).

```bash
fio --name=latency-randread-4k \
  --filename=/dev/nvme0n1 \
  --rw=randread \
  --bs=4k \
  --direct=1 \
  --ioengine=sync \
  --iodepth=1 \
  --numjobs=1 \
  --time_based \
  --runtime=60 \
  --percentile_list=50:90:99:99.9:99.99
```

---

### Snippet 5: 70/30 Mixed Random Read/Write (Realistic Database Profile)
*Objective*: Emulate production transactional databases (PostgreSQL, MySQL, Oracle) with a 70% read / 30% write distribution.

```bash
fio --name=oltp-mixed-70-30 \
  --filename=/dev/nvme0n1 \
  --rw=randrw \
  --rwmixread=70 \
  --bs=8k \
  --direct=1 \
  --ioengine=libaio \
  --iodepth=32 \
  --numjobs=4 \
  --time_based \
  --runtime=300 \
  --group_reporting
```

---

### Snippet 6: High-Concurrency Core Scaling (Saturating Multi-Queue NVMe)
*Objective*: Spawn one worker per CPU core to evaluate hardware queue submission scaling.

```bash
fio --name=core-saturation \
  --filename=/dev/nvme0n1 \
  --rw=randread \
  --bs=4k \
  --direct=1 \
  --ioengine=libaio \
  --iodepth=64 \
  --numjobs=$(nproc) \
  --cpus_allowed=0-$(($(nproc)-1)) \
  --group_reporting
```

---

### Snippet 7: Data Integrity & Block Checksum Verification
*Objective*: Write patterned data blocks, calculate SHA256 checksums, and immediately read back to verify bit-level integrity.

```bash
fio --name=integrity-verify \
  --filename=verify_target.img \
  --size=2G \
  --rw=randwrite \
  --bs=16k \
  --direct=1 \
  --ioengine=libaio \
  --verify=sha256 \
  --do_verify=1 \
  --verify_fatal=1 \
  --verify_dump=1
```

---

### Snippet 8: Storage Delete / TRIM Benchmark (Space Deallocation)
*Objective*: Measure flash discard / TRIM throughput and flash controller block-reclamation latency.

```bash
# Benchmark TRIM deallocation speed across block device
fio --name=trim-benchmark \
  --filename=/dev/nvme0n1 \
  --rw=trim \
  --bs=1M \
  --direct=1 \
  --ioengine=libaio \
  --iodepth=16 \
  --time_based \
  --runtime=60 \
  --group_reporting

# Interleaved TRIM and write workload
fio --name=trim-write-mix \
  --filename=/dev/nvme0n1 \
  --rw=trimwrite \
  --bs=64k \
  --direct=1 \
  --ioengine=libaio \
  --iodepth=16 \
  --runtime=60
```

---

### Snippet 9: Ultra-Low Latency `io_uring` with Kernel Polling (`hipri`)
*Objective*: Eliminate context switches and interrupts completely using modern Linux `io_uring` submission polling.

```bash
fio --name=io-uring-poll \
  --filename=/dev/nvme0n1 \
  --rw=randread \
  --bs=4k \
  --direct=1 \
  --ioengine=io_uring \
  --hipri=1 \
  --sqthread_poll=1 \
  --iodepth=32 \
  --numjobs=1 \
  --runtime=30 \
  --group_reporting
```

---

### Snippet 10: Production Enterprise Job Configuration File (`storage-qualification.fio`)
*Objective*: Execute a multi-stage enterprise test suite (preconditioning, sequential throughput, and random IOPS) from a version-controlled config file.

Create `storage-qualification.fio`:
```ini
[global]
ioengine=libaio
direct=1
group_reporting=1
filename=/dev/nvme0n1
time_based=1
ramp_time=10
runtime=180

[stage1-seq-fill]
rw=write
bs=1M
iodepth=16
numjobs=1
time_based=0
size=100%

[stage2-4k-randwrite]
stonewall
rw=randwrite
bs=4k
iodepth=64
numjobs=4

[stage3-4k-randread]
stonewall
rw=randread
bs=4k
iodepth=64
numjobs=4

[stage4-8k-mixed-oltp]
stonewall
rw=randrw
rwmixread=70
bs=8k
iodepth=32
numjobs=4
```

Execute with:
```bash
sudo fio storage-qualification.fio --output=qualification_results.json --output-format=json
```

---

## 4. Reading & Interpreting FIO Results

When FIO completes, it outputs a detailed breakdown:

```
Jobs: 4 (f=4): [w(4)][100.0%][r=0KiB/s,w=942MiB/s][r=0,w=241k IOPS][eta 00m:00s]
rand-write-4k: (groupid=0, jobs=4): err= 0: pid=12401:
  write: IOPS=241k, BW=942MiB/s (988MB/s)(55.2GiB/60000msec)
    slat (usec): min=2, max=45, avg= 3.12, stdev= 0.84
    clat (usec): min=18, max=3421, avg=528.41, stdev=94.12
     lat (usec): min=21, max=3425, avg=531.53, stdev=94.20
    clat percentiles (usec):
     |  1.00th=[  180],  5.00th=[  290], 10.00th=[  380], 20.00th=[  440],
     | 50.00th=[  520], 70.00th=[  580], 90.00th=[  640], 95.00th=[  700],
     | 99.00th=[  890], 99.90th=[ 1240], 99.99th=[ 2180]
```

- **`slat` (Submission Latency)**: Time elapsed from when the application called submission until the kernel accepted the I/O into the queue.
- **`clat` (Completion Latency)**: Time elapsed from kernel submission until the hardware completed the operation. This reflects real drive performance.
- **`lat` (Total Latency)**: $slat + clat$.
- **Tail Latency (99.99th)**: $2180\text{ µs}$ ($2.18\text{ ms}$). If your SLA is sub-1ms, this indicates intermittent garbage collection pauses.
