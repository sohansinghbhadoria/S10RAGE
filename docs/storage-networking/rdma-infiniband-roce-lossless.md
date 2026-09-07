---
id: rdma-infiniband-roce-lossless
title: "Storage Networking: RDMA, InfiniBand & Lossless Ethernet"
sidebar_label: "RDMA, InfiniBand & Lossless Networks"
sidebar_position: 1
---

# Storage Networking: RDMA, InfiniBand & Lossless Ethernet

> **Architectural Objective**: Eliminate the host CPU memory copy and kernel TCP/IP stack overhead to deliver microsecond-level storage I/O transfers across distributed clusters.

High-velocity storage fabrics (NVMe-oF, Ceph, Lustre, GPFS) demand bandwidth exceeding $400\text{ Gbps}$ with $p99$ latencies under $10\mu\text{s}$. Standard Linux kernel socket stacks collapse under these loads due to context switching, cache invalidation, and intermediate socket buffer copies.

---

## 1. The Kernel TCP/IP Bottleneck vs. RDMA Architecture

```
Traditional Kernel TCP/IP Socket I/O          RDMA (Remote Direct Memory Access)
+------------------------------------+        +------------------------------------+
| Application Buffer (User Space)    |        | Application Buffer (User Space)    |
|   │ write(fd, buf, len)            |        |   │ Memory Registration (MR)       |
+---|--------------------------------+        +---|--------------------------------+
    ▼ Syscall Context Switch                      │
+------------------------------------+            │
| Kernel Socket Buffer (sk_buff)     |            │ Bypasses OS Kernel Entirely!
|   │ TCP Segmentation / IP Framing  |            │ Zero Context Switches
+---|--------------------------------+            │ Zero Intermediate Memory Copies
    ▼ DMA Copy                                    ▼
+------------------------------------+        +------------------------------------+
| Hardware NIC Transmit FIFO         |        | RDMA-Enabled NIC (RNIC)            |
|   │ 802.3 Ethernet Wire            |        |   │ Direct PCIe DMA Read/Write     |
+------------------------------------+        +------------------------------------+
```

### Core RDMA Concepts & Data Structures
1. **Memory Registration (MR)**: Before RDMA hardware can access host DRAM, the OS kernel pins the virtual memory pages into physical RAM (preventing swap out) and maps them into the NIC's internal translation table. Returns a **Local Key (L_Key)** and **Remote Key (R_Key)** for cryptographic memory protection.
2. **Protection Domain (PD)**: Isolates memory regions and queue pairs so that unauthorized network peers cannot access arbitrary host memory.
3. **Queue Pairs (QP)**: Communications endpoints consisting of a **Send Queue (SQ)** and **Receive Queue (RQ)**.
   - **Reliable Connected (RC)**: Strict 1-to-1 connection, hardware-acknowledged, guaranteed in-order delivery. Primary mode for NVMe-oF.
   - **Unreliable Connected (UC)**: 1-to-1 connection without acknowledgments.
   - **Unreliable Datagram (UD)**: Connectionless 1-to-many delivery (similar to UDP).
4. **Completion Queue (CQ)**: Hardware posts Completion Queue Entries (CQEs) indicating finished work requests (WRs) without generating CPU software interrupts.

---

## 2. Transports Compared: InfiniBand vs. RoCEv1 vs. RoCEv2 vs. iWARP

```
+------------------+-------------------+-------------------+-------------------+
| InfiniBand (IB)  | RoCEv1            | RoCEv2            | iWARP             |
+------------------+-------------------+-------------------+-------------------+
| Native IB Layers | Ethernet Layer 2  | UDP / IP Layer 3  | TCP / IP Layer 4  |
| IB Link Layer    | EtherType 0x8915  | UDP Port 4791     | Standard TCP      |
| Custom Switches  | Non-routable L2   | Fully Routable L3 | Fully Routable L3 |
| Hardware Flow    | Lossless Ethernet | Lossless Ethernet | Standard Lossy IP |
| Control (Credit) | Required (PFC)    | Required (PFC+ECN)| Handles Drops     |
| Sub-2 µs latency | ~3 - 5 µs latency | ~3 - 7 µs latency | ~10 - 25 µs lat.  |
+------------------+-------------------+-------------------+-------------------+
```

- **InfiniBand (IB)**: Proprietary, credit-based hardware flow control. Transmitters never transmit a packet unless the downstream receiver has advertised available buffer space. Zero packet loss by design.
- **RoCEv2 (RDMA over Converged Ethernet v2)**: Encapsulates InfiniBand transport packets inside standard UDP/IP datagrams (destination UDP port `4791`). Operates over standard datacenter spine-leaf Ethernet fabrics, but **requires a Lossless Ethernet network**.
- **iWARP**: Transports RDMA semantics over TCP. Highly resilient to packet drops across WANs, but incurs TCP connection state and higher latency.

---

## 3. Mechanisms for Lossless RDMA over Ethernet

Standard Ethernet is inherently "lossy"—when switch buffers saturate, packets are silently dropped, triggering TCP retransmission timeouts (RTOs). Because RoCEv2 lacks a heavy TCP retransmission state machine, **even a 0.1% packet drop rate destroys RDMA storage throughput by over 90%!**

