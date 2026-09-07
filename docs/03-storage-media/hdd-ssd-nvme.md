---
id: hdd-ssd-nvme
title: 03. Storage Media — HDD, SSD & NVMe
sidebar_label: 03. Storage Media
sidebar_position: 3
---

# 03. Storage Media — HDD, SSD & NVMe

Storage media physics dictate the fundamental limits of latency, throughput, concurrency, and longevity in modern infrastructure.

---

## 1. Hard Disk Drives (HDDs): Electromechanical Mechanics

HDDs store bits by magnetizing microscopic magnetic domains on rotating ferromagnetic platters.

```
       Spindle Motor
          │
       ┌──┴──┐        Read/Write Head
  ┌────┤  █  ├────────────\
  │    └──┬──┘             \====[ Head Gimbal Assembly ]
  │   Platters              \
  │ (5400-15000 RPM)         \ Actuator Arm
  │                           \
  ▼                            ▲
Rotational Latency         Seek Time (Voice Coil Motor)
```

### Components of HDD Access Latency
$$\text{Total Latency} = T_{\text{seek}} + T_{\text{rotational}} + T_{\text{transfer}} + T_{\text{controller}}$$

1. **Seek Time ($T_{\text{seek}}$)**: The mechanical time taken by the voice-coil actuator to position the head over the specified track ($3\text{ ms} - 9\text{ ms}$).
2. **Rotational Latency ($T_{\text{rotational}}$)**: Time spent waiting for the target sector to spin beneath the head.
   $$\text{Avg Rotational Latency} = \frac{1}{2} \times \left(\frac{60}{\text{RPM}}\right)$$
   - At 7,200 RPM: $\approx 4.16\text{ ms}$.
   - At 15,000 RPM: $\approx 2.00\text{ ms}$.
3. **Transfer Time**: Electrical streaming speed of sectors across the magnetic head ($\approx 150 - 260\text{ MB/s}$).

---

## 2. Solid State Drives (SSDs) & NAND Flash Physics

SSDs eliminate all moving parts by storing electrons in floating-gate or charge-trap flash transistors.

```
           Control Gate
      ──────────────────────
         Inter-poly Oxide
      ──────────────────────
         Floating Gate (Stores trapped electrons)
      ──────────────────────
         Tunnel Oxide (Subject to wear / degradation)
      ──────────────────────
       P-Substrate (Source / Drain Silicon)
```

### Cell Storage Densities
- **SLC (Single-Level Cell)**: 1 bit per cell. 100,000 P/E cycles. Lowest latency, ultra-high endurance.
- **MLC (Multi-Level Cell)**: 2 bits per cell. ~10,000 P/E cycles.
- **TLC (Triple-Level Cell)**: 3 bits per cell. ~3,000 P/E cycles. Industry standard for enterprise and consumer.
- **QLC (Quad-Level Cell)**: 4 bits per cell. ~1,000 P/E cycles. Used for read-intensive cold/warm bulk storage.

### The Asymmetric In-Place Update Problem
- **Reads**: Occur at the **Page** level ($4\text{ KB} - 16\text{ KB}$), latency $\approx 20 - 50\mu\text{s}$.
- **Writes / Programming**: Occur at the **Page** level, latency $\approx 200 - 500\mu\text{s}$.
- **Erases**: Can ONLY occur at the **Erase Block** level ($4\text{ MB} - 16\text{ MB}$), latency $\approx 2 - 5\text{ ms}$.

Because flash cannot overwrite a page without first erasing its entire block, writes must be directed to empty pre-erased pages, requiring the **Flash Translation Layer (FTL)**.

---

## 3. The Flash Translation Layer (FTL) & Garbage Collection

The FTL is an embedded real-time operating system running inside the SSD controller:
1. **LBA-to-PBA Mapping**: Translates logical host addresses to dynamic physical NAND flash addresses.
2. **Wear Leveling**: Distributes writes evenly across all physical blocks to prevent localized premature cell death (Static and Dynamic Wear Leveling).
3. **Garbage Collection (GC)**:
   - Scans erase blocks containing stale/deleted pages.
   - Copies remaining valid pages to an empty erase block.
   - Issues a high-voltage erase command on the old block to reclaim it for future writes.
4. **TRIM / Deallocate Command**:
   - Informs the SSD controller when a file is deleted by the OS filesystem.
   - Prevents the SSD from wasting write endurance copying deleted blocks during garbage collection cycles.

---

## 4. Hardware Interfaces & Protocols: SATA vs. SAS vs. NVMe

```
+---------------+------------------------+------------------------+------------------------+
| Feature       | SATA III               | SAS 3 / SAS 4          | NVMe (PCIe 4.0 / 5.0)  |
+---------------+------------------------+------------------------+------------------------+
| Protocol      | AHCI (designed for HDD)| SCSI Command Set       | NVMe native protocol   |
| Bus Interface | Serial ATA (6 Gbps)    | Serial Attached SCSI   | PCIe Gen 4/5 (x4 lanes)|
| Max Bandwidth | ~550 MB/s              | ~1.2 - 2.4 GB/s        | ~7.5 - 14.0 GB/s       |
| Command Queues| 1 Queue                | Up to 254 Queues       | Up to 64,000 Queues    |
| Queue Depth   | 32 Commands max        | 254 Commands per queue | 64,000 Commands / queue|
| CPU Overhead  | High (single lock)     | Moderate               | Minimal (multi-core)   |
+---------------+------------------------+------------------------+------------------------+
```

---

## 5. Media Comparison Matrix

| Storage Medium | Typical Random 4K Read Latency | Max Random Read IOPS | Sequential Read Throughput | Cost per TB ($) | Primary Workload |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Enterprise 7200 RPM HDD** | $4,000 - 8,000\mu\text{s}$ | $\approx 75 - 120$ | $\approx 220\text{ MB/s}$ | ~$15 | Cold archive, backup, video |
| **Enterprise SATA SSD** | $100 - 200\mu\text{s}$ | $\approx 95,000$ | $\approx 550\text{ MB/s}$ | ~$60 | Legacy virtualization |
| **Enterprise NVMe TLC SSD** | $10 - 20\mu\text{s}$ | $\approx 800,000 - 1,500,000$ | $\approx 7,000\text{ MB/s}$ | ~$90 | Real-time OLTP, analytics, AI |
