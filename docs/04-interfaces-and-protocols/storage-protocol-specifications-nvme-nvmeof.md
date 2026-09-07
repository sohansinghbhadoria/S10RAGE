---
id: storage-protocol-specifications-nvme-nvmeof
title: "Storage Protocol Specifications: SAS, SATA, NVMe & NVMe-oF"
sidebar_label: "Protocols: NVMe, NVMe-oF, SAS & Python Tools"
sidebar_position: 2
---

# Storage Protocol Specifications: SAS, SATA, NVMe & NVMe-oF

> **Governance & Reference Standards**:
> - **NVM Express, Inc.**: [NVM Express Base & Transport Specifications](https://nvmexpress.org/specifications/) (NVMe 2.0b / 2.1)
> - **INCITS / ANSI T10**: [SCSI Architecture Model (SAM) & Serial Attached SCSI (SAS-4)](https://www.t10.org/)
> - **SNIA**: [Storage Networking Industry Association Standards & Solid State Storage (SSS)](https://www.snia.org/standards)
> - **SATA-IO**: [Serial ATA International Organization Revision 3.5](https://sata-io.org/specifications)

Modern enterprise storage protocols govern the electrical, logical, transactional, and networking semantics used to move blocks of data between host memories and non-volatile media.

---

## 1. Standards Bodies & Technical Governance

```
+---------------------------------------------------------------------------------------+
| NVM Express, Inc. (nvmexpress.org)                                                    |
|  - NVMe Base Specification (Architecture, Queuing, Registers, Controller Memory Buffer)|
|  - Command Set Specs: NVM Command Set, ZNS (Zoned Namespaces), Key-Value (KV)         |
|  - Transport Specs: PCIe Transport, RDMA Transport, TCP Transport                    |
+---------------------------------------------------------------------------------------+
| INCITS T10 Technical Committee (t10.org)                                              |
|  - SCSI Architecture Model (SAM-6), SCSI Primary Commands (SPC-6)                     |
|  - Serial Attached SCSI (SAS-3 / SAS-4: 12 Gbps & 24.1 Gbps), Dual-Porting, SSP/SMP/STP|
+---------------------------------------------------------------------------------------+
| SNIA (Storage Networking Industry Association - snia.org)                             |
|  - SNIA Swordfish (RESTful Storage Management Specification)                          |
|  - Computational Storage Architecture & Programming Model (CS-APM)                   |
|  - Solid State Storage Performance Test Specification (SSS PTS)                       |
+---------------------------------------------------------------------------------------+
| SATA-IO (sata-io.org)                                                                 |
|  - Serial ATA Revision 3.0 - 3.5 (6 Gbps), AHCI (Advanced Host Controller Interface)  |
|  - Native Command Queuing (NCQ, 32 commands), Device Sleep (DevSleep)                 |
+---------------------------------------------------------------------------------------+
```

---

## 2. How to Read a Storage Protocol Specification (And What It Means)

Hardware storage specifications can appear intimidating, often spanning over 400 pages of dense register tables, bitfields, and state machines. To parse them like a systems engineer, you must understand their normative language, memory layout conventions, and operational state contracts.

### 1. The Normative Grammar (RFC 2119 / IEEE Rules)
Storage specifications establish contractual guarantees between host drivers (Linux kernel, SPDK) and hardware controller firmware:
- **`SHALL` / `MUST`**: Absolute requirement. A driver or controller failing to implement this behavior violates the specification and is non-compliant.
- **`SHOULD` / `RECOMMENDED`**: Strong engineering practice. Valid architectural reasons may exist to deviate, but the full implications must be understood and handled.
- **`MAY` / `OPTIONAL`**: Vendor discretion. The feature is not guaranteed to exist (e.g., NVMe Dataset Management or End-to-End Protection Information). Drivers must query capabilities registers first.
- **`RESERVED`**: Bits or bytes reserved for future specification revisions. **The host MUST clear these bits to 0; the device controller MUST ignore them upon reception.** Never use reserved bits for proprietary metadata.

---

### 2. Byte Ordering & Bit Numbering Conventions

> [!WARNING]
> **The Endianness Trap**:
> - **NVM Express (NVMe)** is strictly **Little-Endian** for all multi-byte fields! The least significant byte (LSB) resides at the lowest byte offset.
> - **SCSI / SAS (T10)** is traditionally **Big-Endian** (Network Byte Order)! The most significant byte (MSB) resides at byte 0.
> 
> Confusing these conventions in C structs or Python drivers results in immediate invalid opcode exceptions (`0x0001 Invalid Command Opcode`) or corrupted 64-bit LBA offsets!

Specifications define 32-bit registers and command structures using **Dwords** (Double Words = 4 bytes = 32 bits):
- **Dword 0**: Bytes `00` through `03`
- **Dword 1**: Bytes `04` through `07`
- **Dword N**: Bytes `(N * 4)` through `(N * 4) + 3`

Bit numbering within a Dword is indexed from `0` (least significant bit, $2^0$) to `31` (most significant bit, $2^{31}$).

---

### 3. Register & Field Access Types

| Access Acronym | Definition | Behavioral Meaning |
| :--- | :--- | :--- |
| **`RO`** | Read Only | Controller reports status; host writes are ignored or cause errors. |
| **`RW`** | Read / Write | Host reads current value and can overwrite with new values. |
| **`R/W1C`** | Write 1 to Clear | Reading returns current status. Writing a `1` bit clears that specific bit to `0`. Writing `0` leaves it untouched. Essential for interrupt and error clearing without race conditions. |
| **`HwInit`** | Hardware Initialized | State loaded by controller ASIC microcode during Power-On Reset. |

---

## 3. Deep Architectural Dissection: NVMe 64-Byte Command (SQE)

Every NVMe command—whether an Admin `Identify Controller` or an I/O `Read`/`Write`—is submitted as an exact **64-byte Submission Queue Entry (SQE)** composed of 16 Dwords (`CDW0` to `CDW15`).

```
Byte Offset:   00       01       02       03
             +--------+--------+--------+--------+
CDW0 (00-03) |  OPC   | FUSE|PS|   CID (15:00)   |  Command ID & Opcode
             +--------+--------+--------+--------+
CDW1 (04-07) |          NSID (31:00)             |  Namespace Identifier
             +-----------------------------------+
CDW2-3(08-15)|            RESERVED               |  Metadata Pointer (MPTR)
             +-----------------------------------+
CDW4-5(16-23)|        PRP1 / SGL1 (64-bit)       |  Data Pointer 1 (Physical Memory Addr)
             +-----------------------------------+
CDW6-7(24-31)|        PRP2 / SGL2 (64-bit)       |  Data Pointer 2 / PRP List Pointer
             +-----------------------------------+
CDW8-9(32-39)|      Starting LBA (SLBA 63:00)     |  64-bit Block Address to Read/Write
             +-----------------------------------+
CDW10 (40-43)|          NLB (15:00)    | Control |  Number of Blocks (0-based: 0 = 1 block)
             +-----------------------------------+
CDW11-15     | Command-Specific Management Hints |  FUA, Limited Retry, DSM hints
             +-----------------------------------+
```

### Dword-by-Dword Field Breakdown

1. **`CDW0` (Command Dword 0)**:
   - **`OPC` (Bits 07:00 - Opcode)**: The operation identifier. Examples:
     - `0x00`: Flush
     - `0x01`: Write
     - `0x02`: Read
     - `0x06`: Identify (Admin Command)
     - `0x09`: Dataset Management / TRIM
   - **`FUSE` (Bits 09:08)**: Enables fused operations (e.g., execute `Compare` and `Write` atomically).
   - **`PSDT` (Bits 15:14)**: Data Transfer Mechanism: `00b` = PRPs used; `01b` = SGLs used.
   - **`CID` (Bits 31:16 - Command Identifier)**: Unique tag assigned by host driver so completion entries can be matched asynchronously to outstanding requests.

2. **`CDW1` (Namespace ID - NSID)**: Target storage volume (typically `1` for `/dev/nvme0n1`).

3. **`CDW4 - CDW7` (Data Pointers: PRP vs. SGL)**:
   - **PRP1 (CDW4-5)**: 64-bit host physical memory address pointing to the first DMA buffer page.
   - **PRP2 (CDW6-7)**: If transfer exceeds 1 page, points to the next memory page or to a **PRP List** (an array of physical page addresses in memory).

4. **`CDW8 - CDW9` (Starting LBA - SLBA)**:
   - 64-bit integer combining CDW8 (lower 32 bits) and CDW9 (upper 32 bits). Allows addressing $2^{64}$ logical blocks ($\approx 73\text{ Zetabytes}$ with 4K sectors).

5. **`CDW10` (Number of Logical Blocks - NLB)**:
   - Bits 15:00 specify the number of blocks to transfer.
   - **0-Based Value**: A value of `0` means **1 block**; a value of `7` means **8 blocks**!

---

## 4. NVMe 16-Byte Completion Queue Entry (CQE) & The Phase Tag

When the NVMe controller finishes executing a command, it posts an exact **16-byte Completion Queue Entry (CQE)** into the Completion Queue in host DRAM via DMA:

```
Byte Offset:   00       01       02       03
             +--------+--------+--------+--------+
DW0 (00-03)  |      Command-Specific Result      |  e.g. Identify results / firmware slot
             +-----------------------------------+
DW1 (04-07)  |             RESERVED              |
             +--------+--------+--------+--------+
DW2 (08-11)  |   SQHD (15:00)  |   SQID (15:00)  |  Submission Queue Head & Queue ID
             +--------+--------+--------+--------+
DW3 (12-15)  |   CID (15:00)   |Status |P |DNR|SC|  Status Code, Phase Tag, Command ID
             +--------+--------+--------+--------+
```

### The Elegant "Phase Tag" (`P` Bit) Invariant
How does the host kernel know that a new completion entry has arrived without the controller needing to update an in-memory head pointer?

- Both the Host and the Controller maintain an internal 1-bit **Phase Tag (`P`)**, initialized to `1`.
- When the controller writes a new CQE, it sets the `P` bit in DW3 to match its current internal Phase Tag.
- When the queue wraps around the circular ring buffer back to index 0, the controller **inverts its Phase Tag** ($1 \to 0$, then $0 \to 1$).
- The host driver simply polls or checks:
  $$\text{Entry Valid} = (\text{CQE.Phase} == \text{Host.Phase})$$
- This completely eliminates the need for expensive memory barriers or separate head pointer writes!

---

## 5. Memory Descriptors: PRP (Physical Region Page) vs. SGL (Scatter-Gather List)

```
PRP Architecture (Linear Fixed Pages)       SGL Architecture (Chained Flexible Descriptors)
+------------------------------------+      +------------------------------------------+
| PRP1: 0x10004000 (Base Memory Page)|      | SGL Data Descriptor:                     |
| PRP2: 0x10008000 (PRP List Pointer)|      |   - Address: 0x7FFF0040 (Arbitrary Byte) |
|         │                          |      |   - Length:  16,384 bytes                |
|         ▼                          |      | SGL Bit Bucket / Transport Descriptor:   |
| [ Page 2: 0x10009000 ]             |      |   - Target RDMA Key / Offset             |
| [ Page 3: 0x1000A000 ]             |      +------------------------------------------+
+------------------------------------+
```

- **PRPs**: Highly optimized for direct PCIe bus DMA with uniform 4 KB OS virtual memory pages. All entries (except the first) must be strictly 4K page-aligned.
- **SGLs**: Required for **NVMe over Fabrics (NVMe-oF)** and virtualization. SGLs support arbitrary byte offsets, lengths, bit-bucket descriptors, and remote RDMA memory keys.

---

## 6. SCSI / SAS Protocol Architecture & Command Descriptor Blocks (CDB)

The INCITS T10 standard defines storage commands via **Command Descriptor Blocks (CDBs)**:

### SCSI `READ (10)` CDB Structure (Opcode `0x28`)

```
Byte 0:  [ 0x28 ]          Opcode (READ 10)
Byte 1:  [ RDPROTECT | DPO | FUA | RARC ]
Byte 2:  [ LBA MSB (Byte 3) ]   Big-Endian 32-bit Logical Block Address
Byte 3:  [ LBA (Byte 2)     ]
Byte 4:  [ LBA (Byte 1)     ]
Byte 5:  [ LBA LSB (Byte 0) ]
Byte 6:  [ Group Number     ]
Byte 7:  [ Transfer Length MSB ] Number of blocks (Big-Endian)
Byte 8:  [ Transfer Length LSB ]
Byte 9:  [ Control          ]
```

### SCSI Sense Data & Error Hierarchy
When a SAS drive encounters an error, it returns a status of `0x02 CHECK CONDITION` along with **Sense Data**:
$$\text{Error Triplet} = (\text{Sense Key}, \text{ASC}, \text{ASCQ})$$

- **Sense Key**: Broad classification (e.g., `0x03 MEDIUM ERROR`, `0x04 HARDWARE ERROR`).
- **ASC (Additional Sense Code)**: Specific fault (e.g., `0x11 UNRECOVERED READ ERROR`).
- **ASCQ (ASC Qualifier)**: Sub-fault detail (e.g., `0x04 AUTO REALLOCATION FAILED`).

---

## 7. NVMe-oF Wire-Level Protocol & PDU Framing

On NVMe/TCP (RFC standard port 4420), NVMe commands are encapsulated in **Protocol Data Units (PDUs)** over standard TCP streams:

```
+-------------------------------------------------------------+
| NVMe/TCP PDU Common Header (8 Bytes)                        |
|  - PDU Type (0x04 = H2CData, 0x05 = C2HData, 0x06 = Capsule)|
|  - Flags (0x01 = Header Digest, 0x02 = Data Digest)         |
|  - Header Length (HLEN) & Data Offset (PDO)                 |
|  - Total PDU Length (PLEN)                                  |
+-------------------------------------------------------------+
| Optional Header Digest (4-Byte CRC32c)                      |
+-------------------------------------------------------------+
| NVMe 64-Byte Command Capsule (SQE)                          |
+-------------------------------------------------------------+
| In-Capsule Data Payload (Optional immediate write data)     |
+-------------------------------------------------------------+
| Optional Data Digest (4-Byte CRC32c checksum over payload)  |
+-------------------------------------------------------------+
```

---

## 8. Translating Specs into Code: C Structs & Python Implementation

### C Implementation: NVMe Command Struct (`nvme_cmd.h`)
```c
#include <stdint.h>

// Exact 64-byte NVMe Submission Queue Entry defined in Base Spec 2.0 Section 4.2
struct nvme_common_cmd {
    uint8_t   opcode;       // CDW0 bits 07:00
    uint8_t   fuse : 2;     // CDW0 bits 09:08
    uint8_t   rsvd1 : 4;    // CDW0 bits 13:10
    uint8_t   psdt : 2;     // CDW0 bits 15:14 (PRP vs SGL)
    uint16_t  cid;          // CDW0 bits 31:16 (Command ID)
    uint32_t  nsid;         // CDW1 (Namespace Identifier)
    uint64_t  rsvd2;        // CDW2-3
    uint64_t  mptr;         // CDW4-5 (Metadata Pointer)
    uint64_t  prp1;         // CDW6-7 (Data Pointer 1)
    uint64_t  prp2;         // CDW8-9 (Data Pointer 2 / PRP List)
    uint32_t  cdw10;        // Command-specific
    uint32_t  cdw11;        // Command-specific
    uint32_t  cdw12;        // Command-specific
    uint32_t  cdw13;        // Command-specific
    uint32_t  cdw14;        // Command-specific
    uint32_t  cdw15;        // Command-specific
} __attribute__((packed));

_Static_assert(sizeof(struct nvme_common_cmd) == 64, "NVMe SQE must be exactly 64 bytes");
```

---

### Python Implementation: User-Space NVMe Tooling (`pynvme`, `ceph-nvmeof`, `nvmeof`)

```
                  Storage Engineering Python Ecosystem
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
   [ pynvme ]               [ ceph-nvmeof ]                [ nvmeof ]
  SPDK C-Extension          Control Plane CLI            Pure-Python RDMA
  Raw PCIe BAR / Admin      Orchestrates Ceph Gateway    Userspace Initiator
  Pytest SSD Validation     NVMe-oF/TCP Subsystems       Direct ibverbs library
```

#### 1. `pynvme`: Automated SSD Testing & Hardware Register Inspection
```python
import pytest
from pynvme import Controller

def test_nvme_spec_compliance():
    # Direct userspace PCIe access via SPDK
    ctrl = Controller(b"0000:01:00.0")
    
    # Read Capabilities Register (CAP: 64-bit BAR0 offset 0x0000)
    # Bit 36: Doorbell Stride (DSTRD) = 2 ^ (2 + DSTRD) bytes
    # Bits 15:00: Maximum Queue Entries Supported (MQES)
    mqes = (ctrl.cap & 0xFFFF) + 1
    dstrd = (ctrl.cap >> 32) & 0xF
    print(f"Spec Version: {hex(ctrl.vs)}")
    print(f"Max Queue Entries: {mqes}")
    print(f"Doorbell Stride: {2 ** (2 + dstrd)} bytes")
    
    # Send Raw NVMe Admin Identify Controller Command (Opcode 0x06)
    identify = ctrl.identify()
    print(f"Model Number: {identify.mn.decode().strip()}")
    assert mqes >= 64, "Controller fails minimum queue depth specification!"
```

#### 2. `ceph-nvmeof`: Exposing Distributed Storage over NVMe-oF/TCP
```bash
# Orchestrate Ceph NVMe-oF Gateway using Python management CLI
pip install ceph-nvmeof

# Create NVMe-oF Subsystem with ANA multi-pathing enabled
ceph-nvmeof subvolume create \
  --subsystem nqn.2026-09.com.s10rage:ceph.pool1 \
  --rbd-pool rbd_pool \
  --rbd-image volume_disk_01 \
  --size 50G
```

#### 3. `nvmeof` (PyPI): Pure-Python Userspace RDMA Initiator
```python
from nvmeof import RdmaInitiator

# Connect directly over InfiniBand / RoCEv2 fabric bypassing kernel NVMe driver
initiator = RdmaInitiator(
    target_addr="<TARGET_RDMA_IP>",
    target_port=4420,
    subsystem_nqn="nqn.2026-09.com.s10rage:flash.pool"
)

initiator.connect()
# Submit 4KB raw block read from LBA 0
block_data = initiator.read(lba=0, block_count=1)
print(f"Received {len(block_data)} bytes via userspace RDMA.")
initiator.disconnect()
```

---

## 9. Practical Diagnostic Runbook: `nvme-cli`

```bash
# 1. Enumerate all NVMe controllers and block namespaces
sudo nvme list

# 2. Query NVMe controller capabilities and identify data
sudo nvme id-ctrl /dev/nvme0

# 3. Read real-time SMART health log (Temperature, Available Spare, Wear Percentage)
sudo nvme smart-log /dev/nvme0

# 4. Discover remote NVMe-oF targets over TCP
sudo nvme discover -t tcp -a <TARGET_STORAGE_IP> -s 4420

# 5. Connect to remote subsystem with Asymmetric Namespace Access (ANA) multipath
sudo nvme connect -t tcp \
  -a <TARGET_STORAGE_IP> \
  -s 4420 \
  -n nqn.2026-09.com.s10rage:nvmeof.target01
```
