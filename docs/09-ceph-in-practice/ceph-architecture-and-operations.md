---
id: ceph-architecture-and-operations
title: "09. Ceph in Practice: RADOS, CRUSH Algorithm, BlueStore & Cluster Operations"
sidebar_label: 09. Ceph in Practice
sidebar_position: 9
---

# 09. Ceph in Practice: RADOS, CRUSH Algorithm, BlueStore & Cluster Operations

> **Prerequisites**: Module 01 (Storage Metrics), Module 06 (Block Storage & LVM), Module 08 (Distributed Storage & Quorums).  
> **Target Audience**: Infrastructure Architects, Kubernetes Platform Engineers, Storage Administrators, and Cloud SREs.

Ceph is the open-source industry standard for software-defined distributed storage. It unifies block devices (**RBD**), POSIX file systems (**CephFS**), and S3-compatible object storage (**RGW**) on top of a single autonomous, self-healing, peer-to-peer storage engine called **RADOS** (Reliable Autonomic Distributed Object Store).

Unlike traditional distributed storage systems that bottleneck on central metadata lookup tables, Ceph computes the physical location of any object deterministically using the **CRUSH algorithm**.

---

## 1. Ceph Unified Architecture & The Daemon Ecosystem

```
+-----------------------------------------------------------------------------------+
| Ceph Access Interfaces (Client Application Layer)                                 |
|  [ RBD: RADOS Block Device ]   [ CephFS: POSIX File System ]   [ RGW: S3 / Swift ]|
|  (Kubernetes CSI / QEMU-KVM)   (Shared Multi-Client Mount)     (HTTP REST Object) |
+-----------------------------------------|-----------------------------------------+
                                          ▼
+-----------------------------------------------------------------------------------+
| librados: Native C/C++, Python, Go, Java, Rust Object API Client Library          |
+-----------------------------------------|-----------------------------------------+
                                          ▼
+-----------------------------------------------------------------------------------+
| RADOS (Reliable Autonomic Distributed Object Store) Layer                         |
| Peer-to-peer, self-healing, CRUSH-routed storage cluster                          |
+-----------------------------------------------------------------------------------+
     ▲                             ▲                             ▲
     │                             │                             │
┌────┴────────────────────────┐ ┌──┴────────────────────────┐ ┌──┴──────────────────┐
│ Ceph MON (Monitor)          │ │ Ceph MGR (Manager)        │ │ Ceph OSD (Object    │
│ - Cluster state authority   │ │ - Telemetry & metrics     │ │   Storage Daemon)   │
│ - Paxos quorum (3 or 5)     │ │ - Prometheus / Grafana    │ │ - Manages 1 drive   │
│ - Maintains master maps:    │ │ - Orchestrates rebalance  │ │ - BlueStore Engine  │
│   monmap, osdmap, pgmap     │ │ - Ceph Dashboard Web UI   │ │ - Peering & Healing │
└─────────────────────────────┘ └───────────────────────────┘ └─────────────────────┘
```

### The Ceph Daemon Roles
1. **OSD (Object Storage Daemon)**: Manages one physical storage drive (NVMe SSD or HDD). Hundreds to thousands of OSDs run across cluster nodes. OSDs peer directly with one another to replicate data, handle heartbeats, perform scrubbing, and rebalance data without central coordinator bottlenecks.
2. **MON (Monitor)**: Maintains the definitive master maps of cluster state (`monmap`, `osdmap`, `pgmap`, `crushmap`) using **Paxos consensus**. Mon daemons require an odd quorum (typically 3 or 5 nodes) and reside strictly on the control plane.
3. **MGR (Manager)**: Runs alongside MONs to offload read-heavy monitoring, telemetry collection, Prometheus metric exporters, and cluster orchestration modules.
4. **MDS (Metadata Server)**: Required *only* for CephFS. Manages the POSIX filesystem hierarchy, directory dentries, and inode locks in DRAM, storing the underlying file extents as raw RADOS objects.

---

## 2. The CRUSH Algorithm: Eliminating Central Metadata Lookups

At petabyte-to-exabyte scales, centralized metadata lookup servers (such as HDFS NameNodes or traditional SAN metadata controllers) suffer catastrophic scalability limits, memory exhaustion, and single points of failure.

Ceph eliminates metadata lookup tables entirely through **CRUSH** (Controlled Replication Under Scalable Hashing):

```
Client has Object: "production-backup-2026.iso" in Pool "backup-pool"
                          │
                          ▼
Step 1: Hash Object Name into 32-bit Integer via Jenkins Hash
        Hash("production-backup-2026.iso") = 0x8F3A41D2
                          │
                          ▼
Step 2: Map Hash to Placement Group (PG)
        PG ID = 0x8F3A41D2 % 128 (Total PGs in Pool) = "backup-pool.82"
                          │
                          ▼
Step 3: Evaluate CRUSH Algorithm over Cluster Map
        CRUSH(ClusterMap, Rule: "replicate across 3 racks", PG: "backup-pool.82")
                          │
                          ▼
Result: Deterministic Target OSD Triad: [ OSD 14 (Rack A), OSD 42 (Rack B), OSD 89 (Rack C) ]
        Client connects directly to OSD 14 to write! Zero metadata server queries!
```

