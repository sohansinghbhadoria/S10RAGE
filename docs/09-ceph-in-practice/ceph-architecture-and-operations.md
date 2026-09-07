---
id: ceph-architecture-and-operations
title: "09. Ceph: Distributed Storage in Practice"
sidebar_label: 09. Ceph in Practice
sidebar_position: 9
---

# 09. Ceph: Distributed Storage in Practice

Ceph is the open-source gold standard for enterprise software-defined storage, unifying block (RBD), file (CephFS), and object (RGW) interfaces over a single self-healing, peer-to-peer storage engine called RADOS.

---

## 1. Ceph Architectural Components

```
+-------------------------------------------------------------+
| Ceph Access Interfaces                                      |
|  [ Ceph Block Device (RBD) ]  [ CephFS ]  [ Ceph RGW (S3) ] |
+-------------------------------------------------------------+
                               ▼
+-------------------------------------------------------------+
| RADOS (Reliable Autonomic Distributed Object Store)         |
|  - Self-healing, self-managing, intelligent storage cluster |
+-------------------------------------------------------------+
    ▲                   ▲                     ▲
    │                   │                     │
[ Ceph MON ]        [ Ceph MGR ]          [ Ceph OSD ]
Cluster Map & Paxos  Telemetry & Metrics  Disk Daemon (BlueStore)
Quorum Authority     Prometheus, Web UI   Read/Write/Peering
```

### Key Daemons
1. **OSD (Object Storage Daemon)**: Manages one physical drive (HDD/NVMe) via the **BlueStore** storage engine. Handles local data storage, replication, heartbeating, recovery, and rebalancing.
2. **MON (Monitor)**: Maintains master maps (monmap, osdmap, pgmap, crushmap) using Paxos consensus. Requires an odd quorum (3 or 5 nodes).
3. **MGR (Manager)**: Collects cluster runtime metrics, manages module integrations (Prometheus exporter, Ceph Dashboard).
4. **MDS (Metadata Server)**: Required *only* for CephFS to manage POSIX directory hierarchies.

---

## 2. The CRUSH Algorithm (Controlled Replication Under Scalable Hashing)

Traditional distributed systems rely on centralized metadata lookup tables to locate data chunks. If the lookup server fails or becomes a bottleneck, the entire cluster halts.

**Ceph eliminates centralized lookup tables entirely.**
Clients compute the exact physical OSD locations of any object deterministically using the CRUSH algorithm:

$$\text{OSD List} = \text{CRUSH}(\text{CRUSH Map}, \text{Pool Rule}, \text{Hash}(\text{Object ID}))$$

```
Object: "user-photo-1049.png"
  │
  ▼ Hash function
Hash: 0x8F32A09B
  │
  ▼ Modulo Placement Group (PG) count
Placement Group (PG): "pool_1.4b"
  │
  ▼ CRUSH Rule (CRUSH Map with failure domain = "host")
Selected OSDs: [ OSD 4 (Primary), OSD 12 (Replica 1), OSD 29 (Replica 2) ]
```

---

## 3. Storage Pools: Replicated vs. Erasure-Coded

- **Replicated Pools**: Stores $N$ identical copies across independent failure domains (e.g., separate server chassis or racks). Ideal for RBD VM disks requiring low latency and random write capability.
- **Erasure-Coded (EC) Pools**: Encodes data using $k+m$ chunks (e.g., $k=4, m=2$). Offers maximum storage efficiency (33% parity overhead vs 200% in 3x replication). Primarily used for RGW object storage pools.

---

## 4. Ceph Failure, Peering & Recovery Lifecycle

When an OSD disk fails:

```
[ Normal Operation ]
  OSD 4: UP & IN
      │
      ▼ Disk dies / Network drops
[ Failure Detection ]
  Neighbor OSDs miss heartbeats for 20 seconds.
  MON marks OSD 4 as: DOWN
      │
      ▼ Grace period expires (default 10 mins: mon_osd_down_out_interval)
[ Cluster Eviction ]
  MON marks OSD 4 as: OUT
      │
      ▼ Rebalancing & Backfill
[ RADOS Healing ]
  Remaining OSDs recalculate CRUSH maps.
  Degraded PGs identify target spare OSDs and stream missing replicas.
  Cluster returns to HEALTH_OK.
```

---

## 5. Hands-on Project: Single-Node Ceph Cluster Simulation & Failure Test

Using `microceph` or Linux container tooling, we can stand up a live Ceph cluster to observe cluster state and failure recovery.

### Step 1: Check Ceph Cluster Health
```bash
# Display overall health, monitor quorum, OSD tree, and I/O rate
ceph status

# View CRUSH hierarchy and physical tree
ceph osd tree
```

### Step 2: Create a Ceph Block Device (RBD) & Map to Linux Kernel
```bash
# Create a dedicated pool
ceph osd pool create rbd_pool 32 32

# Initialize RBD pool application
rbd pool init rbd_pool

# Create a 10GB virtual disk image
rbd create --size 10240 --pool rbd_pool vm-disk-01

# Map RBD image to local Linux kernel block device (/dev/rbd0)
sudo rbd map rbd_pool/vm-disk-01

# Format and mount like any physical hard drive!
sudo mkfs.xfs /dev/rbd0
sudo mkdir -p /mnt/ceph_rbd
sudo mount /dev/rbd0 /mnt/ceph_rbd
```

### Step 3: Simulate OSD Failure and Observe Degradation
```bash
# Stop an OSD daemon process
sudo systemctl stop ceph-osd@1

# Check cluster state (transitions to HEALTH_WARN with degraded PGs)
ceph health detail

# Observe recovery when restarted
sudo systemctl start ceph-osd@1
watch -n 1 ceph status
```
