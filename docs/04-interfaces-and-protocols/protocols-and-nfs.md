---
id: protocols-and-nfs
title: "04. Storage Interfaces & Protocols: POSIX, Block, File, Object & NFS Architecture"
sidebar_label: 04. Protocols & Interfaces
sidebar_position: 4
---

# 04. Storage Interfaces & Protocols: POSIX, Block, File, Object & NFS Architecture

> **Prerequisites**: Module 01 (Storage Metrics), Module 02 (Linux I/O Path).  
> **Target Audience**: Systems Engineers, Storage Architects, Network Engineers, and Distributed Systems Developers.

Storage protocols define the contract, semantics, and wire formats through which application compute nodes communicate with persistent storage systems. Choosing between Block, File, or Object storage—or selecting protocols like NVMe-oF, iSCSI, NFSv4, or S3—fundamentally dictates concurrency, latency, consistency, and network topology.

---

## 1. The Storage Taxonomy: Block vs. File vs. Object

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             Storage Taxonomy Triad                               │
├─────────────────────────┬──────────────────────────┬─────────────────────────────┤
│ 1. Block Storage        │ 2. File Storage          │ 3. Object Storage           │
├─────────────────────────┼──────────────────────────┼─────────────────────────────┤
│ Fixed-size raw sectors  │ Hierarchical tree        │ Flat namespace              │
│ (LBA 0, 1, 2... N)      │ (directories / files)    │ (Bucket + Key + Payload)    │
│ Protocol: NVMe, iSCSI   │ Protocol: NFS, SMB, CephFS│ Protocol: HTTP/REST (S3)    │
│ Sub-millisecond latency │ Low millisecond latency  │ Tens of milliseconds        │
│ Exclusive single-host   │ Concurrent multi-host    │ Massively distributed       │
│ (without clustered FS)  │ (POSIX semantics)        │ (Immutable / HTTP scale)    │
└─────────────────────────┴──────────────────────────┴─────────────────────────────┘
```

### Detailed Structural Comparison
1. **Block Storage (SAN / Local)**:
   - Exposes an unformatted array of contiguous blocks addressable by Logical Block Address (LBA).
   - No concept of filenames, directories, or permissions at the storage layer; the host operating system must format a concrete filesystem (Ext4, XFS) on top of the block device.
   - Ideal for low-latency relational databases (PostgreSQL, Oracle) and virtual machine disk images.
2. **File Storage (NAS / Network Attached Storage)**:
   - Manages data as a hierarchical tree of files and folders with rich POSIX metadata (ownership, mode bits, timestamps, extended attributes).
   - The storage server hosts the filesystem; clients access files over the network via remote procedure calls (RPC).
   - Supports concurrent shared access from hundreds of compute nodes (e.g., shared machine learning training datasets).
3. **Object Storage (Cloud / S3)**:
   - Stores data as immutable blobs in a flat namespace identified by unique strings (Bucket + Object Key).
   - Bundles arbitrary user-defined metadata with the payload.
   - Accessed exclusively via stateless HTTP/HTTPS verbs (`GET`, `PUT`, `DELETE`, `HEAD`). Cannot modify a 1-byte offset in place; modifying requires uploading the entire object.

---

## 2. Essential Network Storage Protocols Glossary

### 1. POSIX Storage Semantics
The Portable Operating System Interface standard defining file access rules:
- **Immediate Consistency**: A `read()` following a completed `write()` must return the newly written data immediately.
- **Atomic Renames**: `rename(old, new)` must be atomic across the namespace.
- **Append Guarantees**: Opening with `O_APPEND` guarantees that concurrent writes serialize atomically at the end of the file.
- **File Locking**: Supports advisory and mandatory record locking via `fcntl()` (`F_SETLK`, `F_SETLKW`).

### 2. SCSI & iSCSI (Internet Small Computer System Interface)
- **SCSI Architecture**: Standard protocol model defining block commands (`READ(10)`, `WRITE(10)`, `INQUIRY`).
- **iSCSI**: Encapsulates raw SCSI command descriptor blocks (CDBs) inside TCP/IP packets over standard Ethernet (port 3260).
- **Target vs. Initiator**:
  - **Initiator**: The client compute node issuing SCSI read/write commands.
  - **Target**: The storage array or server exposing logical block storage (LUNs).
- **IQN (iSCSI Qualified Name)**: Global unique identifier for nodes (e.g., `iqn.2026-09.com.s10rage:storage.target01`).

### 3. NVMe-oF (NVMe over Fabrics)
Extends the low-latency multi-queue NVMe protocol over network fabrics (RDMA, RoCEv2, InfiniBand, or TCP):
- Eliminates the legacy SCSI translation layer; commands transfer directly between host submission queues and remote device queues.
- **Latency Advantage**: Adds as little as **$5 - 15\text{ microseconds}$** of network overhead over raw local PCIe access when running over RDMA.

### 4. NFS (Network File System) Protocol Evolution
- **NFSv3 (RFC 1813)**: Stateless UDP/TCP protocol. Relies on auxiliary daemons (`portmap`, `mountd`, `lockd`, `statd`). Lacks strong security; client caching suffers from "close-to-open" consistency anomalies.
- **NFSv4.0 (RFC 7530)**: Stateful protocol running strictly over TCP port 2049. Consolidates locking and mounting into a single protocol. Implements compound RPC requests (grouping `LOOKUP`, `OPEN`, `READ` into a single round-trip).
- **NFSv4.1 / pNFS (RFC 5661)**: Introduces **Parallel NFS (pNFS)**, separating the metadata path from the data path. Clients query the Metadata Server (MDS) for block/file layout maps and stream data directly to storage nodes in parallel.
- **NFSv4.2 (RFC 7862)**: Adds Server-Side Copy (SSC), sparse files (`SEEK_HOLE`), space reservations (`fallocate`), and application data blocks.

### 5. SMB / CIFS
The native Windows network file sharing protocol (now standardized as SMB 2.x and SMB 3.1.1). Features directory leases, multichannel aggregation (combining multiple NICs), and transparent failover.

---

## 3. Deep Dive: NFSv4 Architecture & Consistency Models

```
                                Client Compute Node