### CRUSH Failure Domain Isolation
CRUSH organizes the cluster map into an administrative tree of hierarchical buckets:
`Root` $\to$ `Datacenter` $\to$ `Room` $\to$ `Rack` $\to$ `Host` $\to$ `OSD`.
- When configured with `step chooseleaf firstn 3 type rack`, CRUSH guarantees that the 3 replicas of an object are assigned to 3 completely independent physical racks with distinct power distribution units (PDUs) and network switches.

---

## 3. Placement Groups (PGs) & The BlueStore Storage Engine

### What is a Placement Group (PG)?
A Placement Group is a logical aggregation layer between millions of individual objects and hundreds of physical OSDs:
- Tracking replication states per individual object would consume gigabytes of cluster map memory.
- Ceph maps millions of objects into a fixed number of **Placement Groups (PGs)** (typically thousands).
- PGs are mapped deterministically to sets of OSDs via CRUSH.

### BlueStore: The Modern OSD Engine
In early Ceph releases, OSDs used **FileStore**, which stored objects as individual files on top of a standard Linux filesystem (XFS). This caused severe double-journaling write amplification and slow directory traversals.

Modern Ceph uses **BlueStore**, which writes directly to raw block devices:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Ceph OSD Daemon (BlueStore Architecture)                                    │
├───────────────────────────────────────┬─────────────────────────────────────┤
│ RocksDB Metadata Key-Value Store      │ BlueFS (Minimal Micro-Filesystem)   │
│ - Stores object metadata, extent maps,│ - Bridges raw block storage for     │
│   omap key-values, and checksums      │   RocksDB SST files and WAL logs    │
├───────────────────────────────────────┴─────────────────────────────────────┤
│ BlueStore Block Allocator (StupidAllocator / Bitmap Allocator)             │
│ - Allocates physical blocks directly on raw disk (bypassing Linux VFS)      │
├─────────────────────────────────────────────────────────────────────────────┤
│ Physical Storage Media                                                      │
│ ┌──────────────────────────────┐ ┌────────────────────────────────────────┐ │
│ │ DB/WAL NVMe SSD Partition    │ │ Main Data HDD / SSD Partition          │ │
│ │ (RocksDB WAL + BlueFS blocks)│ │ (Raw user data payload extents)        │ │
│ └──────────────────────────────┘ └────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Key BlueStore Capabilities:
1. **Zero Double-Journaling**: Data is written directly to raw blocks. Small writes are merged into RocksDB WAL, while large writes are committed directly to disk using Copy-on-Write semantics.
2. **Cryptographic Checksumming**: Every block is verified on read using crc32c or xxhash to detect and heal silent bit-rot.
3. **Inline Compression**: Automatically compresses cold data using Snappy, LZ4, or Zstandard algorithms.

---

## 4. Governing Mathematical Formulations

### 1. Optimal Placement Group (PG) Calculation Formula
Undersized PG counts cause severe data imbalance across OSDs; oversized PG counts consume excessive OSD CPU and DRAM memory:

$$\text{Target PGs} = \frac{\text{Total OSDs} \times \text{Target PGs per OSD (100)}}{\text{Replica Count}}$$

*Round the result up to the nearest power of 2* to ensure uniform hashing distribution.

- Example: A 48-OSD cluster configured with 3x replication:
  $$\text{Target PGs} = \frac{48 \times 100}{3} = \frac{4800}{3} = 1,600 \implies \text{Round to nearest } 2^N = 2,048\text{ PGs}$$

### 2. Ceph Usable Capacity & Safety Thresholds
Ceph enforces strict cluster-wide storage safety thresholds:
- **`mon_osd_nearfull_ratio`** (Default $0.85$ / 85%): Cluster raises warnings.
- **`mon_osd_backfillfull_ratio`** (Default $0.90$ / 90%): Cluster halts automatic rebalancing to prevent overflowing surviving disks.
- **`mon_osd_full_ratio`** (Default $0.95$ / 95%): **Cluster immediately freezes all client I/O operations.**

$$\text{Safe Usable Capacity} = \text{Raw Capacity} \times \frac{1}{\text{Replica Count}} \times 0.85$$

---

## 5. Hands-on Linux Lab: Ceph Operations & CLI Commands

### Step 1: Inspect Cluster Health & Tree Topology
```bash
# Display high-level cluster health, active monitors, PGs, and I/O rates
sudo ceph status

# Display hierarchical CRUSH tree of hosts, racks, and OSD states
sudo ceph osd tree

# Check pool capacity usage and raw vs usable statistics
sudo ceph df
```

