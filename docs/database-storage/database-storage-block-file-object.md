---
id: database-storage-block-file-object
title: "Database Storage Architecture: MySQL & MongoDB"
sidebar_label: "Databases on Block, File & Object"
sidebar_position: 1
---

# Database Storage Architecture: MySQL & MongoDB

> **Architectural Objective**: Optimize persistent database engine layouts across Block, Network File (NFS), and Object storage tiers to satisfy strict ACID constraints without incurring I/O bottlenecks.

Database performance is governed by how closely the storage engine’s read/write semantics match the underlying media physics and OS kernel I/O subsystems.

---

## 1. Storage Tier Suitability Matrix for Databases

```
+------------------+-----------------------+-----------------------+-----------------------+
| Subsystem        | Block Storage (SAN/NVMe)| Network File (NFSv4) | Object Storage (S3)   |
+------------------+-----------------------+-----------------------+-----------------------+
| Access Protocol  | NVMe / SCSI / PCIe    | NFSv4.1 / pNFS        | REST / HTTPS          |
| Latency Profile  | 10 µs - 200 µs        | 500 µs - 5 ms         | 10 ms - 80 ms         |
| Update Model     | Random in-place (4K)  | POSIX file appends    | Immutable write-once  |
| Database Role    | Primary active data,  | Read-replicas, dev    | Long-term backups,    |
|                  | Redo Log, WAL, TempDB | environments, backups | cold tiering, audits  |
+------------------+-----------------------+-----------------------+-----------------------+
```

---

## 2. MySQL (InnoDB Engine) Storage Architecture

MySQL InnoDB organizes all persistent data into 16 KB pages managed across four critical on-disk components:

```
MySQL InnoDB Storage Topology:
[ In-Memory Buffer Pool ] ──► Dirty 16KB Pages
           │
           ├── 1. Synchronous Sequential Append (O_DIRECT)
           ▼
[ Redo Log (ib_logfile0) ] ──► Guarantees ACID Durability (WAL)
           │
           ├── 2. Sequential Burst Flush
           ▼
[ Doublewrite Buffer (DWB) ] ──► Prevents Partial Page Write Tears
           │
           ├── 3. Asynchronous Checkpointing
           ▼
[ Tablespace Files (*.ibd) ] ──► B+ Tree Clustered Indexes (Primary Data)
```

### 1. Deploying MySQL on Block Storage (Production Tuning)
Configure `/etc/mysql/my.cnf`:
```ini
[mysqld]
# 1. Bypass OS Page Cache entirely to eliminate double buffering
innodb_flush_method = O_DIRECT_NO_FSYNC

# 2. Buffer pool sizing: 70-80% of total host RAM
innodb_buffer_pool_size = 64G
innodb_buffer_pool_instances = 8

# 3. Align I/O threads to hardware NVMe submission queues
innodb_read_io_threads = 16
innodb_write_io_threads = 16
innodb_io_capacity = 20000
innodb_io_capacity_max = 40000

# 4. Redo Log Flush Frequency (ACID Invariant)
# 1 = Full ACID: flush to disk on every commit
innodb_flush_log_at_trx_commit = 1
innodb_redo_log_capacity = 8G
```

### 2. Deploying MySQL on Network File Storage (NFS) Pitfalls
> [!CAUTION]
> Running active MySQL data directories over NFS risks database corruption and severe latency spikes:
> - **Locking Semantics**: If NFS connection drops momentarily, lock recovery can stall queries.
> - **Doublewrite Buffer Overhead**: The network round-trip latency on DWB flushes can degrade write throughput by up to 80%.
> - If NFS *must* be used, mount with: `mount -t nfs -o hard,intr,sync,noatime,rsize=1048576,wsize=1048576`.

### 3. Streaming MySQL Backups Directly to Object Storage
Use **Percona XtraBackup** to take non-blocking, hot physical backups and stream directly to S3 without staging on local disk:
```bash
xtrabackup --backup --stream=xbstream --parallel=8 | \
  gzip -c | \
  aws s3 cp - s3://mysql-enterprise-backups/$(date +%Y-%m-%d)/full_backup.xbstream.gz
```

---

## 3. MongoDB (WiredTiger Engine) Storage Architecture

WiredTiger utilizes multi-threaded B-Trees with Copy-on-Write (CoW) page allocations:

```
MongoDB WiredTiger Storage Layout:
[ WiredTiger Cache ] (DRAM: 50% RAM - 1GB)
         │
         ├── 1. Append-Only WAL Journal (60ms group commit or j:true)
         ▼
[ journal/WiredTigerLog.xxxxxxxxx ] (Sequential Block Writes)
         │
         ├── 2. Checkpoint Interval (Default 60 seconds)
         ▼
[ collection-*.wt / index-*.wt ] (Snappy/Zstd Compressed B-Trees)
```

### 1. Production MongoDB Block Storage Configuration
Configure `/etc/mongod.conf`:
```yaml
storage:
  dbPath: /mnt/nvme_storage/mongo_data
  journal:
    enabled: true
  wiredTiger:
    engineConfig:
      cacheSizeGB: 32
      journalCompressor: snappy
      directoryForIndexes: true
    collectionConfig:
      blockCompressor: zstd
```

### 2. Filesystem Tuning for MongoDB on Linux
Always host WiredTiger on **XFS** with the following kernel parameters:
```bash
# Disable transparent huge pages (THP causes latency spikes in WiredTiger)
echo never | sudo tee /sys/kernel/mm/transparent_hugepage/enabled
echo never | sudo tee /sys/kernel/mm/transparent_hugepage/defrag

# Mount XFS with noatime
mount -o noatime,allocsize=64M /dev/sdb1 /mnt/nvme_storage/mongo_data
```

### 3. Tiering Cold MongoDB Collections to Object Storage
Use MongoDB Data Federation / Online Archive to automatically query warm collections on local NVMe while scanning cold historical collections partitioned in S3 Parquet format.
