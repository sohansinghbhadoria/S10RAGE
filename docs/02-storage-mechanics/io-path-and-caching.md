---
id: io-path-and-caching
title: 02. How Storage Actually Works
sidebar_label: 02. Storage Mechanics
sidebar_position: 2
---

# 02. How Storage Actually Works

> **Core Question**: What actually happens in the Linux kernel and hardware when your program executes `write(fd, buffer, 4096)`?

Understanding the complete I/O trajectory from user space down to physical NAND gates or magnetic platters is crucial for diagnosing latency spikes, write amplification, and file corruption.

---

## 1. The Anatomy of an I/O Operation

When a program writes data to disk, the request traverses five distinct architectural layers:

```
+-------------------------------------------------------------+
| 1. User Application (Postgres, JVM, Go, Node.js)           |
|    - Buffers data in user space                             |
|    - Invokes system call: write(fd, buf, count)             |
+------------------------------|------------------------------+
                               | POSIX Syscall Boundary
+------------------------------v------------------------------+
| 2. Virtual Filesystem (VFS) & OS Page Cache                 |
|    - Maps fd to inode and dentry                            |
|    - Copies buffer into kernel Page Cache (DRAM)            |
|    - Marks pages as "Dirty" and returns immediately to user |
+------------------------------|------------------------------+
                               | Flusher Threads (pdflush / writeback)
+------------------------------v------------------------------+
| 3. Concrete Filesystem (ext4 / XFS / ZFS)                   |
|    - Translates logical file offsets into block numbers      |
|    - Manages inode metadata, extents, and journal (JBD2)     |
+------------------------------|------------------------------+
                               | Bio allocation (struct bio)
+------------------------------v------------------------------+
| 4. Block Layer & I/O Scheduler (mq-deadline / none / kyber) |
|    - Merges contiguous requests                             |
|    - Enqueues into hardware submission queues (NVMe queues) |
+------------------------------|------------------------------+
                               | PCIe / SATA / SAS Bus
+------------------------------v------------------------------+
| 5. Storage Controller & Physical Media                      |
|    - Flash Translation Layer (FTL) / Disk microcode         |
|    - DRAM write cache on SSD (flushed via FUA or flush cmds)|
|    - Programmed into physical NAND flash cells              |
+-------------------------------------------------------------+
```

---

## 2. Blocks, Sectors, Pages & The Read-Modify-Write Penalty

Storage layers operate at different fundamental units of allocation:

| Layer | Standard Unit Size | Key Property |
| :--- | :--- | :--- |
| **OS Memory** | **4 KB Page** (`PAGE_SIZE`) | Virtual memory and Page Cache allocation unit. |
| **Filesystem** | **4 KB Block** (e.g., ext4) | Smallest contiguous space allocatable to a file. |
| **NVMe / SSD Page** | **8 KB – 16 KB** | Smallest unit of physical NAND flash **programming/writing**. |
| **SSD Erase Block** | **4 MB – 16 MB** | Smallest unit of physical NAND flash **erasure**. |
| **Legacy Disk Sector**| **512 Bytes** | Traditional HDD LBA sector. |
| **Modern Advanced Format** | **4 KB Sector** (4Kn) | Modern HDD physical sector size. |

### The 4K Alignment Problem
When a partition or database file is misaligned with the underlying 4 KB physical block boundary, every single 4 KB logical write spans across **two** physical sectors.

```
Misaligned Write:
Logical 4KB:     [       Write Request       ]
Physical Sectors: [ Sector N ] [ Sector N+1 ] [ Sector N+2 ]
Result: Two physical sector reads and two physical sector writes!
```

### The Read-Modify-Write (RMW) Cycle
Because NAND flash can only be written to pre-erased cells, writing data smaller than a page requires:
1. Reading the entire existing page into the SSD controller DRAM.
2. Modifying the target bytes in RAM.
3. Writing the updated page to a new, pre-erased physical flash location.
4. Marking the old page as invalid (generating garbage collection debt).

---

## 3. Sequential vs. Random I/O

- **Sequential I/O**: Accesses contiguous logical block addresses (LBAs). The OS kernel can activate **read-ahead** heuristics, and disk controllers maximize channel pipelining.
- **Random I/O**: Accesses non-contiguous LBAs. On spinning HDDs, this forces mechanical arm seeks ($5\text{ ms} - 10\text{ ms}$). On SSDs, random writes force unpredictable Flash Translation Layer (FTL) remaps, triggering severe write amplification.

---

## 4. Caching Hierarchy: From Page Cache to Disk Cache

```
[ Application Cache (SRAM/DRAM) ] (e.g., Postgres shared_buffers, Redis)
               │
               ▼ fsync() / flush
[ OS Page Cache (Kernel DRAM)   ] (Dirty pages flushed by flusher threads)
               │
               ▼ DMA Transfer
[ Storage Controller Cache (DRAM)] (Battery-backed or supercapacitor protected)
               │
               ▼ Flash programming
[ Physical Non-Volatile NAND    ]
```

### Direct I/O (`O_DIRECT`) vs. Buffered I/O
- **Buffered I/O (Default)**: Reads and writes pass through the OS Page Cache. Fast for reads (hits DRAM), but risks data loss during power cuts unless followed by `fsync(fd)`.
- **Direct I/O (`O_DIRECT`)**: Bypasses the OS Page Cache entirely. DMA directly transfers data between user-space application memory buffers and the storage controller. Used by high-performance database engines (Oracle, ScyllaDB, RocksDB) that implement their own specialized caching.

---

## 5. Hands-on Lab: I/O Profiling with `iostat`, `vmstat`, `iotop`, and `fio`

### Step 1: Monitor System-Wide Virtual Memory with `vmstat`
```bash
# Sample every 1 second
vmstat -w 1
```
Observe the `bi` (blocks received from block devices) and `bo` (blocks sent to block devices) columns.

### Step 2: Identify Real-Time I/O Offenders with `iotop`
```bash
sudo iotop --only --accumulated
```

### Step 3: Comprehensive Benchmarking with `fio`
Create a benchmark job file `benchmark.fio`:

```ini
[global]
ioengine=libaio
direct=1
runtime=30
time_based=1
filename=/tmp/fio_test_data
size=1G

[random-read-4k]
bs=4k
rw=randread
iodepth=32
numjobs=1

[random-write-4k]
bs=4k
rw=randwrite
iodepth=32
numjobs=1
```

Run the benchmark:
```bash
fio benchmark.fio
```

Inspect the `IOPS`, `clat` (completion latency percentiles $p50$, $p99$, $p99.9$), and `bw` (bandwidth).