┌─────────────────────────────────────────────────────────────────────────────────┐
│ User Application  ──>  Linux VFS  ──>  NFS Client Driver (nfs.ko)               │
│                                              │                                  │
│                                    Client Page Cache                            │
│                                    (Close-to-Open Sync)                         │
└──────────────────────────────────────────────┬──────────────────────────────────┘
                                               │ TCP Port 2049 (Compound RPCs)
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ NFS Server (nfsd / Ganesha)                                                     │
│   - State Table: active client IDs, stateids, open files, active locks          │
│   - Filehandle Cache: translates 64-byte wire filehandle to local filesystem    │
│   - Export Engine (/etc/exports): security flavors (sys, krb5p), squashing      │
└──────────────────────────────────────────────┬──────────────────────────────────┘
                                               │ Local Block / VFS Layer
                                               ▼
                                      Underlying Ext4 / XFS
```

### The "Close-to-Open" Consistency Model
POSIX requires strict write-to-read consistency. In distributed networks, enforcing this across hundreds of clients would require synchronizing every single byte write across the network, destroying performance.

NFS compromises with **Close-to-Open Consistency**:
1. When Client A opens a file (`open()`), the NFS client invalidates its local Page Cache for that file unless the file's modification timestamp (`mtime`) on the server matches its cached timestamp.
2. While Client A writes to the file, writes are cached in Client A's local Page Cache.
3. When Client A calls `close()`, the NFS client synchronously flushes all dirty pages to the server before `close()` returns.
4. If Client B subsequently calls `open()`, it receives the updated `mtime` and fetches the new data.

> [!WARNING]
> If Client B reads the file *while* Client A still has it open, Client B may observe stale cached data for up to the attribute cache timeout (`acregmax`, default 60 seconds). **NFS is not a distributed transactional database.**

---

## 4. Governing Mathematical Formulations

### 1. Network Storage Latency Equation
Total latency for network storage operations includes network propagation, packet serialization, and remote media access:

$$T_{\text{network\_io}} = 2 \times \left(T_{\text{prop}} + T_{\text{serialization}} + T_{\text{switch}}\right) + T_{\text{remote\_controller}} + T_{\text{remote\_media}}$$

- On a 10 GbE network ($T_{\text{serialization}} = 0.0008\text{ ms}$ for 1 KB):
  - Local NVMe: $15\text{ \mu s}$
  - NVMe-oF (RoCEv2): $25\text{ \mu s}$ ($15\text{ \mu s} + 10\text{ \mu s}$ network)
  - iSCSI over TCP: $150 - 300\text{ \mu s}$
  - NFSv4 write with fsync: $1,000 - 3,000\text{ \mu s}$ ($1 - 3\text{ ms}$)

### 2. TCP Bandwidth-Delay Product (BDP) in Storage
To saturate a high-speed network link with storage traffic, the TCP receive window must equal or exceed the BDP:

$$\text{BDP (Bytes)} = \text{Bandwidth (Bytes/sec)} \times \text{RTT (Seconds)}$$

- For a $25\text{ Gbps}$ link across datacenters with $5\text{ ms}$ round-trip time:
  $$\text{BDP} = \left(\frac{25 \times 10^9}{8}\right) \times 0.005 = 3,125,000,000 \times 0.005 \approx 15.62\text{ MB}$$
- If TCP socket buffers are capped at Linux defaults ($4\text{ MB}$), throughput will bottleneck at $\approx 6.4\text{ Gbps}$, leaving 75% of the link unutilized.

---

## 5. Hands-on Linux Lab: Configuring & Profiling Network Storage

### Step 1: Exporting & Mounting NFSv4 with Enterprise Mount Options
On the Storage Server:
```bash
# Install NFS kernel server
sudo apt-get install -y nfs-kernel-server || sudo yum install -y nfs-utils

