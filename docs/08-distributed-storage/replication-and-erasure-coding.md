---
id: replication-and-erasure-coding
title: "08. Network & Distributed Storage: Replication, Quorums, Raft & Erasure Coding"
sidebar_label: 08. Distributed Storage
sidebar_position: 8
---

# 08. Network & Distributed Storage: Replication, Quorums, Raft & Erasure Coding

> **Prerequisites**: Module 01 (Storage Metrics), Module 04 (Network Protocols), Module 06 (RAID & Parity).  
> **Target Audience**: Distributed Systems Engineers, Storage Architects, SREs, and Cloud Infrastructure Engineers.

When persistent data volumes, throughput demands, or availability SLAs exceed the physical boundaries of a single server or storage array, storage must be distributed across an untrusted, partitioned physical network. 

Designing distributed storage requires balancing the CAP theorem, consensus protocols (Raft, Paxos), quorum consistency ($R + W > N$), and the fundamental mathematical trade-off between replication and erasure coding.

---

## 1. Why Distributed Storage? Failure Domains & CAP/PACELC

Distributed storage replaces expensive, proprietary scale-up SAN hardware with scale-out clusters of commodity servers.

```
+-----------------------------------------------------------------------------------+
| Region: us-east-1                                                                 |
|  +-------------------------------------+---------------------------------------+  |
|  | Availability Zone A (AZ-1)          | Availability Zone B (AZ-2)            |  |
|  |  +-------------------------------+  |  +---------------------------------+  |  |
|  |  | Rack 1 (PDU-1, ToR Switch 1)  |  |  | Rack 2 (PDU-2, ToR Switch 2)   |  |  |
|  |  |  [Node 1]   [Node 2]          |  |  |  [Node 3]   [Node 4]            |  |  |
|  |  +-------------------------------+  |  +---------------------------------+  |  |
|  +-------------------------------------+---------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

### 1. Failure Domains
To achieve true high availability, redundant copies of data must reside in independent failure domains:
- **Disk Failure Domain**: Tolerates bad sectors or disk crashes.
- **Node Failure Domain**: Tolerates kernel panics, CPU hangs, or motherboard power supply burnouts.
- **Rack Failure Domain**: Tolerates Top-of-Rack (ToR) network switch failures or Power Distribution Unit (PDU) trips.
- **Availability Zone (AZ) Failure Domain**: Tolerates municipal power grid failure, datacenter floods, or fiber cuts.

### 2. The CAP & PACELC Theorems in Storage
- **CAP Theorem**: In the presence of a network partition (**P**), a distributed storage system must choose between Consistency (**C**, all nodes see the same data at the same time) or Availability (**A**, every non-failing node returns a response).
- **PACELC Theorem**: Extends CAP: If there is a **P**artition, trade off **A**vailability vs. **C**onsistency; **E**lse, trade off **L**atency vs. **C**onsistency.
  - *CP Systems* (Ceph, CockroachDB, Google Spanner): Prioritize strict serializability; reject writes if quorum cannot be reached.
  - *AP / PA/EL Systems* (Amazon DynamoDB, Apache Cassandra): Prioritize low write latency; accept writes locally and resolve conflicts later via vector clocks or Last-Write-Wins (LWW).

---

## 2. Replication Models: Synchronous vs. Asynchronous vs. Semi-Synchronous

```
Synchronous Replication (RPO = 0, High Latency):
Client ──write()──> Primary ──write()──> Replica 1
                       │           │
                       │           └──ack─────┐
                       └──write()──> Replica 2 │
                                   │           │
                                   └──ack──────┴──> Primary commits ──ack──> Client

Asynchronous Replication (Low Latency, RPO > 0):
Client ──write()──> Primary commits ──ack──> Client
                       │
                       └──(Background Queue)──> Replica 1 & Replica 2
