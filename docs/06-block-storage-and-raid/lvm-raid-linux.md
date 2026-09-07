---
id: lvm-raid-linux
title: 06. Block Storage, LVM & RAID
sidebar_label: 06. Block Storage & RAID
sidebar_position: 6
---

# 06. Block Storage, LVM & RAID

Block storage provides raw, fixed-size sectors with no filesystem semantics. This guide dissects the Linux Device Mapper subsystem, Logical Volume Management (LVM), and software RAID architectures.

---

## 1. The Linux Storage Stack & Device Mapper

```
+-------------------------------------------------------------+
| Filesystems (ext4, XFS) / Direct Database Engine (Postgres) |
+------------------------------|------------------------------+
                               ▼
+-------------------------------------------------------------+
| Logical Volumes: /dev/mapper/vg_data-lv_database            |
| (LVM2 / Device Mapper Kernel Subsystem: dm-0, dm-1)         |
+------------------------------|------------------------------+
                               ▼
+-------------------------------------------------------------+
| Software RAID Layer: /dev/md0 (Linux mdadm driver)          |
+------------------------------|------------------------------+
                               ▼
+-------------------------------------------------------------+
| Physical Block Devices: /dev/sda, /dev/sdb, /dev/nvme0n1    |
+-------------------------------------------------------------+
```

The **Device Mapper (`dm`)** is the kernel framework for mapping physical block devices onto higher-level virtual block devices. It powers LVM, `dm-crypt` (LUKS disk encryption), `dm-linear`, and `dm-thin`.

---

## 2. Logical Volume Manager (LVM) Architecture

LVM abstracts physical storage into three hierarchical layers:

1. **Physical Volume (PV)**: Raw physical partitions or whole drives tagged with an LVM header (e.g., `pvcreate /dev/sdb`). Divided into fixed-size **Physical Extents (PE)** (typically 4 MB).
2. **Volume Group (VG)**: A storage pool aggregating one or more PVs into a unified contiguous pool of PEs (e.g., `vgcreate vg_data /dev/sdb /dev/sdc`).
3. **Logical Volume (LV)**: Virtual block devices carved out of a VG (e.g., `lvcreate -L 50G -n lv_db vg_data`). Composed of **Logical Extents (LE)** mapped directly to physical extents.

### LVM Online Expansion & Snapshots
- **Online Growth**: Run `lvextend -L +50G /dev/vg_data/lv_db` followed by filesystem resizing (`resize2fs` or `xfs_growfs`) with **zero downtime**.
- **Copy-on-Write (CoW) Snapshots**: Freezes point-in-time state. Modifying an original block copies the original data to the snapshot volume before overwriting, allowing consistent backups while the database continues accepting writes.

---

## 3. RAID Levels Comparison & Calculation

```
RAID 0 (Striping)         RAID 1 (Mirroring)       RAID 5 (Distributed Parity)
[ Disk 0 ]  [ Disk 1 ]    [ Disk 0 ]  [ Disk 1 ]   [ D0 ] [ D1 ] [ D2 ] [ Parity ]
  Data A1     Data A2       Data A1     Data A1      A1     A2     A3    P(A1-3)
  Data B1     Data B2       Data B1     Data B1      B1     B2    P(B)     B3
  Data C1     Data C2       Data C1     Data C1      C1    P(C)    C2      C3
```

| RAID Level | Min Disks | Storage Efficiency | Read Performance | Write Performance | Fault Tolerance | Write Penalty |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RAID 0** | 2 | $100\%$ ($N$) | $N \times$ Single Disk | $N \times$ Single Disk | **0 Disks** (1 failure destroys all) | None |
| **RAID 1** | 2 | $50\%$ ($N/2$) | $N \times$ Single Disk | $1 \times$ Single Disk | 1 Disk per mirror pair | $2$ |
| **RAID 5** | 3 | $\frac{N-1}{N}$ | $(N-1) \times$ Single Disk| Moderate (Parity calc) | **1 Disk** | **4** (2 reads + 2 writes) |
| **RAID 6** | 4 | $\frac{N-2}{N}$ | $(N-2) \times$ Single Disk| Lower (Dual parity) | **2 Disks** | **6** (3 reads + 3 writes) |
| **RAID 10**| 4 | $50\%$ ($N/2$) | $N \times$ Single Disk | $(N/2) \times$ Single Disk| Up to $N/2$ (1 per pair)| **2** |

### The RAID 5/6 Write Penalty (Read-Modify-Write)
To update a single block on RAID 5:
1. Read existing data block ($R_{\text{data}}$)
2. Read existing parity block ($R_{\text{parity}}$)
3. Compute new parity: $P_{\text{new}} = D_{\text{new}} \oplus D_{\text{old}} \oplus P_{\text{old}}$
4. Write new data block ($W_{\text{data}}$)
5. Write new parity block ($W_{\text{parity}}$)
$$\text{Single Logical Write} = 2 \text{ Reads} + 2 \text{ Writes} = 4 \text{ Physical I/Os!}$$

---

## 4. Hands-on Project: LVM + Software RAID & Disk-Failure Simulation

We will simulate a 3-disk RAID 5 array on Linux using loopback devices, create an LVM logical volume on top, simulate a drive failure, and rebuild it online.

### Step 1: Create 3 Virtual Disks and Build RAID 5
```bash
# Create 3 x 1GB virtual disks
truncate -s 1G /tmp/disk1.img /tmp/disk2.img /tmp/disk3.img
sudo losetup -fP /tmp/disk1.img
sudo losetup -fP /tmp/disk2.img
sudo losetup -fP /tmp/disk3.img

# Assume /dev/loop10, /dev/loop11, /dev/loop12 are allocated
sudo mdadm --create /dev/md0 --level=5 --raid-devices=3 /dev/loop10 /dev/loop11 /dev/loop12

# Check initial RAID sync status
cat /proc/mdstat
```

### Step 2: Layer LVM on top of the RAID Device
```bash
# Initialize Physical Volume and Volume Group
sudo pvcreate /dev/md0
sudo vgcreate vg_storage /dev/md0

# Create a 1.2GB Logical Volume and format with ext4
sudo lvcreate -L 1.2G -n lv_database vg_storage
sudo mkfs.ext4 /dev/vg_storage/lv_database

# Mount and write test verification data
sudo mkdir -p /mnt/raid_test
sudo mount /dev/vg_storage/lv_database /mnt/raid_test
echo "CRITICAL_STATE_2026" | sudo tee /mnt/raid_test/checksum.txt
```

### Step 3: Simulate Drive Failure
```bash
# Simulate immediate electrical failure of disk 2 (/dev/loop11)
sudo mdadm --manage /dev/md0 --fail /dev/loop11

# Verify degraded RAID status
cat /proc/mdstat

# Verify data integrity is STILL intact while running in degraded mode!
cat /mnt/raid_test/checksum.txt
```

### Step 4: Hot-Add Spare Drive and Observe Resync
```bash
# Create replacement disk and attach to RAID array
truncate -s 1G /tmp/disk_spare.img
sudo losetup -fP /tmp/disk_spare.img
sudo mdadm --manage /dev/md0 --add /dev/loop13

# Watch real-time rebuild progress
watch -n 1 cat /proc/mdstat
```