# Configure export in /etc/exports
# sync: enforce synchronous persistence before replying to RPCs
# no_subtree_check: improves throughput and reliability
sudo bash -c 'echo "/data/shared 10.0.0.0/24(rw,sync,no_root_squash,no_subtree_check)" >> /etc/exports'
sudo exportfs -rav
```

On the Client Node:
```bash
# Mount with production high-performance options
sudo mount -t nfs4 -o proto=tcp,port=2049,nconnect=8,rsize=1048576,wsize=1048576,hard,timeo=600 10.0.0.1:/data/shared /mnt/nfs
```
- `nconnect=8`: Multiplexes multiple parallel TCP connections to the same server, bypassing single-core network queue bottlenecks.
- `rsize=1048576,wsize=1048576`: Sets 1 MB RPC transfer chunk sizes.
- `hard`: Prevents silent I/O errors on network disconnect; application blocks until network recovers.

### Step 2: Real-Time NFS Telemetry with `nfsiostat`
```bash
# Inspect operation counts, RTT, and RPC backlog
nfsiostat 1
```
Output:
```
10.0.0.1:/data/shared mounted on /mnt/nfs:
   ops/s       rpc bklog
  1420.00           0.00
read:             ops/s            kB/s           kB/op         retrans    avg RTT (ms)    avg exe (ms)
                 850.00       870400.00         1024.00        0 (0.0%)            1.12            1.24
write:            ops/s            kB/s           kB/op         retrans    avg RTT (ms)    avg exe (ms)
                 570.00       583680.00         1024.00        0 (0.0%)            1.85            2.10
```

---

## 6. Real-World Production Failure Scenarios

### Failure Scenario: The "Soft" NFS Mount Application Crash
#### Incident
A financial payments microservice mounted an NFS volume with `soft` mount options (`mount -o soft,timeo=30`). During a brief 5-second network switch failover, the NFS server failed to acknowledge writes.
The NFS client driver reached its retry threshold and returned `EIO` (Input/output error) to the application. The application did not handle the error, assumed database transactions were committed, and corrupted financial audit balances.

#### Prevention
**Never use `soft` mounts for write workloads.** Always use `hard,intr`:
- With `hard`, the client will wait indefinitely for the NFS server to return, preserving transactional durability.
- If a server crashes permanently, administrators can cleanly unmount using `umount -f` or terminate blocked processes.

---

## 7. Practical Engineering Exercises (With Solutions)

### Exercise: `nconnect` Bandwidth Scaling
**Problem**: An NFS client connected over a 100 GbE interface streams large 1 MB blocks from an all-flash NVMe NFS array. Benchmarking with standard single-connection NFS yields only **$1.8\text{ GB/s}$** ($14.4\text{ Gbps}$), leaving 85% of the 100 GbE link idle. CPU monitoring reveals a single core running `kworker` pinned at 100% utilization.
How does the `nconnect=8` mount parameter resolve this bottleneck?

#### Solution:
A single TCP connection in the Linux kernel is pinned to a single softirq/receive packet processing queue, saturating one CPU core at $\approx 1.8 - 2.2\text{ GB/s}$.
By specifying `mount -o nconnect=8`:
1. The Linux NFS client establishes **8 independent TCP connections** to the same server IP.
2. Kernel network queues and checksumming are distributed across 8 separate CPU cores using Receive Side Scaling (RSS).
3. Throughput scales linearly:
   $$\text{Achievable Throughput} = \min(8 \times 1.8\text{ GB/s}, 100\text{ Gbps}) \approx 11.5\text{ GB/s}$$
- **Conclusion**: `nconnect` eliminates single-stream TCP serialization bottlenecks on high-speed datacenter networks.

---

## 8. Summary Checklist & Key Takeaways

1. **Match Workload to Interface**: Use Block for ultra-low latency databases; File for POSIX shared multi-node access; Object for internet-scale immutable blobs.
2. **Close-to-Open Semantics**: NFS guarantees consistency upon file close, not instantaneous inter-client sync during writing.
3. **Always Mount `hard` for Data Integrity**: `soft` mounts cause silent data corruption during transient network hiccups.
4. **Leverage `nconnect`**: Always enable `nconnect=4` or `nconnect=8` on modern 10G/40G/100G networks to break single-core TCP limits.
