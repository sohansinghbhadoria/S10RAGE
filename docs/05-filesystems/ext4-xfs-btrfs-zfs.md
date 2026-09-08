---
id: ext4-xfs-btrfs-zfs
title: "05. Filesystems Deep-Dive: Ext4, XFS, Btrfs & OpenZFS Architecture"
sidebar_label: 05. Filesystems
sidebar_position: 5
---

# 05. Filesystems Deep-Dive: Ext4, XFS, Btrfs & OpenZFS Architecture

> **Prerequisites**: Module 01 (Storage Metrics), Module 02 (Linux I/O Path & Page Cache).  
> **Target Audience**: Linux Systems Administrators, Storage Architects, Database Engineers, and SREs.

A filesystem is the software architecture that translates flat, linear physical block address spaces into structured, searchable hierarchies of files, directories, access permissions, and metadata. Whether a filesystem uses write-ahead journaling (Ext4, XFS) or Copy-on-Write (CoW) Merkle trees (Btrfs, OpenZFS) fundamentally dictates write amplification, crash consistency, snapshot capabilities, and multi-threaded scaling.

---

## 1. Core Anatomical Primitives: Inodes, Dentries, Blocks & Extents

Every Unix filesystem relies on five fundamental structural primitives:

```
Directory Entry (dentry)
  ["database.db"] ───► Inode #209412
                        ├── Mode (Permissions: -rw-r-----)
                        ├── Owner UID / GID (1001 / 1001)
                        ├── Size (10,737,418,240 bytes = 10 GiB)
                        ├── Timestamps (atime, mtime, ctime, crtime)
                        ├── Hard Link Count (1)
                        └── Extent Tree Root
                             ├── Extent 0: File Blocks [0 - 65535]      ──► Physical Blocks [100000 - 165535]
                             └── Extent 1: File Blocks [65536 - 131071]  ──► Physical Blocks [800000 - 865535]
```

### 1. The Superblock
The master metadata record describing the entire filesystem instance:
- Total block count, free block count, total inode count, free inode count.
- Block size (typically 4,096 bytes), cluster size, allocation group sizes.
- Filesystem state flags (`clean`, `corrupt`), mount counts, last `fsck` timestamp.
- *Redundancy*: Filesystems write backup copies of the superblock across multiple block groups to enable recovery if the primary superblock at sector 0 is corrupted.

### 2. Inode (Index Node)
The unique physical record representing a specific file or directory on disk.
- **What it Contains**: File ownership (UID/GID), permission mode bits, file size in bytes, timestamps (`atime` access, `mtime` modification, `ctime` status change), extended attributes (xattrs), and pointers to data blocks.
- **What it Does NOT Contain**: An inode does **not** store the file name or file path.

### 3. Dentry (Directory Entry)
A lightweight kernel structure that maps a human-readable string (`"report.pdf"`) to an inode number (`#409218`).
- A directory is simply a special file whose payload consists of a list of dentry tuples: `(filename, inode_number)`.
- **Hard Links**: Two different filenames pointing to the exact same inode number. Deleting one filename merely decrements the inode’s `link_count`; the physical blocks are only freed when `link_count == 0` and all open file descriptors are closed.
- **Soft (Symbolic) Links**: A special file whose data payload contains the text string of another path. If the target file is deleted, the symlink becomes dangling.

### 4. Extents vs. Indirect Block Pointers
- **Legacy Indirect Mapping (Ext2/Ext3)**: Inodes stored 12 direct block pointers, 1 singly-indirect pointer, 1 doubly-indirect pointer, and 1 triply-indirect pointer. A large 50 GB file required millions of individual block pointers, causing massive metadata overhead and random seeking.
- **Extent Trees (Ext4, XFS, Btrfs)**: An extent is a compact descriptor representing a contiguous run of physical blocks:
  $$\text{Extent} = (\text{Logical File Block Offset}, \text{Starting Physical Block}, \text{Length in Blocks})$$
  A single extent descriptor can map up to **128 MB** (32,768 contiguous 4 KB blocks) in Ext4.

---

