---
id: ext4-xfs-btrfs-zfs
title: 05. Filesystems Deep-Dive
sidebar_label: 05. Filesystems
sidebar_position: 5
---

# 05. Filesystems Deep-Dive

A filesystem is the abstraction layer that transforms raw, unorganized linear block arrays into hierarchical structures of files, directories, metadata, and access controls.

---

## 1. Core Anatomy: Inodes, Dentries & Extents

```
Directory Entry (dentry)
  ["server.log"] ───► Inode #104928
                       ├── File Mode (Permissions, S_IFREG)
                       ├── Owner UID / GID (1000 / 1000)
                       ├── Size (42,891,200 bytes)
                       ├── Timestamps (atime, mtime, ctime)
                       ├── Link Count (1)
                       └── Extent Tree Pointer
                            ├── Extent 0: Block Offset 0   ──► Physical Blocks [100000 - 100031]
                            └── Extent 1: Block Offset 32  ──► Physical Blocks [250000 - 250063]
```

- **Inode (Index Node)**: Holds all file metadata except the file name and actual data contents.
- **Directory**: A special file whose data content consists of mappings between human-readable names and inode numbers.
- **Extents**: Contiguous ranges of physical blocks assigned to a file, replacing older, fragmented pointer lists (indirect block pointers).

---

## 2. Filesystem Comparison: ext4 vs. XFS vs. Btrfs vs. ZFS

| Feature | **ext4** | **XFS** | **Btrfs** | **OpenZFS** |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Architecture** | Block group journaling | Allocation Groups + B+ Trees | Copy-on-Write (CoW) B-Trees | Copy-on-Write (CoW) Merkle Trees |
| **Max File Size** | 16 TiB | 8 EiB | 16 EiB | 16 EiB |
| **Max Filesystem Size** | 1 EiB | 8 EiB | 16 EiB | 256 ZiB |
| **Native RAID / Volume Manager**| No (requires mdadm / LVM) | No (requires mdadm / LVM) | Yes (RAID 0, 1, 10, 5/6*) | Yes (ZFS Storage Pools - zpools) |
| **Snapshots** | No | Reflink copies (XFS v5) | Yes (instant subvolume CoW) | Yes (atomic, immutable CoW) |
| **Data Checksumming (Bit Rot)** | Metadata only | Metadata only | Yes (CRC32c or xxHash64) | Yes (fletcher4, SHA-256) |
| **Dynamic Scrubbing** | Offline `fsck` | Offline `xfs_repair` | Online scrub | Online scrub (`zpool scrub`) |
| **Ideal Workloads** | General Linux, OS roots | High-concurrency OLTP, huge files | Docker/Podman roots, dev workstations | Mission-critical NAS, SAN, enterprise DBs |

---

## 3. Journaling Modes & Crash Consistency

When updating a file, the OS must modify both data blocks and filesystem metadata (inode, allocation bitmaps, directory tree). A crash midway leaves the filesystem corrupted.

### The JBD2 (Journaling Block Device) Protocol
Before writing blocks to their final disk locations, changes are appended sequentially to an on-disk circular log (the journal).

1. **`data=journal` (Highest Safety, Lowest Performance)**:
   Both metadata and payload data are written to the journal before being committed to the main filesystem blocks. Writes are committed twice (100% write amplification).
2. **`data=ordered` (Linux Default)**:
   File payload data blocks are forced to disk *before* associated metadata is committed to the journal. Guarantees that on crash recovery, files will not point to unwritten garbage blocks.
3. **`data=writeback` (Highest Performance)**:
   Metadata is journaled, but file data can be flushed whenever the kernel pleases. Fast, but crashes can expose stale, unwritten disk data.

---

## 4. Hands-on Lab: Creating, Mounting & Benchmarking Filesystems

### Step 1: Create Virtual Block Devices (Loop Devices)
```bash
# Create two 2GB sparse image files
truncate -s 2G /tmp/disk_ext4.img
truncate -s 2G /tmp/disk_xfs.img

# Attach to loop devices
sudo losetup -fP /tmp/disk_ext4.img
sudo losetup -fP /tmp/disk_xfs.img

# Identify assigned loop devices (e.g. /dev/loop0, /dev/loop1)
losetup -a
```

### Step 2: Format Filesystems
```bash
# Format ext4 with 4KB block size and reserved blocks set to 1%
sudo mkfs.ext4 -b 4096 -m 1 /dev/loop0

# Format XFS with reflink support enabled
sudo mkfs.xfs -m reflink=1 -f /dev/loop1
```

### Step 3: Mount with Production Tuning Options
```bash
sudo mkdir -p /mnt/test_ext4 /mnt/test_xfs

# Mount ext4 with noatime and ordered journaling
sudo mount -o noatime,data=ordered,barrier=1 /dev/loop0 /mnt/test_ext4

# Mount XFS with logbufs and noatime
sudo mount -o noatime,logbufs=8 /dev/loop1 /mnt/test_xfs
```

> [!TIP]
> **The `noatime` optimization**: By default, Linux updates an inode's `atime` (access time) on every single read. On read-heavy workloads, this turns pure reads into synchronous disk writes! Mounting with `noatime` eliminates this overhead entirely.

### Step 4: Benchmark Filesystem Creation and I/O Throughput
```bash
# Benchmark file creation rate (small files)
sudo fio --name=fs-small-files --directory=/mnt/test_xfs --rw=write --bs=4k --size=100m --numjobs=4 --runtime=15 --time_based --group_reporting

# Clean up
sudo umount /mnt/test_ext4 /mnt/test_xfs
sudo losetup -d /dev/loop0 /dev/loop1
rm -f /tmp/disk_ext4.img /tmp/disk_xfs.img
```