### Step 2: Create a High-Performance RBD Block Pool
```bash
# 1. Create a pool named 'k8s_volumes' with 128 PGs
sudo ceph osd pool create k8s_volumes 128 128 replicated

# 2. Enable RBD application tagging
sudo ceph osd pool application enable k8s_volumes rbd

# 3. Create a 50 GB thinly provisioned block volume
rbd create --size 50G --pool k8s_volumes vol_mysql_data

# 4. Map the volume to the host kernel block layer
sudo rbd map k8s_volumes/vol_mysql_data
# Output: /dev/rbd0

# 5. Format and mount
sudo mkfs.xfs /dev/rbd0
sudo mount /dev/rbd0 /mnt/mysql
```

### Step 3: Simulate OSD Failure & Observe Self-Healing
```bash
# Mark OSD 3 as 'out' (simulating hardware drive failure)
sudo ceph osd out osd.3

# Watch Ceph PGs automatically transition through:
# active+undersized+degraded -> active+recovering -> active+clean
watch -n 1 "ceph pg stat && ceph status"
```

---

## 6. Real-World Production Failure Scenarios

### Failure Scenario 1: The OSD Nearfull Death Cascade
#### Incident
A 200-node Ceph cluster was running at 82% capacity. A disk failure triggered automatic backfilling:
- Surviving disks absorbed data from the failed drive.
- Two adjacent disks crossed the `nearfull` (85%) threshold and hit `full` (95%).
- Ceph immediately marked those full OSDs as down/out.
- The data from those newly disabled OSDs was redistributed onto the remaining drives, pushing more disks past 95%.
- Within 20 minutes, a **cascading freeze locked the entire cluster**, halting thousands of enterprise VMs.

#### Remediation & Recovery
1. Never operate Ceph above 75% capacity without expanding storage nodes.
2. If trapped in a full-ratio lockup, temporarily raise the safety thresholds to unblock I/O while purging old snapshots:
   ```bash
   sudo ceph osd set-full-ratio 0.97
   sudo ceph osd set-backfillfull-ratio 0.94
   ```
3. Purge orphaned RBD snapshots and unused pools.

---

### Failure Scenario 2: Slow/Flapping OSD Causing Global Tail Latency Spikes
#### Incident
Kubernetes application database queries experienced random 15-second latency spikes.
Monitoring showed overall cluster IOPS and CPU were low, but `ceph -s` reported `slow requests are blocked > 32 sec`.

#### Root Cause
A single mechanical HDD was experiencing silent SATA read retries and physical head degradation:
- The disk didn't fail outright; it responded to heartbeats, but writes took $25\text{ seconds}$.
- Because CRUSH stripes PGs evenly across OSDs, every client writing to a placement group that included this slow OSD was blocked.

#### Solution: Automated Flapping Isolation
```bash
# Pinpoint the slow OSD using Ceph daemon perf counters
sudo ceph osd perf | sort -k 2 -n -r | head -n 5

# Immediately take the slow drive out of service
sudo ceph osd out <OSD_ID>
sudo systemctl stop ceph-osd@<OSD_ID>
```

---

## 7. Practical Engineering Exercises (With Solutions)

### Exercise: Ceph Capacity Planning with Nearfull Reserves
**Problem**: An enterprise requires **$150\text{ TB}$ of usable storage** for virtual machine disks (RBD) using **3x replication**. The cluster uses standard $16\text{ TB}$ enterprise NVMe SSDs.
1. What total raw storage capacity is required?
2. How many physical $16\text{ TB}$ drives must be provisioned to ensure the cluster never crosses the **$80\%$ safe operational threshold**?

#### Solution:
1. Calculate raw storage requirement:
   $$\text{Raw Data Payload} = 150\text{ TB} \times 3\text{ (Replica Factor)} = 450\text{ TB}$$
2. Calculate total provisioned capacity with an 80% ceiling:
   $$\text{Total Required Raw Capacity} = \frac{450\text{ TB}}{0.80} = 562.5\text{ TB}$$
3. Sizing physical drives:
   $$\text{Drive Count} = \frac{562.5\text{ TB}}{16\text{ TB/drive}} = 35.15 \implies 36\text{ Drives}$$
- **Engineering Conclusion**: Delivering 150 TB of resilient usable storage requires at least **36 physical 16 TB SSDs** ($576\text{ TB}$ raw) to ensure high availability and prevent catastrophic nearfull rebalancing cascades during drive failures.

---

## 8. Summary Checklist & Key Takeaways

1. **CRUSH Computes, Doesn't Lookup**: Ceph clients calculate object locations mathematically using the CRUSH algorithm, eliminating centralized metadata server bottlenecks.
2. **BlueStore Bypasses the OS Filesystem**: Writes directly to raw block devices, eliminating double journaling and bit rot via end-to-end checksums.
3. **Sizing PGs Correctly is Crucial**: Aim for ~100 PGs per OSD per pool, rounded up to the nearest power of 2.
4. **Never Exceed 80% Capacity**: Rebalancing after a drive failure will consume additional space and risk cascading nearfull freezes.
5. **Slow OSDs are More Dangerous Than Dead OSDs**: A dead OSD fails fast; a slow flapping OSD stalls client I/O across the entire cluster.