## 2. Journaling vs. Copy-on-Write (CoW) Paradigms

```
Journaling Filesystem (Ext4, XFS) [In-Place Updates]:
Step 1: Write transaction intent to circular on-disk Journal (JBD2)
Step 2: Commit journal transaction record
Step 3: Overwrite physical data and metadata blocks in-place
Step 4: Mark journal transaction as checkpointed

Copy-on-Write Filesystem (Btrfs, ZFS) [Out-of-Place Updates]:
Step 1: Write new data blocks into completely empty, unallocated space
Step 2: Allocate new parent metadata nodes pointing to the new blocks
Step 3: Traverse Merkle tree upwards, creating new tree path
Step 4: Atomically swing top-level Root Pointer to new tree state
```

### Journaling Modes (Ext4 JBD2)
Ext4 provides three journaling consistency modes configured at mount time (`mount -o data=...`):
1. **`data=journal` (Full Journaling)**:
   - Both file data and filesystem metadata are written to the journal before being committed in-place to disk.
   - *Pros*: Highest crash durability; zero risk of file content corruption.
   - *Cons*: **100% Write Amplification penalty** (every byte is written to physical media twice).
2. **`data=ordered` (Default)**:
   - Only metadata is recorded in the journal, but the kernel guarantees that data blocks are physically flushed to disk *before* the corresponding metadata journal transaction commits.
   - *Pros*: Excellent performance; prevents old stale data from appearing in extended files after a crash.
3. **`data=writeback` (Highest Throughput)**:
   - Only metadata is journaled; data blocks can be written to disk before, during, or after metadata commits.
   - *Risk*: After a crash and journal replay, newly allocated files may contain garbage or previously deleted sensitive data from other files.

### Copy-on-Write (CoW) Mechanics (ZFS & Btrfs)
CoW eliminates in-place overwrites entirely:
- **Never Overwrite Active Data**: When modifying block 42, the filesystem writes the new version to an unused physical block 99.
- **Instant Snapshots**: A snapshot simply freezes the current root pointer. Because unchanged blocks are never overwritten, a snapshot consumes **zero additional bytes** until subsequent modifications occur.
- **The CoW Fragmentation Penalty**: When applied to database files (e.g., PostgreSQL or MySQL tables with random 8 KB/16 KB updates), CoW rapidly scatters contiguous files across physical media, creating extreme block fragmentation and degrading sequential read performance.

---

## 3. Comprehensive Comparison Matrix: Ext4 vs. XFS vs. Btrfs vs. OpenZFS

| Architectural Dimension | **Ext4** | **XFS** | **Btrfs** | **OpenZFS** |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Architecture** | Block group journaling | Allocation Groups + B+ Trees | Copy-on-Write (CoW) B-Trees | Copy-on-Write (CoW) Merkle Trees |
| **Max File Size** | $16\text{ TiB}$ | $8\text{ EiB}$ | $16\text{ EiB}$ | $16\text{ EiB}$ |
| **Max Volume Size** | $1\text{ PiB}$ | $8\text{ EiB}$ | $16\text{ EiB}$ | $256\text{ ZiB}$ |
| **Inode Allocation** | Fixed at format time (`mkfs`) | Dynamic on-demand | Dynamic on-demand | Dynamic on-demand |
| **Data Checksumming** | Metadata only | Metadata only (v5 superblock) | Full (Data + Metadata) | Full (Data + Metadata via Merkle Tree)|
| **Self-Healing / Scrubbing**| No | No | Yes (with RAID1/10 profiles) | Yes (Automatic scrub & repair) |
| **Volume Management** | External (LVM) | External (LVM) | Built-in multi-device pools | Built-in Zpools (vdevs, RAID-Z) |
| **Snapshots & Clones** | No | No (Reflink copy on modern XFS)| Subvolume instant snapshots | Instant snapshots & zero-copy clones |
| **Primary Production Role**| Linux root OS, general compute | High-scale DBs, large files | Workstations, containers, NAS | Enterprise storage arrays, ZFS SAN/NAS|

---

## 4. Deep Dive: OpenZFS Enterprise Storage Architecture