```

### 1. Synchronous Replication
- **Mechanism**: The primary node writes to local storage and concurrently transmits data to replica nodes. The client request does **not** return success until all (or a quorum of) replicas acknowledge persistent storage.
- **RPO (Recovery Point Objective)**: **0** (Zero data loss upon primary crash).
- **Latency Penalty**: Bounded by the **slowest replica's network round-trip and disk write time** (tail latency problem).

### 2. Asynchronous Replication
- **Mechanism**: The primary writes locally and immediately returns success to the client. Replication streams to secondary nodes in background queues.
- **RPO**: $> 0$. If the primary server crashes or experiences a sudden ungraceful power loss, any data buffered in memory or in-flight across the network that was not acknowledged by replicas is **permanently lost**.
- **Latency Benefit**: Client write latency equals local disk write speed.

### 3. Semi-Synchronous Replication
- Used in enterprise databases (e.g., MySQL semi-sync). The primary blocks until at least **one** remote replica in an independent rack or AZ acknowledges receipt of the transaction log into its relay buffer before returning success.

---

## 3. Quorum Mathematics & Consistency Models

To guarantee strong read-your-writes consistency in leaderless distributed storage (e.g., Dynamo-style architectures), read and write operations use **Quorums**:

```
Total Replicas: N = 5
Write Quorum:   W = 3
Read Quorum:    R = 3

R + W = 3 + 3 = 6 > 5 (N)  ==> Strict Quorum!
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│     Node 1      │     Node 2      │     Node 3      │     Node 4      │     Node 5      │
│ [Version 2 (W)] │ [Version 2 (W)] │ [Version 2 (W)] │  Version 1 (R)  │  Version 1 (R)  │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┴─────────────────┘
  <────── Write Quorum (W=3) ──────>                   <────── Read Quorum (R=3) ───────>
                                     ^^^^^^^^^^^^^^^
                                 Overlapping Node (Node 3)
                            Guarantees latest Version 2 is read!
```

### The Strict Quorum Rule
$$\text{Read Quorum } (R) + \text{Write Quorum } (W) > \text{Replica Factor } (N)$$

When $R + W > N$, the Pigeonhole Principle guarantees that any set of $R$ nodes read from and any set of $W$ nodes written to must share at least **one overlapping node**.
- That overlapping node holds the highest version timestamp or generation ID.
- The client selects the highest version and can optionally trigger an asynchronous **Read Repair** to update stale nodes.

---

## 4. Consensus Protocols: Paxos vs. Raft

When distributed storage requires a single linearizable order of updates (e.g., metadata catalogs, distributed lock managers, etcd, Ceph Mons), leaderless quorums are insufficient. Systems employ **Distributed Consensus**.

```
Raft Consensus Protocol States:
              Times out, starts election
   ┌─────────┐ ────────────────────────> ┌───────────┐
   │Follower │                           │ Candidate │
   └─────────┘ <──────────────────────── └───────────┘
        ▲       Discovers current leader       │
        │       or new term                    │ Receives votes from
        │                                      │ majority of cluster
        │           Steps down                 ▼
        └─────────────────────────────── ┌───────────┐
                                         │  Leader   │
                                         └───────────┘
```

### Raft Core Invariants
1. **Leader Election**: Time is divided into arbitrary **Terms**. If a Follower receives no heartbeats within its randomized election timeout ($150 - 300\text{ ms}$), it transitions to Candidate, increments the term, and requests votes.
2. **Majority Rule**: A Candidate becomes Leader only if it secures votes from a strict majority ($\lfloor \frac{N}{2} \rfloor + 1$) of nodes.
3. **Log Matching Invariant**: If two entries in different logs have the same index and term, they store identical commands, and their logs are identical up to that index.
4. **Split-Brain Prevention**: Because an odd number of voting nodes ($2f + 1$) is required, a network split can only leave one partition with a strict majority. The minority partition cannot elect a leader and rejects client writes.

---

## 5. Erasure Coding (EC) vs. Multi-Copy Replication

Replication achieves fault tolerance by storing $N$ complete copies of an object. **Erasure Coding (EC)** achieves equal or superior fault tolerance at a fraction of the raw capacity overhead.

```
Replication (3x Multi-Copy):
Payload (10 MB) ──> [ Copy 1: 10 MB ]  [ Copy 2: 10 MB ]  [ Copy 3: 10 MB ]
Total Storage: 30 MB (Storage Efficiency = 33.3%, Overhead = 200%)
Tolerates: 2 node failures

