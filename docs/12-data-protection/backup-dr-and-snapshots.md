---
id: backup-dr-and-snapshots
title: 12. Data Protection & Disaster Recovery
sidebar_label: 12. Data Protection
sidebar_position: 12
---

# 12. Data Protection & Disaster Recovery

Data protection ensures that operational state survives human error, ransomware, bit rot, software bugs, and catastrophic datacenter loss.

---

## 1. Backup vs. Replication: The Critical Distinction

> **The Golden Rule**: Replication is NOT a backup!

- **Replication**: Protects against hardware node failures by synchronously or asynchronously mirroring state.  
  *The Catch*: If a rogue process executes `DROP DATABASE production;` or ransomware encrypts all files, replication faithfully replicates the destruction to all mirror nodes within milliseconds!
- **Backup**: An isolated, point-in-time, versioned, immutable snapshot of data stored in an independent failure and security domain.

---

## 2. Backup Topologies: Full, Incremental, Differential

```
Sunday         Monday        Tuesday       Wednesday
[ FULL ]       [ INC 1 ]     [ INC 2 ]     [ INC 3 ]
(All 10 TB)    (Delta Mon)   (Delta Tue)   (Delta Wed)
               └── 200 GB    └── 180 GB    └── 250 GB
```

| Backup Type | Description | Backup Time & Storage | Recovery Time (RTO) |
| :--- | :--- | :--- | :--- |
| **Full Backup** | Captures 100% of the dataset. | High (Hours, large storage) | Fastest (Restores single archive) |
| **Incremental** | Captures changes since *last* backup (Full or Inc). | Lowest (Only daily deltas) | Slowest (Must replay Full + Inc 1 + Inc 2 + Inc 3) |
| **Differential**| Captures changes since *last Full* backup. | Moderate (Grows each day) | Fast (Restores Full + single latest Differential) |

---

## 3. Storage Snapshots: Copy-on-Write (CoW) vs. Redirect-on-Write (RoW)

- **Copy-on-Write (CoW)**:
  When a write arrives for an existing block, the original block is read and written to the snapshot reservation area *before* the new block overwrites the original location.  
  *Penalty*: 1 read + 2 writes for every first modification.
- **Redirect-on-Write (RoW - ZFS, Btrfs, Modern SAN)**:
  When a write arrives, the new data is written to a completely new unallocated block; the active filesystem metadata pointer is updated to point to the new block, while the snapshot pointer retains the old block.  
  *Penalty*: Zero write penalty!

---

## 4. RPO, RTO & The 3-2-1 Backup Rule

### RPO (Recovery Point Objective)
The maximum acceptable age of files that must be recovered from backup storage for normal operations to resume:
$$\text{Data Lost} = T_{\text{Disaster}} - T_{\text{Last Valid Backup}} \le \text{RPO}$$

### RTO (Recovery Time Objective)
The maximum acceptable duration of time that a system can remain offline after a disaster before service is restored:
$$\text{Downtime Duration} = T_{\text{System Fully Online}} - T_{\text{Disaster}} \le \text{RTO}$$

```
                Disaster Occurs!
                       ▼
─────[ Last Backup ]───┼──────[ Restoration Begins ]──────[ Service Restored ]──► Time
           ▲           │                                          ▲
           └───────────┘                                          │
            RPO Window                                            │
           (Lost Data)                                            │
                       └──────────────────────────────────────────┘
                                        RTO Window
                                    (System Downtime)
```

### The 3-2-1 Backup Standard
- **3 Copies**: Maintain at least three copies of important data (1 primary production copy + 2 backup copies).
- **2 Different Media**: Store copies on two different storage media types (e.g., NVMe SAN + LTO Tape or S3 Object Storage).
- **1 Offsite / Immutable**: Keep at least one copy in a geographically isolated location with **Object Lock / WORM** (Write Once, Read Many) protection against ransomware.

---

## 5. Hands-on Project: Automated Production Backup & Point-in-Time Recovery (PITR)

Implement a backup and PITR pipeline for PostgreSQL using `pg_dump` and continuous WAL archiving:

```bash
# 1. Take a consistent, compressed base backup
sudo -u postgres pg_basebackup -D /backup/base_backup -Ft -z -P

# 2. Configure continuous WAL archiving in postgresql.conf
# archive_mode = on
# archive_command = 'aws s3 cp %p s3://enterprise-db-backups/wal/%f'

# 3. Simulate disaster recovery to specific timestamp
# restore_command = 'aws s3 cp s3://enterprise-db-backups/wal/%f %p'
# recovery_target_time = '2026-09-07 12:00:00 UTC'
```
