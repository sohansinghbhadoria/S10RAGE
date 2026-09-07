---
id: nfs-architecture-and-ganesha
title: "Enterprise File Storage: NFSv3, NFSv4, pNFS & NFS-Ganesha"
sidebar_label: "File Storage: NFSv4, pNFS & Ganesha"
sidebar_position: 3
---

# Enterprise File Storage: NFSv3, NFSv4, pNFS & NFS-Ganesha

> **Architectural Objective**: Provide unified, POSIX-compliant, distributed file trees to thousands of client nodes simultaneously with high throughput and lock consistency.

File storage abstracts blocks into hierarchical directory structures, inodes, and file descriptors over the network using remote procedure call (RPC) dialects.

---

## 1. Evolution of the Network File System (NFS)

```
+----------------+----------------+----------------+----------------+
| NFSv3 (1995)   | NFSv4.0 (2000) | NFSv4.1 / pNFS | NFSv4.2 (2016) |
+----------------+----------------+----------------+----------------+
| Stateless      | Stateful       | Parallel I/O   | Advanced POSIX |
| Multiple Ports | Single Port    | Metadata / Data| Server-Side    |
| (111, 2049,    | (Port 2049 TCP)| Separation     | Copy (SSC)     |
| mountd, nlm)   |                |                | Hole Punching  |
| UDP & TCP      | Strict TCP     | Layout Drivers | Sparse Files   |
| UNIX AUTH_SYS  | Kerberos GSS   | RoCEv2 / RDMA  | SELinux Labels |
+----------------+----------------+----------------+----------------+
```

### 1. NFSv3: The Legacy Stateless Model
- **Auxiliary RPC Daemons**: Requires multiple auxiliary sidecar services coordinated via the `rpcbind` / `portmapper` daemon (Port 111):
  - `mountd`: Handles mount authentication and root handle handshakes.
  - `nlm` (Network Lock Manager): Handles file byte-range locking over network packets.
  - `nsm` (Network Status Monitor): Tracks node reboots to recover locks.
- **Stateless Vulnerability**: The server retains no memory of active client connections. If a client crashes while holding a lock, locks can become permanently orphaned.

### 2. NFSv4.0: Modern Stateful Architecture
- **Single Port (TCP 2049)**: Eliminates firewall traversal headaches by multiplexing all mounting, locking, and data operations across a single TCP connection.
- **Compound RPCs**: Batches multiple operations into a single round-trip network packet (e.g., `LOOKUP + OPEN + READ`).
- **Open / Lock State Owners**: The server maintains state machines tracking every open file and lease time. Clients periodically heartbeat to renew leases.
- **File Delegations**: The server grants read or write delegations to a client, allowing the client to cache reads and writes locally without contacting the server until another client requests conflicting access.

### 3. NFSv4.1 & pNFS (Parallel NFS - RFC 5661)
Traditional NFS routes all control and data traffic through a single monolithic NFS server, creating a massive bandwidth bottleneck.

**pNFS decouples the Metadata Path from the Data Path:**

```
                        +----------------------------+
                        | pNFS Metadata Server (MDS) |
                        +----------------------------+
                                      ▲
           1. Get Layout (RPC)        │
      ┌───────────────────────────────┼──────────────────────────────┐
      │                               │                              │
+-------------------+                 │                              │
| pNFS Client       |                 │                              │
+-------------------+                 │                              │
      │ 2. Direct Parallel Data I/O   │                              │
      ▼                               ▼                              ▼
+-------------------+       +-------------------+          +-------------------+
| Data Server 1 (DS)|       | Data Server 2 (DS)|          | Data Server N (DS)|
+-------------------+       +-------------------+          +-------------------+
```

1. The client queries the **Metadata Server (MDS)** to retrieve a **Layout** (mapping of file byte ranges to physical storage locations).
2. The client then issues direct, high-speed read and write I/O operations directly to multiple **Data Servers (DS)** in parallel!
3. **pNFS Layout Types**:
   - **File Layout**: Data servers are independent NFSv4 servers storing file stripes.
   - **Block Layout**: Data servers are SAN Fibre Channel or iSCSI LUNs.
   - **Object Layout**: Data servers are OSD object nodes.
   - **Flex Files Layout**: Allows concurrent multipath I/O across heterogeneous storage backends.

---

## 2. NFS-Ganesha: High-Performance User-Space NFS Server

Standard Linux kernel NFS (`nfsd`) runs entirely within the kernel address space, making it difficult to interface with distributed user-space filesystems (Ceph, GlusterFS) without expensive context switches.

**NFS-Ganesha** is an open-source, multi-threaded NFS server running entirely in **user space**:

```
+---------------------------------------------------------------+
| Client Applications (Linux, macOS, Windows)                   |
+-------------------------------|-------------------------------+
                                │ NFSv3 / NFSv4.1 / pNFS
+-------------------------------v-------------------------------+
| NFS-Ganesha Daemon (User Space Process)                       |
|  ├── Protocol Engine (RPC dispatcher, compound parsing)       |
|  ├── MDCACHE (Multi-threaded lockless metadata cache)         |
|  └── File System Abstraction Layer (FSAL Interface)           |
+-------------------------------|-------------------------------+
                                │ Native API Bindings
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
+----------------+      +----------------+      +----------------+
| FSAL_CEPH      |      | FSAL_RGW       |      | FSAL_VFS       |
| Direct libcephfs|     | S3 Object APIs |      | Local POSIX    |
| Zero-copy I/O  |      | Namespace View |      | Local NVMe     |
+----------------+      +----------------+      +----------------+
```

### Production NFS-Ganesha Configuration Template (`ganesha.conf`)
```ini
EXPORT {
    Export_Id = 101;
    Path = "/cephfs_shared";
    Pseudo = "/shared_data";
    Access_Type = RW;
    Squash = No_Root_Squash;
    Protocols = 4;
    Transports = TCP;
    SecType = "sys";

    # File System Abstraction Layer definition for CephFS
    FSAL {
        Name = CEPH;
        User_Id = "admin";
        Secret_Access_Key = "/etc/ceph/ceph.client.admin.keyring";
    }

    # Lockless Metadata Cache Configuration
    MDCACHE {
        Entries_HWMark = 200000;
        LRU_Run_Interval = 60;
    }
}
```

---

## 3. Enterprise File Storage Benchmarking: Filebench & HCIBench

### 1. Filebench: High-Concurrency Metadata & File Stressing
Filebench evaluates how an NFS mount handles heavy metadata churn (creates, opens, unlinks).

Workload Profile `nfs-webserver.f`:
```ini
define fileset name=webfiles,path=/mnt/nfs_share,size=32k,entries=20000,dirwidth=50,prealloc=80

define process name=http-workers,instances=16 {
  thread name=http-thread,instances=4 {
    flowop readwholefile name=read-html,fileset=webfiles
    flowop openfile name=open-asset,fileset=webfiles,fd=1
    flowop readwholefile name=read-asset,srcfd=1,fd=1
    flowop closefile name=close-asset,fd=1
    flowop appendfilerand name=append-access-log,fileset=webfiles,iosize=256
  }
}

run 60
```
```bash
filebench -f nfs-webserver.f
```

---

### 2. HCIBench (Hyper-converged Infrastructure Benchmark)
HCIBench is an enterprise automated test orchestrator developed by VMware:
- Automatically deploys multiple testing client VMs across a cluster.
- Coordinates distributed instances of **Vdbench** and **Fio** across shared NFS and vSAN datastores.
- Measures total aggregated throughput, $p95$/$p99$ latencies, and storage controller CPU saturation during synthetic failure scenarios.