OpenZFS is not merely a filesystem; it is a unified filesystem, volume manager, software RAID engine, and caching framework.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Datasets & Volumes: /tank/pg_data, /tank/vm_disks (Independent quotas/opts) │
├─────────────────────────────────────────────────────────────────────────────┤
│ DMU (Data Management Unit): Object-based transactional persistence          │
├─────────────────────────────────────────────────────────────────────────────┤
│ ARC (Adaptive Replacement Cache): DRAM cache balancing Recency & Frequency │
│   ├─► L2ARC (Fast NVMe Read Cache)                                          │
│   └─► SLOG / ZIL (Separate Intent Log on battery-backed NVMe for fast sync) │
├─────────────────────────────────────────────────────────────────────────────┤
│ SPA (Storage Pool Allocator): Allocates blocks across VDEVs                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ VDEVs (Virtual Devices): Mirror, RAID-Z1 (Parity), RAID-Z2 (Dual Parity)    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1. The Merkle Tree & Self-Healing Data Integrity
Every block in ZFS contains an cryptographic checksum (SHA-256 or Blake3) stored in its **parent block pointer**, forming a hierarchical Merkle Tree:
- When a block is read, ZFS calculates its checksum and compares it against the parent pointer.
- If bit rot or silent controller corruption occurred, the checksum fails.
- If the pool is configured as a Mirror or RAID-Z, ZFS automatically reads the valid block from the redundant disk, repairs the corrupted sector on the bad disk, and returns valid data to the application with **zero error reported**.

### 2. ARC (Adaptive Replacement Cache) vs. Standard LRU
Standard Linux Page Cache uses a Least Recently Used (LRU) algorithm. ZFS implements ARC, which maintains two separate dynamic lists in host DRAM:
- **T1 (MRU - Most Recently Used)**: Tracks blocks accessed recently.
- **T2 (MFU - Most Frequently Used)**: Tracks blocks accessed repeatedly over time.
- ARC dynamically shifts memory allocations between T1 and T2 based on workload patterns, achieving substantially higher cache hit ratios than standard LRU.

### 3. The ZIL (ZFS Intent Log) & SLOG (Separate Intent Log)
When an application executes a synchronous write (`O_SYNC` or `fsync`):
- ZFS cannot immediately write the block into the main transaction group (TXG) because TXGs are assembled and flushed only every $5\text{ seconds}$.
- Instead, ZFS writes the write request record into the **ZIL (ZFS Intent Log)**.
- **SLOG (Separate Intent Log)**: Administrators assign a dedicated, high-speed, battery-backed (PLP) NVMe SSD to hold the ZIL. Synchronous writes complete in **$20\text{ \mu s}$**, and the main pool disks write data sequentially during the next 5-second TXG commit.

---

## 5. Hands-on Linux Lab: Filesystem Management & Profiling

### Step 1: Formatting High-Performance Filesystems
```bash
# 1. Format Ext4 with tuned reserved block count (default reserves 5% for root)
# Set reserved blocks to 1% on large volumes to reclaim dozens of gigabytes
sudo mkfs.ext4 -m 1 -O mmp,sparse_super2 -b 4096 /dev/sdb1

# 2. Format high-performance XFS with 16 Allocation Groups for parallel scaling
sudo mkfs.xfs -f -d agcount=16 -b size=4096 /dev/sdc1
```

### Step 2: Inode Utilization Diagnostics
```bash
# Display disk space utilization
df -h /data

# Display inode capacity utilization (crucial for microservices handling tiny files)
df -i /data
```

### Step 3: Inspecting & Mounting Filesystem Options
```bash
# Mount XFS with performance parameters
sudo mount -o noatime,nodiratime,logbufs=8,logbsize=256k,allocsize=64M /dev/sdc1 /mnt/data
```
- `noatime`: Completely disables writing access timestamps upon file reads, eliminating millions of metadata write cycles.
- `allocsize=64M`: Allocates large contiguous extents for files upon growth, preventing fragmentation.

---

## 6. Real-World Production Failure Scenarios

