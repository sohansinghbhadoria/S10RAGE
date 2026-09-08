---
id: fio-benchmarking-and-profiling
title: "11. Storage Performance Engineering: fio Benchmarking, Tail Latency & eBPF Profiling"
sidebar_label: 11. Performance Engineering
sidebar_position: 11
---

# 11. Storage Performance Engineering: fio Benchmarking, Tail Latency & eBPF Profiling

> **Prerequisites**: Module 01 (Storage Metrics & Little's Law), Module 02 (The Linux I/O Path), Module 03 (Storage Media & FTL).  
> **Target Audience**: Performance Engineers, SREs, Systems Architects, and Infrastructure Engineers conducting hardware evaluations.

Storage performance engineering is the rigorous science of characterizing I/O workloads, preconditioning storage hardware to steady-state realities, measuring true latency distributions without coordinated omission, and profiling kernel block queues with microsecond precision.

A naive benchmark that measures only average throughput or tests inside the OS Page Cache produces numbers disconnected from real production workloads, resulting in catastrophic under-provisioning.

---

## 1. Workload Characterization: The 4 Orthogonal Vectors

Every enterprise storage workload can be decomposed into four primary vectors:

```
                            Sequential Access
                                   ▲
                                   │   Batch ETL & Backups
                                   │   (1 MB - 16 MB Block Size, High Bandwidth)
                                   │
      Write-Heavy ◄────────────────┼────────────────► Read-Heavy
    (Time-Series Ingestion,        │                  (Web Caches, OLAP Queries,
     Kafka Logs, WAL)              │                   Read Replicas)
                                   │
                                   │   Transactional OLTP
                                   │   (4 KB - 16 KB Block Size, Low Latency Priority)
                                   ▼
                              Random Access
```

### 1. Access Pattern: Sequential vs. Random
- **Sequential**: Logical block addresses (LBAs) are accessed in ascending order ($LBA_0, LBA_1, LBA_2$). Leverages OS read-ahead prefetching and maximizes mechanical platter transfer speeds.
- **Random**: LBAs are accessed unpredictably ($LBA_{40218}, LBA_{21}, LBA_{980142}$). Eliminates read-ahead benefits and stresses device controller lookup tables, Flash Translation Layers (FTL), and seek mechanics.

### 2. Read / Write Ratio
- **$100\%$ Read**: Static media delivery, cold analytical models.
- **$70/30$ Read/Write**: Standard enterprise OLTP baseline (e.g., PostgreSQL, MySQL).
- **$10/90$ Write-Heavy**: Logging brokers (Kafka), telemetry collectors (ClickHouse, Prometheus).

### 3. I/O Block Size
- **Small ($4\text{ KB} - 16\text{ KB}$)**: Relational databases, metadata operations, indexing lookups.
- **Medium ($64\text{ KB} - 256\text{ KB}$)**: Columnar analytics scans, compressed Parquet chunks.
- **Large ($1\text{ MB} - 16\text{ MB}$)**: Backup streaming, video streaming, VM image copies.

### 4. Concurrency & Queue Depth (QD)
The number of outstanding, parallel I/O requests submitted to the device driver simultaneously. Single-threaded synchronous code runs at $\text{QD}=1$; distributed asynchronous engines run at $\text{QD}=32$ to $\text{QD}=256$.

---

## 2. The Seven Deadly Sins of Storage Benchmarking

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     How Naive Benchmarks Lie to You                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Testing inside the OS Page Cache (Testing DRAM speed, not persistent disk)│
│ 2. Testing files smaller than physical host RAM                             │
│ 3. Testing pristine, factory-fresh SSDs (Testing SLC cache, not steady-state)│
│ 4. Committing Coordinated Omission (Dropping queue delay data points)       │
│ 5. Reporting Mean (Average) Latency instead of p99 / p99.9 percentiles      │
│ 6. Failing to warm up the storage subsystem (Ignoring ramp-up transients)   │
│ 7. Letting the CPU frequency governor throttle clock speeds mid-test        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1. The Page Cache Illusion
Running a command like `dd if=/dev/zero of=test.img bs=1M count=1000` does not test disk speed. It writes data into the host's volatile DRAM Page Cache at memory bus speeds ($> 10\text{ GB/s}$). **Always use `O_DIRECT` (`direct=1`) in benchmarks.**

### 2. Testing Smaller Than RAM
If you test a 10 GB file on a server equipped with 64 GB of RAM, the entire file will reside permanently in the Page Cache after the first read. All subsequent reads bypass the disk entirely. **Benchmark dataset size must be at least $2\times$ to $3\times$ the physical host DRAM.**

### 3. The Factory-Fresh SSD Fallacy & Preconditioning
New, empty SSDs have 100% free erased flash blocks and use dynamic **SLC pseudo-caching**. Benchmarks on fresh drives show blistering write speeds for the first 10 minutes.
- Once the drive fills up, free blocks are exhausted, the SLC cache depletes, and the drive is forced into **synchronous Garbage Collection** (the "write cliff").
- **Rule of Preconditioning**: Before measuring SSD performance, write random data across the entire physical capacity of the drive at least twice ($2\times \text{Drive Capacity}$) to force the FTL into its true production **steady state**.

### 4. Coordinated Omission
First identified by Gil Tene. When a benchmarking tool generates load synchronously:
- If a storage drive freezes for 2 seconds during an internal garbage collection cycle, a synchronous test client pauses and waits.
- Only **one** long-latency operation is logged.
- The 20,000 requests that *would* have arrived during those 2 seconds were never issued, meaning the benchmark report completely **omits the catastrophic queuing delay** that real users would experience.

---

## 3. The Gold Standard: `fio` (Flexible I/O Tester)

`fio` is the authoritative industry-standard tool for storage performance engineering, written by Jens Axboe (Linux kernel block layer maintainer).

```
                      Anatomy of an Enterprise fio Configuration
[global]
ioengine=io_uring        # Modern kernel asynchronous ring buffer engine
direct=1                 # Bypass Linux Page Cache (O_DIRECT)
buffered=0
time_based               # Run for a fixed duration, not fixed size
runtime=60s              # Sustained test duration
ramp_time=10s            # Discard initial 10-second warm-up transients
group_reporting          # Aggregate multi-thread metrics into single summary
filename=/dev/nvme0n1    # Target block device or raw benchmark file

[oltp-random-readwrite]
rw=randrw                # 70% random reads, 30% random writes
rwmixread=70
bs=8k                    # 8 KB database page size
iodepth=32               # Queue Depth of 32 in flight
numjobs=4                # 4 parallel worker threads (128 total concurrent I/Os)
```

### Key `fio` Engine Types (`ioengine`)
- `sync`: Basic synchronous POSIX `read()`/`write()` with `lseek()`. Runs at $\text{QD}=1$.
- `libaio`: Linux native asynchronous I/O (`io_submit`/`io_getevents`). Requires `direct=1`.
- `io_uring`: State-of-the-art lockless kernel ring buffers. Delivers millions of IOPS with lowest CPU utilization.
- `posixaio`: Userspace `glibc` thread-pool AIO. Avoid in production benchmarking.

---

## 4. Governing Mathematical Formulations

### 1. Knee-of-the-Curve Concurrency Optimization
As you increase Queue Depth ($\text{QD}$), IOPS increases linearly while latency remains flat, until the hardware hits its physical saturation limit (the **Knee**):

```
Throughput (IOPS) & Latency vs. Queue Depth:
IOPS (▲)
 │               Knee of the Curve
 │           ┌─────────────────────────── (IOPS Saturates)
 │          /
 │         /
 │        /                               Latency Explodes! (Queue bloat)
 │       /                                  /
 │      /                                  /
 └─────/──────────────────────────────────/──────► Queue Depth (QD)
      Optimal Efficiency Zone
```

- **Optimal Operating Queue Depth**: The point just before the latency curve transitions from horizontal to exponential growth.
- Pushing concurrency past the knee does **not** yield more IOPS; it merely inflates request wait time in kernel buffers (**queue bloat**).

### 2. Throughput, IOPS & Bandwidth Derivation
$$\text{Throughput (MB/s)} = \frac{\text{IOPS} \times \text{Block Size (Bytes)}}{1024 \times 1024}$$

$$\text{IOPS Required for Target Bandwidth} = \frac{\text{Target Throughput (MB/s)} \times 1024 \times 1024}{\text{Block Size (Bytes)}}$$

---

## 5. Linux Kernel Storage Profiling & Observability

When benchmarks show unexpected latency spikes, use the kernel observability toolkit to isolate the bottleneck layer.

### 1. The eBPF / BCC Storage Toolkit
```bash
# 1. Install bcc-tools / bpftrace
sudo apt-get install -y bpfcc-tools bpftrace || sudo yum install -y bcc-tools

# 2. Trace block I/O latency distribution (Histogram)
# Shows exact breakdown: microsecond vs millisecond requests
sudo biolatency-bpfcc -D 5

# 3. Trace individual slow I/O requests exceeding 10 ms (10,000 µs)
sudo biosnoop-bpfcc | awk '$NF > 10000'

# 4. Measure time requests spend waiting inside the block queue before dispatch
sudo bqlatency-bpfcc 5
```

### 2. Deep Kernel Block Tracing with `blktrace` and `btt`
`blktrace` records every event in the kernel block layer life cycle:
- `Q` (Queued): I/O request entered block layer.
- `G` (Get request): Allocated `struct request`.
- `I` (Inserted): Placed into I/O scheduler elevator queue.
- `D` (Dispatched): Handed off to storage hardware controller over PCIe/SATA.
- `C` (Completed): Hardware returned completion interrupt.

```bash
# Record 10 seconds of raw block events on NVMe device
sudo blktrace -d /dev/nvme0n1 -w 10

# Parse and analyze lifecycle delays using btt (Block Trace Tool)
blkparse -i nvme0n1 -d nvme0n1.bin
btt -i nvme0n1.bin
```
*Key metric*: Inspect the **D2C (Driver to Completion)** time. If D2C is high, the physical disk hardware is slow; if **Q2D (Queue to Driver)** is high, the kernel scheduler or CPU lock contention is the bottleneck.

---

## 6. Real-World Production Failure Scenarios

### Failure Scenario: The "100,000 IOPS" Cloud Storage Benchmark Illusion
#### Incident
An infrastructure team selected a cloud storage volume tier based on marketing claims and a 5-minute benchmark showing 80,000 IOPS.
After launching their high-volume database in production, transaction latency exploded from $1\text{ ms}$ to **$45\text{ ms}$** on Day 3, causing an emergency rollback.

#### Root Cause
The benchmarking script:
1. Created an empty 100 GB volume and immediately ran `fio` for 5 minutes.
2. The benchmark operated entirely within the cloud provider's temporary **Burst Bucket Allocation** and the SSD's empty SLC cache.
3. Once the database ran for 72 hours, the burst credit bucket drained to zero, and the underlying SSD entered steady-state Garbage Collection, dropping sustained performance to its baseline limit of **6,000 IOPS**.

#### Prevention Playbook
1. Always run endurance benchmarks for a minimum of **$2\times$ the burst duration window** (typically 12 to 24 hours).
2. Fully precondition SSDs with random writes before collecting benchmark data.
3. Explicitly verify provisioned baseline IOPS limits versus burst limits in cloud vendor SLAs.

---

## 7. Practical Engineering Exercises (With Solutions)

### Exercise: Identifying the Optimal Queue Depth from Benchmark Data
**Problem**: An engineer benchmarks an NVMe drive with $4\text{ KB}$ random reads at increasing Queue Depths, recording the following metrics:

| Queue Depth (QD) | Measured IOPS | Average Latency (\mu s) | p99 Latency (\mu s) |
| :--- | :--- | :--- | :--- |
| **QD = 1** | 20,000 | $50 µs$ | $65 µs$ |
| **QD = 4** | 78,000 | $51 µs$ | $70 µs$ |
| **QD = 16** | 290,000 | $55 µs$ | $85 µs$ |
| **QD = 32** | 520,000 | $61 µs$ | $110 µs$ |
| **QD = 64** | 680,000 | $94 µs$ | $220 µs$ |
| **QD = 128** | 705,000 | $181 µs$ | $650 µs$ |
| **QD = 256** | 710,000 | $360 µs$ | $1,850 µs$ |

1. Where is the **Knee of the Curve**?
2. What Queue Depth should be configured in the production database connection pool?

#### Solution:
1. Analyze the incremental gains:
   - Increasing QD from 16 to 32 gains **230,000 IOPS** (+79%) with negligible latency increase ($55 µs \to 61 µs$).
   - Increasing QD from 32 to 64 gains **160,000 IOPS** (+30%), but p99 latency doubles ($110 µs \to 220 µs$).
   - Increasing QD from 64 to 128 gains only **25,000 IOPS** (+3.6%), but average latency doubles and p99 latency triples to $650 µs$.
   - Increasing QD from 128 to 256 yields virtually zero additional IOPS (+0.7%), but latency inflates by nearly $300\%$.
   - **The Knee occurs between $\text{QD}=32$ and $\text{QD}=64$.**
2. **Production Sizing**:
   Configure the database connection pool concurrency to maintain a total cluster queue depth of **$\text{QD} = 32 - 48$**. This captures over **$85\%$ of the drive's maximum throughput** while keeping p99 transaction response times safely under **$120 µs$**, completely avoiding queue bloat.

---

## 8. Summary Checklist & Key Takeaways

1. **Never Benchmark Without `direct=1`**: Bypassing the Linux Page Cache is mandatory to measure physical storage performance.
2. **Precondition All SSDs**: Write random data across the drive twice before testing to measure true steady-state garbage collection performance.
3. **Beware Coordinated Omission**: Measure open-loop latency distributions; never rely solely on mean or median ($p50$) metrics.
4. **Find the Knee of the Curve**: Do not maximize Queue Depth blindly; find the point where IOPS saturates before tail latency explodes.
5. **Trace the Stack with eBPF**: Use `biolatency` and `blktrace` to distinguish physical hardware latency (D2C) from kernel block queue latency (Q2D).