Reed-Solomon Erasure Coding (k=4, m=2):
Payload (10 MB) ──> Sliced into 4 Data Chunks (2.5 MB each)
                 ──> Math Engine computes 2 Parity Chunks (2.5 MB each)
[ Data 1 ]   [ Data 2 ]   [ Data 3 ]   [ Data 4 ]   [ Parity 1 ]   [ Parity 2 ]
  2.5 MB       2.5 MB       2.5 MB       2.5 MB        2.5 MB         2.5 MB
Total Storage: 15 MB (Storage Efficiency = 66.7%, Overhead = 50%)
Tolerates: Any 2 node failures!
```

### Reed-Solomon Erasure Coding Mechanics
- Slices an object into $k$ equal data chunks.
- Computes $m$ redundant parity chunks using linear algebra over **Galois Fields** ($\text{GF}(2^8)$ or $\text{GF}(2^{16})$) via Vandermonde or Cauchy distribution matrices:
  $$[\text{Parity}] = [G] \times [\text{Data}]$$
- **The Core Property**: Any $k$ chunks out of the total $k + m$ chunks are mathematically sufficient to reconstruct the entire original object!

### The Engineering Trade-off: Storage Cost vs. Rebuild Network Penalty
| Architectural Property | 3x Replication | Erasure Coding ($8+4$) |
| :--- | :--- | :--- |
| **Storage Overhead** | $200\%$ ($3.0\times$) | **$50\%$ ($1.5\times$)** |
| **Capacity Efficiency** | $33.3\%$ | **$66.7\%$** |
| **Fault Tolerance** | 2 failures | **4 failures** |
| **Normal Read Latency** | Low (Single node read) | Low (Read $k$ chunks in parallel) |
| **Degraded Read Penalty** | Zero (Read surviving replica) | **Severe (Must read $k=8$ chunks to decode)**|
| **Network Traffic on Rebuild**| $1\times$ object size | **$k\times$ ($8\times$) object size over network**|
| **CPU Overhead** | Minimal (Memory copy) | Moderate to High (SIMD matrix math) |

---

## 6. Hands-on Linux Lab: Simulating Network Latency & Partitions

Use Linux Kernel Traffic Control (`tc`) and Network Emulation (`netem`) to test how distributed storage systems react to network degradation.

### Step 1: Inject Artificial Latency and Jitter
```bash
# Add 25 ms delay (+/- 5 ms jitter) to network interface eth0
sudo tc qdisc add dev eth0 root netem delay 25ms 5ms

# Test ping latency to peer storage node
ping -c 5 10.0.0.2

# Remove network emulation
sudo tc qdisc del dev eth0 root
```

### Step 2: Simulate Packet Loss and Reordering
```bash
# Inject 3% packet loss and 2% packet corruption
sudo tc qdisc add dev eth0 root netem loss 3% corrupt 2%
```

### Step 3: Simulate an Asymmetric Network Split with `iptables`
```bash
# Drop all incoming packets from Node 3 (10.0.0.3) to simulate a network partition
sudo iptables -A INPUT -s 10.0.0.3 -j DROP