### Failure Scenario 1: Inode Exhaustion (`ENOSPC`) with 200 GB Free Space
#### Incident
A Node.js session service failed to write new session files, returning `ENOSPC: no space left on device`. Running `df -h` showed only 15% disk space utilized with **$280\text{ GB}$ of free space**.

#### Root Cause
Ext4 allocates a fixed number of inodes when `mkfs.ext4` is executed:
- The default formula allocates roughly one inode per 16 KB of capacity.
- The service created millions of tiny 128-byte JSON session files.
- Running `df -i` revealed:
  ```
  Filesystem      Inodes   IUsed   IFree IUse% Mounted on
  /dev/sdb1      2500000 2500000       0  100% /data
  ```
- The filesystem ran out of inode records while leaving 85% of disk blocks empty.

#### Remediation
1. For workloads with millions of small files on Ext4, specify higher inode ratios during formatting: `mkfs.ext4 -i 4096 /dev/sdb1`.
2. Or use **XFS**, **Btrfs**, or **OpenZFS**, which allocate inodes dynamically on-demand from the general block pool.

---

### Failure Scenario 2: ZFS Database Stalls Caused by CoW Fragmentation
#### Incident
A MySQL InnoDB database running on a ZFS pool experienced severe read degradation after 6 months of operation. Analytical queries that previously took 4 seconds were taking over 90 seconds.

#### Root Cause
MySQL writes in random 16 KB pages. ZFS default dataset record size is 128 KB.
- Every 16 KB write forced ZFS to perform a 128 KB Read-Modify-Write cycle.
- Furthermore, Copy-on-Write scattered adjacent database pages across non-contiguous physical blocks over months of updates.

#### Solution
Configure the ZFS dataset record size to exactly match the database page size:
```bash
# Match ZFS recordsize to MySQL InnoDB page size (16K) or PostgreSQL (8K)
sudo zfs set recordsize=16k tank/mysql_data
sudo zfs set compression=lz4 tank/mysql_data
sudo zfs set atime=off tank/mysql_data
```

---

## 7. Practical Engineering Exercises (With Solutions)

### Exercise: Sizing Inodes for an Image Upload Service
**Problem**: An image hosting service expects to store $40,000,000$ user avatar icons averaging $8\text{ KB}$ each on an Ext4 volume.
1. What minimum raw capacity is required for the payload?
2. If the volume is formatted with default Ext4 settings (`-i 16384`, allocating 1 inode per 16 KB of disk), will the filesystem run out of inodes or disk space first?
3. What format parameters should you specify?

#### Solution:
1. Raw payload capacity:
   $$40,000,000 \times 8\text{ KB} = 320,000,000\text{ KB} \approx 305.18\text{ GB}$$
2. Inode vs. Capacity evaluation:
   - At default `-i 16384`, a 320 GB volume provides:
     $$\text{Total Inodes} = \frac{320\text{ GB}}{16\text{ KB}} \approx 20,000,000\text{ Inodes}$$
   - The application needs 40,000,000 inodes.
   - **Conclusion**: The filesystem will run out of inodes at only **50% disk capacity utilization**, crashing the service!
3. Format command solution:
   Specify an inode ratio of 8 KB or 4 KB:
   ```bash
   sudo mkfs.ext4 -i 4096 -b 4096 /dev/sdb1
   ```
   Alternatively, deploy **XFS**, which dynamically creates inodes as needed.

---

## 8. Summary Checklist & Key Takeaways

1. **Inodes Hold Metadata, Not Names**: Filenames are stored in directory data blocks; inodes store metadata and extent pointers.
2. **Mount with `noatime`**: Eliminate unnecessary metadata write amplification on read-heavy workloads.
3. **Beware Fixed Inode Counts on Ext4**: Always check `df -i` on services creating millions of small files.
4. **Tune CoW Record Sizes for Databases**: When running databases on ZFS or Btrfs, align the filesystem `recordsize` with the database engine page size (8 KB for Postgres, 16 KB for InnoDB).
5. **ZFS Heals Bit Rot**: Only filesystems with Merkle Tree checksumming (ZFS/Btrfs) can detect and automatically repair silent data corruption.