Lossless Ethernet solves this using four integrated protocols:

```
Lossless Ethernet Control Loop:
[ Switch Ingress Buffer ] ──► Exceeds Threshold ──► Sends PFC Pause Frame (802.1Qbb)
           │
           ▼ Exceeds ECN Threshold
[ ECN Marking (RFC 3168)] ──► Marks IP Header (CE=11) ──► Target RNIC generates CNP
                                                                   │
                                                                   ▼
[ DCQCN Rate Limiter    ] ◄────────────────────────────────────────┘
  Throttle Tx Rate on Host
```

### 1. Priority Flow Control (PFC - IEEE 802.1Qbb)
Unlike legacy Ethernet pause frames (IEEE 802.3x) which halt all traffic on the entire physical link, PFC divides the link into **8 virtual priority queues (Traffic Classes 0 to 7)**:
- Storage traffic (RoCEv2) is assigned to a dedicated lossless queue (typically **Priority 3** or **Priority 4**).
- When a switch ingress buffer fills up to its configured headroom threshold, it transmits a `PFC PAUSE` frame upstream specifically for that traffic class.
- Non-storage traffic (management, web traffic on Priority 0) remains completely unaffected.

### 2. Explicit Congestion Notification (ECN - RFC 3168)
PFC prevents packet drops, but if invoked excessively, it pushes backpressure all the way upstream, freezing network switches. ECN provides preemptive congestion signaling:
- Switches monitor queue depths using Random Early Detection (RED).
- When buffer queue depth exceeds `ECN_MIN`, the switch marks the 2-bit ECN field in the IP header with `11b` (Congestion Encountered - CE).
- Packets are **not** dropped; they are forwarded to the receiver with the CE mark intact.

### 3. DCQCN (Data Center Quantized Congestion Notification)
An end-to-end hardware congestion control algorithm combining PFC and ECN:
1. When the destination RNIC receives a packet with `CE=11`, it generates a **Congestion Notification Packet (CNP)** and sends it back to the source RNIC.
2. Upon receiving the CNP, the source RNIC hardware throttles its transmission rate ($\alpha$ reduction factor).
3. If no further CNPs arrive within a recovery timer period, the source gradually ramps its transmission rate back to wire speed.

### 4. Enhanced Transmission Selection (ETS - IEEE 802.1Qaz)
Defines strict bandwidth allocation guarantees per priority group:
- Example: Guarantee at least 60% link bandwidth for RoCEv2 storage traffic, 30% for inter-node clustering, and 10% for management, preventing bulk backups from starving storage queues.

---

## 4. PFC Deadlocks & Watchdog Mitigation

### The PFC Deadlock Cycle
In multi-switch topologies with circular traffic patterns, PFC pause frames can form a cyclic dependency loop where Switch A pauses Switch B, Switch B pauses Switch C, and Switch C pauses Switch A. All traffic freezes permanently.

### Mitigation: PFC Watchdog (PFC-WD)
Modern datacenter switches (SONiC, Arista EOS, Cisco NX-OS, Mellanox Onyx) implement **PFC Watchdog**:
- The switch measures how long a queue remains in a continuous paused state.
- If the pause duration exceeds the detection threshold (typically $100\text{ ms} - 200\text{ ms}$), the switch declares a **PFC Storm/Deadlock**.
- The watchdog temporarily disables PFC on the offending queue and drops incoming packets to break the cycle, alerting telemetry before restoring normal operations.

---

## 5. Hardware Diagnostics & Real-Time Telemetry Commands

### Step 1: Query Local Host RNIC & Port Status
```bash
# Display installed RDMA devices, firmware version, and transport type
ibv_devinfo -v

# Check link layer protocol (IB vs Ethernet / RoCE)
cat /sys/class/infiniband/mlx5_0/ports/1/link_layer
```

### Step 2: Read Hardware Lossless Counters on the Linux Host
```bash
# Inspect Mellanox / NVIDIA ConnectX hardware pause frame counters
ethtool -S eth0 | grep -E "prio3|pause|cnp|ecn|drop"

# Critical Counters to Monitor:
# rx_prio3_pause: Count of PFC pause frames received from upstream switch
# tx_prio3_pause: Count of PFC pause frames sent by host to downstream switch
# rx_prio3_pause_duration: Time in microseconds traffic was paused
# np_cnp_sent: Number of Congestion Notification Packets sent
# rp_cnp_handled: Number of CNPs received and rate-throttled
```

### Step 3: Run Point-to-Point RDMA Bandwidth & Latency Benchmark
```bash
# On Server Node (Target):
ib_read_bw -d mlx5_0 -i 1 --report_gbits

# On Client Node (Initiator):
ib_read_bw -d mlx5_0 -i 1 --report_gbits <TARGET_STORAGE_IP>
```

### Step 4: Verify Switch-Side Buffer & PFC Configurations (SONiC / Mellanox CLI)
```bash
# Display active PFC status per interface
show interface priority-flow-control

# Check switch ingress buffer headroom and drop statistics
show buffer pool
show interface counters drops
```
