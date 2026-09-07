---
id: fio-benchmarking-and-profiling
title: 11. Storage Performance Engineering & fio
sidebar_label: 11. Performance Engineering
sidebar_position: 11
---

# 11. Storage Performance Engineering & fio

Storage performance engineering is the discipline of characterizing I/O workloads, isolating kernel and hardware bottlenecks, and benchmarking storage subsystems under realistic production stresses.

---

## 1. Workload Characterization Matrix

Every storage workload can be defined by four orthogonal dimensions:

```
                  Sequential Access
                         ▲
                         │   Large File Streaming
                         │   (Video, Backups, ETL)
                         │
     Write-Heavy ◄───────┼───────► Read-Heavy
   (Logs, Ingestion,     │         (Web caches, OLAP,
    Time-Series)         │          Read-Replicas)
                         │
                         │   Transactional OLTP
                         │   (Postgres, MySQL, Redis)
                         ▼
                   Random Access
```

1. **Access Pattern**: Sequential vs. Random.
2. **Read / Write Ratio**: 70/30 (typical OLTP), 95/5 (e-commerce cache), 10/90 (telemetry logs).
3. **Request Block Size**:
   - Small: 4 KB – 16 KB (databases, metadata).
   - Medium: 64 KB – 256 KB (sequential analytics scans).
   - Large: 1 MB – 16 MB (backup streaming, video playback).
4. **Concurrency & Queue Depth (QD)**: Number of outstanding asynchronous I/O requests submitted to the hardware pipeline simultaneously.

---

## 2. The Fundamental Law of Storage: Little's Law & Queue Depth

Little’s Law governs concurrency in any queueing system:

$$L = \lambda \times W$$
$$\text{Queue Depth (QD)} = \text{IOPS} \times \text{Latency (Seconds)}$$

### Real-World Example
Suppose an enterprise NVMe SSD provides an intrinsic physical latency of $50\mu\text{s}$ ($0.00005\text{ s}$).
- If an application uses **Queue Depth = 1** (single-threaded synchronous I/O):
  $$\text{Max IOPS} = \frac{1}{0.00005} = 20,000\text{ IOPS}$$
- To unlock the drive’s rated **800,000 IOPS**, the application or kernel must maintain:
  $$\text{Target Queue Depth} = 800,000 \times 0.00005 = 40\text{ concurrent outstanding I/Os}$$

---

## 3. Storage Bottleneck Diagnostic Quadrant

When a system slows down, isolate the subsystem using Linux observability tools:

| Bottleneck | Diagnostic Tool | Primary Metric | Remediation |
| :--- | :--- | :--- | :--- |
| **Storage Media Limit** | `iostat -xz 1` | `%util >= 95%`, `await >> svctm` | Upgrade to NVMe, add RAID stripes |
| **Filesystem Lock Contention** | `perf top`, `bpftrace` | Kernel spinlock on inode mutex | Switch to XFS, partition across mounts |
| **OS Page Cache Thrashing** | `sar -B 1`, `vmstat 1` | High `pgpgin`/`pgpgout`, low free DRAM | Increase RAM, drop dirty background limits |
| **Kernel Context Switches** | `pidstat -w 1` | $> 50,000$ context switches / sec | Switch from synchronous syscalls to `io_uring` |

---

## 4. Hands-on Lab: Enterprise fio Benchmarking Suite

Create an automated testing suite to measure maximum random IOPS, maximum sequential throughput, and latency percentiles.

### Script: `enterprise-storage-suite.fio`
```ini
[global]
ioengine=libaio
direct=1
runtime=45
time_based=1
size=2G
filename=/tmp/benchmark_target.dat
group_reporting=1

# -------------------------------------------------------------
# Test 1: Random 4K Read (Measures pure IOPS capability)
# -------------------------------------------------------------
[test1_randread_4k]
bs=4k
rw=randread
iodepth=64
numjobs=4

# -------------------------------------------------------------
# Test 2: Random 4K Write (Measures FTL & write buffer performance)
# -------------------------------------------------------------
[test2_randwrite_4k]
bs=4k
rw=randwrite
iodepth=64
numjobs=4

# -------------------------------------------------------------
# Test 3: Sequential 1M Read (Measures peak bandwidth)
# -------------------------------------------------------------
[test3_seqread_1m]
bs=1m
rw=read
iodepth=16
numjobs=2

# -------------------------------------------------------------
# Test 4: Mixed OLTP 70/30 (Measures realistic database workload)
# -------------------------------------------------------------
[test4_oltp_mixed]
bs=8k
rw=randrw
rwmixread=70
iodepth=32
numjobs=4
```

### Executing the Suite & Interpreting Results
```bash
fio enterprise-storage-suite.fio --output=storage_report.json --output-format=json
```

**Key Metric Checklist in fio Output**:
1. `iops`: Completed operations per second.
2. `bw_bytes`: Bandwidth (bytes/sec).
3. `clat_ns.percentile["99.000000"]`: 99th percentile completion latency (p99).
4. `cpu.usr` & `cpu.sys`: CPU consumption overhead during I/O.