# Observe Raft leader election / quorum response in storage daemon logs
# Flush iptables rule to heal the network partition
sudo iptables -D INPUT -s 10.0.0.3 -j DROP
```

---

## 7. Real-World Production Failure Scenarios

### Failure Scenario 1: The 2-Node "High Availability" Split-Brain Disaster
#### Incident
An engineering team deployed a 2-node MySQL active-passive cluster with automatic heartbeat failover. A transient top-of-rack network glitch severed communication between Node 1 and Node 2 for 45 seconds.
- Node 2 assumed Node 1 had died and promoted itself to Primary.
- Node 1 was still alive and continued accepting customer orders.
- Both nodes accepted conflicting transactions for 3 hours before discovery. Reconciling split database histories took **4 days of manual database surgery**.

#### Root Cause
**A 2-node cluster cannot establish quorum!**
$$\text{Quorum Majority for } N=2 \text{ is } \lfloor \frac{2}{2} \rfloor + 1 = 2$$
When network partitions occur, neither isolated node can achieve a majority of 2.

#### Prevention Rule
1. **Always deploy an odd number of consensus voting nodes** (minimum 3 nodes, where quorum = 2).
2. Deploy hardware fencing / STONITH ("Shoot The Other Node In The Head") via IPMI or network power switches to physically reboot a non-communicative primary before promoting a replica.

---

### Failure Scenario 2: The Erasure Coding Rebuild Network Meltdown
#### Incident
A 100-node object storage cluster configured with $16+4$ Reed-Solomon Erasure Coding experienced a rack failure taking down 4 nodes simultaneously.
The cluster began automatic background data recovery:
- Rebuilding each lost chunk required reading 16 surviving chunks across the network.
- The internal datacenter spine network saturated at 100% capacity ($400\text{ Gbps}$).
- Client application traffic timed out with connection resets; the storage cluster became completely unresponsive for 6 hours until network rate-limiting was applied.

#### Prevention
Configure **QoS (Quality of Service)** and strict bandwidth throttling on background storage recovery traffic:
- In Ceph: `osd_max_backfills = 1`, `osd_recovery_max_active = 2`.
- In MinIO: Limit parallel heal routines via `minio server --heal-threads`.

---

## 8. Practical Engineering Exercises (With Solutions)

### Exercise: Sizing Quorum for a Multi-Datacenter Cluster
**Problem**: You are architecting a distributed storage cluster spanning three geographic datacenters: DC-East (5 nodes), DC-West (4 nodes), and DC-Central (2 nodes). Total nodes $N = 11$.
1. What is the minimum number of nodes required to form a strict consensus quorum?
2. If DC-East suffers a catastrophic power outage, can the surviving datacenters continue servicing writes?
3. If DC-West suffers a network partition, can DC-East and DC-Central continue servicing writes?

#### Solution:
1. Consensus Quorum Majority:
   $$\text{Quorum} = \left\lfloor \frac{N}{2} \right\rfloor + 1 = \left\lfloor \frac{11}{2} \right\rfloor + 1 = 5 + 1 = 6\text{ Nodes}$$
2. DC-East power outage:
   - Remaining nodes: $\text{DC-West (4)} + \text{DC-Central (2)} = 6\text{ Nodes}$.
   - Can they form quorum? **Yes!** $6 \ge 6$. The cluster continues operating.
3. DC-West network partition:
   - Remaining nodes: $\text{DC-East (5)} + \text{DC-Central (2)} = 7\text{ Nodes}$.
   - Can they form quorum? **Yes!** $7 \ge 6$. The cluster continues operating.
- **Engineering Conclusion**: Sizing $N=11$ with an odd number ensures that losing any single datacenter (which holds at most 5 nodes) allows the remaining 6 nodes to safely maintain consistency and uptime without split-brain risk.

---

## 9. Summary Checklist & Key Takeaways

1. **Always Use Odd Node Counts for Consensus**: 3, 5, or 7 nodes. An even number of nodes cannot break ties during network partitions.
2. **Strict Quorum Formula**: $R + W > N$ ensures read and write quorums overlap on at least one latest-version node.
3. **Erasure Coding Halves Storage Costs**: Slashes storage overhead from 200% (3x replication) to 50% ($8+4$ EC) while improving fault tolerance.
4. **Beware EC Rebuild Storms**: Rebuilding 1 missing erasure-coded block requires reading $k$ surviving blocks over the network. Always rate-limit recovery traffic.
5. **Synchronous Means High Latency**: Synchronous replication guarantees zero data loss ($\text{RPO}=0$), but client latency is tied to the slowest network link.
