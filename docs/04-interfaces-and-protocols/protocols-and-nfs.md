---
id: protocols-and-nfs
title: 04. Storage Interfaces & Protocols
sidebar_label: 04. Protocols & NFS
sidebar_position: 4
---

# 04. Storage Interfaces & Protocols

Modern enterprise storage spans direct-attached bus interfaces, dedicated storage area networks (SAN), and network-attached storage (NAS).

---

## 1. Direct & Bus-Attached Protocols

### SCSI (Small Computer System Interface)
The foundational command set for block storage. Commands like `READ (10)`, `WRITE (10)`, and `INQUIRY` form the core dialect encapsulated by SAS, Fibre Channel, and iSCSI.

### SATA vs. SAS
- **SATA (Serial ATA)**: Point-to-point interface designed for consumer desktop storage and bulk storage arrays. Half-duplex communication (cannot read and write concurrently). Single controller port per drive.
- **SAS (Serial Attached SCSI)**: Enterprise-grade interface. Full-duplex communication. Supports **dual-porting** (two independent SAS controllers connecting to the same physical drive for active-active high-availability multipathing).

### Fibre Channel (FC)
A high-speed, lossless network protocol running over dedicated optical fiber (16G, 32G, 64G FC).
- Operates on a dedicated SAN fabric isolated from general IP traffic.
- Uses hardware-level flow control (Buffer-to-Buffer credits) to guarantee zero packet drops.

---

## 2. Network Storage Architectures: SAN vs. NAS

```
+-----------------------------------+-----------------------------------+
| SAN (Storage Area Network)        | NAS (Network Attached Storage)    |
+-----------------------------------+-----------------------------------+
| Protocol: iSCSI, Fibre Channel,   | Protocol: NFSv4, SMB3             |
| NVMe-oF (NVMe-over-Fabrics)       |                                   |
| Presentation: Raw Block Device    | Presentation: Shared File Tree    |
| (/dev/sdb, LUN)                   | (/mnt/shared_data)                |
| Filesystem Management: Host OS    | Filesystem Management: NAS Server |
| Best For: Databases, Virtualization| Best For: Shared media, home dirs,|
| Hypervisors (KVM, ESXi)           | Kubernetes ReadWriteMany (RWX)    |
+-----------------------------------+-----------------------------------+
```

### iSCSI (Internet Small Computer Systems Interface)
Encapsulates SCSI block commands inside standard TCP/IP packets (Port 3260).
- **Target**: The storage provider exposing raw virtual block devices (LUNs).
- **Initiator**: The client machine mounting the remote block device.
- Allows standard Ethernet switches to act as a SAN without expensive Fibre Channel hardware.

### NFS (Network File System) vs. SMB/CIFS
- **NFS (NFSv3 / NFSv4.1)**: Predominant in Linux and UNIX environments. NFSv4 introduces stateful sessions, compound RPCs, and built-in security (Kerberos).
- **SMB (Server Message Block 3.x)**: Microsoft's native file sharing protocol. Supports SMB Multichannel (combines multiple network interfaces for aggregated bandwidth) and SMB Direct (RDMA).

---

## 3. Hands-on Lab: Configuring & Mounting a Production NFS Share

### Step 1: Install and Configure the NFS Server (Ubuntu / Debian)
```bash
# On the Server (e.g., <NFS_SERVER_IP>)
sudo apt update && sudo apt install -y nfs-kernel-server

# Create export directory with appropriate permissions
sudo mkdir -p /srv/nfs/shared_storage
sudo chown -R nobody:nogroup /srv/nfs/shared_storage
sudo chmod 777 /srv/nfs/shared_storage

# Edit /etc/exports to define access rules
sudo tee -a /etc/exports << 'EOF'
/srv/nfs/shared_storage <ALLOWED_CLIENT_CIDR>(rw,sync,no_subtree_check,no_root_squash)
EOF

# Export the directories and restart daemon
sudo exportfs -rav
sudo systemctl restart nfs-kernel-server
```

**Export Flags Explained**:
- `rw`: Read and write permissions.
- `sync`: Server confirms writes to stable disk before responding (prevents data corruption on server crash).
- `no_subtree_check`: Prevents subtree validation overhead.
- `no_root_squash`: Allows remote root users to maintain root ownership (crucial for container runtimes).

### Step 2: Mount the Share on the Client Machine
```bash
# On the Client Node (e.g., <NFS_CLIENT_IP>)
sudo apt update && sudo apt install -y nfs-common

# Verify exports exposed by server
showmount -e <NFS_SERVER_IP>

# Create local mount point and mount with production tuning options
sudo mkdir -p /mnt/nfs_share
sudo mount -t nfs4 -o proto=tcp,port=2049,rsize=1048576,wsize=1048576,hard,timeo=600 <NFS_SERVER_IP>:/srv/nfs/shared_storage /mnt/nfs_share

# Verify active mount and protocol version
nfsstat -m
```

---

## 4. Failure Scenario: NFS Stale File Handle (`ESTALE`)

### Cause
An application holds an open file descriptor on an NFS client, but another client or administrator deletes or moves the physical file on the server. When the client issues subsequent reads or writes, the server returns `ESTALE` (Error 116).

### Remediation
1. Identify the processes holding the stale handle:
   ```bash
   lsof +D /mnt/nfs_share
   ```
2. Restart or terminate the offending client process.
3. Perform a lazy unmount if the mount point hangs:
   ```bash
   sudo umount -l /mnt/nfs_share
   ```
