---
id: real-world-storage-runbook
title: 17. Real-World Troubleshooting Runbook
sidebar_label: 17. Troubleshooting Runbook
sidebar_position: 17
---

# 17. Real-World Troubleshooting Runbook

This runbook provides battle-tested triage workflows, commands, and root-cause analyses for production storage outages.

---

## 1. "No space left on device" (Disk Full)

### Scenario A: Inode Exhaustion (0% Bytes Free vs. 100% Inodes Used)
```bash
# Check block space vs inode space
df -h
df -i

# If 'df -h' shows 50% free but 'df -i' shows 100% used, find the directory containing millions of tiny files:
sudo find / -xdev -printf '%h\n' | sort | uniq -c | sort -k 1 -nr | head -n 10
```

### Scenario B: Deleted Files Still Held Open by Processes
```bash
# Find unlinked files that are still holding disk space because a daemon has an open file descriptor:
sudo lsof +L1

# Free space immediately without restarting the daemon by truncating the file descriptor:
sudo truncate -s 0 /proc/<PID>/fd/<FD_NUMBER>
```

---

## 2. Storage Latency Spikes & High I/O Wait

### Diagnostic Checklist
```bash
# 1. Inspect top I/O consumers in real time
sudo iotop -oPa

# 2. Check disk service time vs wait time
iostat -xz 1 5

# 3. Check for I/O errors or SCSI bus resets in kernel ring buffer
sudo dmesg -T | grep -E "I/O error|resetting SCSI|hardware error|nvme"
```
- **If `await >> svctm`**: Requests are queuing in the kernel block layer. The storage device is saturated.
- **If `svctm` is high**: Physical controller is slow (NAND thermal throttling, background FTL garbage collection, or physical media degradation).

---

## 3. RAID Disk Failure Remediation

```bash
# 1. Check which disk failed in the array
cat /proc/mdstat

# 2. Mark drive as faulty and remove it from array
sudo mdadm /dev/md0 --fail /dev/sdb1
sudo mdadm /dev/md0 --remove /dev/sdb1

# 3. Physically swap drive, copy partition table, and re-add:
sudo sfdisk -d /dev/sda | sudo sfdisk /dev/sdb
sudo mdadm /dev/md0 --add /dev/sdb1

# 4. Monitor rebuild progress
watch -n 2 cat /proc/mdstat
```

---

## 4. Ceph `HEALTH_WARN` & Slow OSDs

### Diagnostic Commands
```bash
# 1. Inspect cluster warnings
ceph health detail

# 2. Find slow OSD requests (> 30 seconds)
ceph daemon osd.<ID> dump_historic_slow_ops

# 3. Check for OSD clock skew or out-of-sync monitors
ceph mon stat
```
- **Slow OSD remediation**: If an OSD is reporting slow requests due to bad physical sectors, mark it out to initiate automated rebalancing:
  ```bash
  ceph osd out <ID>
  sudo systemctl stop ceph-osd@<ID>
  ```

---

## 5. Kubernetes Volume Mount Failure: `Multi-Attach error for volume`

### Symptoms
Pod is stuck in `ContainerCreating`; events show:
`Warning FailedAttachVolume Multi-Attach error for volume "pvc-xyz" Volume is already exclusively attached to one node and can't be attached to another`

### Root Cause & Fix
The previous worker node crashed or became unreachable. The cloud controller (AWS/GCP) still considers the EBS/Disk volume attached to the dead instance.

```bash
# 1. Check VolumeAttachment object in Kubernetes
kubectl get volumeattachment

# 2. Delete stale VolumeAttachment resource or force detach via cloud CLI
kubectl describe volumeattachment <attachment-name>
aws ec2 detach-volume --volume-id <vol-id> --force
```

---

## 6. Database High Disk Utilization & Table Bloat

### PostgreSQL Bloat & VACUUM Starvation
When updates occur, PostgreSQL inserts a new tuple version and flags the old one as dead. If `autovacuum` is blocked by a long-running transaction, dead tuples accumulate, causing table bloat.

```sql
-- Find long-running queries holding oldest transaction ID
SELECT pid, now() - xact_start AS duration, query 
FROM pg_stat_activity 
WHERE state != 'idle' 
ORDER BY 2 DESC;

-- Kill the query blocking vacuum
SELECT pg_terminate_backend(<PID>);
```
