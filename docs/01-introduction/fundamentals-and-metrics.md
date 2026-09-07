---
id: fundamentals-and-metrics
title: 01. Introduction to Data Storage
sidebar_label: 01. Intro & Metrics
sidebar_position: 1
---

# 01. Introduction to Data Storage

> **Prerequisites**: Basic Linux command line knowledge, understanding of bits and bytes.  
> **Target Audience**: Systems engineers, database administrators, backend developers, SREs.

Storage is the foundational layer of stateful computing. In distributed systems, while computation is transient and memory is volatile, storage represents durability, correctness, and history.

---

## 1. Concept: Data vs. Information & Modern Storage

### Data vs. Information
- **Data**: Unprocessed, raw discrete values, bytes, or bit sequences stored on media (e.g., `0x7B 0x22 0x75 0x69 0x64...`).
- **Information**: Data placed into context, structured, and interpreted by a schema or runtime system (e.g., `{"uid": 1042, "status": "ACTIVE"}`).

### The Modern Storage Hierarchy
Storage architecture is governed by the physical tradeoff between **access speed**, **cost per gigabyte**, and **volatility**.

```
                   ▲
                  / \     CPU Registers (< 1 ns)
                 /   \    L1/L2/L3 SRAM Cache (1 - 15 ns)
                /     \   Main Memory: DRAM (50 - 100 ns)
               /       \  Non-Volatile RAM / CXL Persistent Memory (~150 - 300 ns)
              /         \ Fast NVMe SSDs / PCIe Gen 5 (10 - 50 µs)
             /           \ SATA / SAS SSDs (100 - 500 µs)
            /             \ Spinning HDDs (4 - 10 ms)
           /               \ Cold Archive: LTO Tape / Cloud Coldline (Seconds to Hours)
          ▼─────────────────▼
       Latency Increases              Cost per Terabyte Drops
```

---

## 2. Core Storage Metrics & Mathematical Definitions

When evaluating or architecting any storage system, you must balance seven primary metrics:

### 1. Capacity
The total raw or usable volume of persistent data:
- **Raw Capacity**: Total physical capacity of installed media without parity, formatting, or metadata overhead ($C_{\text{raw}} = N_{\text{disks}} \times \text{disk\_size}$).
- **Usable Capacity**: The net storage accessible to applications after RAID parity, filesystem overhead, reservation pools, and replication ($C_{\text{usable}} = C_{\text{raw}} \times \text{Efficiency}$).

### 2. IOPS (Input/Output Operations Per Second)
The count of distinct read or write operations completed per second:
$$\text{IOPS} = \frac{\text{Concurrency (Queue Depth)}}{\text{Latency (Seconds)}}$$

### 3. Throughput vs. Bandwidth
- **Throughput**: The actual volume of useful application payload delivered per unit time (e.g., MB/s or GB/s).
- **Bandwidth**: The theoretical maximum electrical or physical channel capacity of the link (e.g., PCIe 4.0 x4 = ~7.88 GB/s).

$$\text{Throughput} = \text{IOPS} \times \text{I/O Block Size}$$

> [!NOTE]
> An NVMe drive doing 100,000 IOPS with 4 KB blocks yields $\approx 400 \text{ MB/s}$.  
> The exact same drive doing only 1,000 IOPS with 2 MB sequential blocks yields $\approx 2,000 \text{ MB/s}$ (2 GB/s).  
> **IOPS alone is meaningless without specifying the block size.**

### 4. Latency
The time elapsed from the moment an application issues a storage request (via system call) until the kernel confirms completion.
- **Service Time**: Time spent processing on the physical storage device controller.
- **Queue Wait Time**: Time spent waiting in the OS kernel block queue or driver queue.

### 5. Availability vs. Durability
- **Availability ($A$)**: The probability that a storage service is accessible and responds to I/O requests at any given instant.
  $$A = \frac{\text{MTBF}}{\text{MTBF} + \text{MTTR}} \times 100\%$$
- **Durability**: The probability that stored data remains intact and free from corruption or bit rot over a multi-year horizon (e.g., AWS S3 advertises 99.999999999% "11 nines" durability).

---

## 3. Hands-on Lab: Measuring Disk Performance with Linux Tools

Run these commands on any modern Linux kernel system (Ubuntu, Debian, RHEL, or Fedora).

### Step 1: Inspect Physical & Block Topology
```bash
# Display block devices, major/minor numbers, size, and mount points
lsblk -o NAME,SIZE,FSTYPE,TYPE,MOUNTPOINTS,ROTA,DISC-GRAN

# Verify whether the device is rotational (HDD = 1, SSD = 0)
cat /sys/block/sda/queue/rotational

# Check logical vs physical block size
cat /sys/block/sda/queue/logical_block_size
cat /sys/block/sda/queue/physical_block_size
```

### Step 2: Benchmark Raw Storage Throughput with `dd`
```bash
# Sequential Write Test (bypassing page cache with direct I/O)
dd if=/dev/zero of=testfile.img bs=1M count=1024 oflag=direct status=progress

# Sequential Read Test
dd if=testfile.img of=/dev/null bs=1M status=progress

# Clean up
rm -f testfile.img
```

### Step 3: Real-Time I/O Telemetry with `iostat`
```bash
# Monitor disk utilization, IOPS, and await latency every 1 second
iostat -xz 1
```

**Key Columns to Inspect:**
- `r/s` & `w/s`: Read and write requests completed per second (IOPS).
- `rMB/s` & `wMB/s`: Read and write throughput.
- `r_await` & `w_await`: Average time (in milliseconds) for read/write requests served.
- `%util`: Percentage of CPU time during which I/O requests were issued to the device. Over 90% indicates an I/O bottleneck.

---

## 4. Failure Scenario: High `iowait` Starvation

### Symptoms
Applications experience request timeouts; `top` or `htop` displays high CPU percentage in `wa` (I/O wait), while user and system CPU usage remain low.

### Root Cause Analysis
`iowait` occurs when CPU cores are idle because all runnable tasks are blocked waiting for outstanding disk I/O operations to complete.

```bash
# 1. Identify which processes are generating high I/O
sudo iotop -oPa

# 2. Check kernel block queue backlog
cat /sys/block/sda/queue/nr_requests
```

---

## 5. Performance & Design Exercise

1. **Calculate Throughput**: A backup system needs to write 12 TB of database dumps in a 4-hour maintenance window. What sustained throughput (MB/s) must the storage subsystem provide?
2. **IOPS Calculation**: If the storage target uses 64 KB block sizes, how many sustained write IOPS are needed?
