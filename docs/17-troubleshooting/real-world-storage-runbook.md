---
id: real-world-storage-runbook
title: "17. Real-World Troubleshooting Runbook: Production Triage, Kernel Stacks & Emergency Recovery"
sidebar_label: 17. Troubleshooting Runbook
sidebar_position: 17
---

# 17. Real-World Troubleshooting Runbook: Production Triage, Kernel Stacks & Emergency Recovery

> **Prerequisites**: Modules 01 through 16.  
> **Target Audience**: SREs, On-Call Engineers, Linux Systems Administrators, and Database Engineers responding to active production storage incidents.

When a production storage outage strikes at 3:00 AM, there is no time to consult theoretical textbooks. This runbook provides rigorous, battle-tested diagnostic workflows, emergency triage one-liners, kernel call-stack analyses, and recovery procedures to resolve production storage crises.

---

## 1. The Storage SRE Diagnostic Methodology: The USE Method

Before running random tools, apply Brendan Gregg’s **USE Method** (Utilization, Saturation, Errors) to the storage subsystem:

```
                                 The USE Diagnostic Flow
                                           │
         ┌─────────────────────────────────┼─────────────────────────────────┐
         ▼                                 ▼                                 ▼
   1. Utilization                    2. Saturation                      3. Errors
How busy is the device?           Is there a work backlog?          Did operations fail?
iostat -xz 1 (%util)              iostat -xz 1 (aqu-sz, await)      dmesg -T (I/O error, reset)
vmstat 1 (r, b, wa)               cat /sys/block/*/queue/nr_requests smartctl -A (Reallocated)
```

1. **Utilization**: What percentage of time was the device actively servicing I/O? (`%util > 90%` indicates heavy load).
2. **Saturation**: Are requests queuing up faster than the controller can process them? (`aqu-sz > 10`, `r_await / w_await > 20 ms`).
3. **Errors**: Did the hardware or driver reject requests or remount filesystems read-only? (`dmesg`, `smartctl`).

---

## 2. Incident Playbook 1: "No space left on device" (Disk Full / ENOSPC)

### Scenario A: Inode Exhaustion (0% Bytes Used vs. 100% Inodes Exhausted)
#### Symptoms
Applications throw `ENOSPC: no space left on device`, but running `df -h` reports hundreds of gigabytes of free disk space.

#### Triage & Diagnosis
```bash
# 1. Compare block space vs inode space
df -h
df -i

# 2. If 'df -i' shows 100% inode utilization, locate the directory hoarding millions of tiny files
sudo find / -xdev -printf '%h\n' | sort | uniq -c | sort -k 1 -nr | head -n 15
```
Common culprits:
- Unpurged PHP/Node.js session directories (`/var/lib/php/sessions`).
- Postfix/Sendmail dead letter mail queues (`/var/spool/postfix/maildrop`).
- Abandoned container logs or scratch lock files.

#### Emergency Mitigation
Do not run `rm *` in a directory with millions of files (it will fail with `Argument list too long`). Use `find` with `-delete`:
```bash
# Delete files matching older than 7 days efficiently
find /var/spool/postfix/maildrop -type f -mtime +7 -delete
```

---

### Scenario B: Deleted Files Still Held Open by Running Processes
#### Symptoms
An engineer deleted a 200 GB log file (`rm -f access.log`), but `df -h` shows **zero space was reclaimed**!

#### Root Cause
In POSIX filesystems, calling `unlink()` (or `rm`) removes the directory entry (dentry). However, if a running process (e.g., NGINX, Java, Docker) still has an open file descriptor pointing to that inode, the kernel retains the physical data blocks on disk until the process closes the file descriptor or terminates.

#### Triage & Immediate Online Recovery
```bash
# 1. List all unlinked (deleted) files still consuming disk space
sudo lsof +aL1 /

# Output Example:
# COMMAND   PID USER   FD   TYPE DEVICE   SIZE/OFF NLINK   NODE NAME
# java    14092 root    4u   REG    8,1 214748364800     0 419218 /var/log/app.log (deleted)
```

#### The Zero-Downtime Fix: Truncate via `/proc`
Do **not** restart the critical production application. Truncate the file descriptor to zero bytes directly through the Linux `/proc` virtual filesystem:
```bash
# Replace 14092 with the PID and 4 with the FD number from lsof
sudo truncate -s 0 /proc/14092/fd/4

# Verify disk space is instantly reclaimed in df -h!
df -h /
```

---

### Scenario C: Emergency Reclamation of Ext4 Reserved Blocks
If production is down and the disk is at 100%, reclaim the 5% root reservation space immediately to buy time:
```bash
# Reduce reserved block count from 5% to 1% online (reclaims dozens of gigabytes instantly!)
sudo tune2fs -m 1 /dev/sda1
```

---

## 3. Incident Playbook 2: High `iowait` & Uninterruptible Sleep (`D` State)

### Symptoms
CPU monitoring alarms fire for high utilization, but checking `top` reveals high `wa` (I/O wait), while user and system CPU are idle. Web requests are queuing up and timing out.

### Step-by-Step Triage Workflow

#### Step 1: Identify Processes in Uninterruptible Sleep (`D` state)
A process enters the `D` state when executing a blocking kernel system call waiting for hardware disk response:
```bash
# List all processes currently stuck in D state
ps -eo state,pid,user,cmd | grep "^D"
```

#### Step 2: Extract the Exact Kernel Call Stack
Inspect where the stuck thread is blocked inside the Linux kernel:
```bash
# Print the kernel call stack of the stuck PID
sudo cat /proc/<STUCK_PID>/stack

# Common Stack Examples:
# [1] Blocked on Page Cache dirty writeback throttling:
#     [<0>] balance_dirty_pages+0x312/0x8d0
#     [<0>] generic_perform_write+0x14f/0x1c0
# [2] Blocked on Ext4 journal lock:
#     [<0>] jbd2_log_wait_commit+0xb2/0x140
#     [<0>] ext4_sync_file+0x189/0x3a0
# [3] Blocked on physical hardware I/O completion:
#     [<0>] io_schedule+0x16/0x40
#     [<0>] blk_mq_make_request+0x3b2/0x5c0
```

#### Step 3: Pinpoint the Top I/O Consumer Process
```bash
# Show only processes actively generating disk I/O in real time
sudo iotop -oPa -d 1

# If iotop is unavailable, inspect per-process I/O statistics via pidstat
sudo pidstat -d 1 5
```

---

## 4. Incident Playbook 3: Read-Only Filesystem Remount (`EROFS`)

### Symptoms
Applications crash with `Read-only file system (os error 30)`. Attempting to write or create a file fails:
```bash
touch /data/test.tmp
# Output: touch: cannot touch '/data/test.tmp': Read-only file system
```

### Root Cause Analysis
Modern Linux filesystems (Ext4, XFS) are mounted with `errors=remount-ro` by default. When the storage subsystem encounters:
- Hardware controller I/O timeouts ($> 30\text{ seconds}$).
- Uncorrectable read/write errors on journal blocks.
- Corrupted inode metadata trees.

The kernel immediately switches the filesystem into **read-only mode** to protect against further data destruction.

### Emergency Recovery Procedure
```bash
# 1. Inspect kernel ring buffer for the root cause error
dmesg -T | grep -i -E "ext4|xfs|error|abort|corrupt|scsi|nvme" | tail -n 20

# 2. Unmount the damaged filesystem safely
sudo umount /data

# If umount fails because processes are still holding files open:
sudo fuser -k -m /data  # Terminate processes holding open handles
sudo umount /data

# 3. For Ext4: Execute non-destructive filesystem check and repair
sudo fsck.ext4 -yfv /dev/sdb1

# 4. For XFS: Execute XFS repair
# (If the journal is corrupted, use -L to clear log - CAUTION: may lose last in-flight transaction)
sudo xfs_repair -v /dev/sdb1

# 5. Remount read-write
sudo mount -a
```

---

## 5. Incident Playbook 4: Silent Bit-Rot & Hardware Drive Degradation

### Symptoms
Database logs report `Checksum failure on page 41921` or `Corrupt block header`.

### Triage: Physical Drive Health Audit
```bash
# Check SMART health on physical SATA/SAS drive
sudo smartctl -H /dev/sda

# Inspect the 3 critical failure predictor attributes
sudo smartctl -A /dev/sda | grep -E 'Reallocated_Sector_Ct|Reported_Uncorrect|Current_Pending_Sector'

# For NVMe SSDs:
sudo nvme smart-log /dev/nvme0 | grep -E 'critical_warning|available_spare|media_errors'
```

#### Action Thresholds:
- **`Reallocated_Sector_Ct` > 0**: Drive has physically retired dead sectors. If this number increases over time, **replace the drive immediately**.
- **`Reported_Uncorrect` > 0**: Drive head or NAND cells failed to read a block. Imminent failure.
- **NVMe `media_errors` > 0**: Flash memory cells have permanently degraded.

---

## 6. Complete Linux Storage Diagnostic Command Cheat Sheet

| Command | Primary Use Case | Key Diagnostic Flag / Output to Inspect |
| :--- | :--- | :--- |
| `iostat -xz 1` | Real-time I/O performance | `r_await`, `w_await` (latency), `%util` (saturation), `aqu-sz`. |
| `vmstat 1` | System-wide memory & I/O wait | `wa` (CPU I/O wait percentage), `b` (blocked processes). |
| `iotop -oPa` | Process-level I/O attribution | Identifies exact PID generating read/write megabytes. |
| `lsof +aL1 /` | Ghost disk space recovery | Unlinked open file descriptors consuming disk space. |
| `lsblk -t` | Topology and alignment audit | Verify sector alignment (`PHY-SEC`, `LOG-SEC`). |
| `cat /proc/vmstat` | Kernel Page Cache status | `nr_dirty` (unwritten pages), `nr_writeback` (pages in flight). |
| `smartctl -A <dev>` | Physical drive hardware health | Attribute 5 (Reallocated sectors), Attribute 187 (Uncorrectable). |
| `biolatency-bpfcc 5` | Block layer latency distribution | Power-of-2 histogram of actual disk response time. |

---

## 7. Hands-on Incident Simulation & Triage Drills

Run these non-destructive drills on a test VM to build muscle memory:

### Drill: Simulate an Unlinked File Consuming 1 GB of Hidden Disk Space
```bash
# 1. Create a 1 GB dummy file
dd if=/dev/zero of=/tmp/hidden_hog.dat bs=1M count=1024

# 2. Hold the file open in background using Python, then delete it immediately
python3 -c '
import time, os
f = open("/tmp/hidden_hog.dat", "r")
os.unlink("/tmp/hidden_hog.dat")
print("File unlinked from filesystem, but held open by PID:", os.getpid())
time.sleep(60)
' &

# 3. Notice: 'ls /tmp/hidden_hog.dat' returns No such file or directory!
# But 'df -h /tmp' still shows the 1 GB consumed!

# 4. Find the open handle and reclaim space online:
PID=$(lsof +aL1 /tmp | grep hidden_hog | awk '{print $2}')
FD=$(lsof +aL1 /tmp | grep hidden_hog | awk '{print $4}' | sed 's/[a-z]//g')
sudo truncate -s 0 /proc/$PID/fd/$FD

# Verify disk space is instantly restored!
df -h /tmp
```

---

## 8. Summary Checklist & Emergency Response Protocol

1. **Check `df -i` First**: Never assume `ENOSPC` is pure block exhaustion; check inode exhaustion immediately.
2. **Use `lsof +aL1` for Ghost Space**: Reclaim gigabytes of space by truncating deleted open file descriptors via `/proc/<PID>/fd/<FD>` without restarting daemons.
3. **Inspect `/proc/<PID>/stack`**: When a process is stuck in `D` state, inspect its kernel call stack to pinpoint the exact locking or writeback bottleneck.
4. **Tune `vm.dirty_bytes` to Stop Checkpoint Freezes**: Switch from percentages to absolute byte limits on high-memory database servers.
5. **Audit Drive SMART Attributes**: Any nonzero increasing count on `Reallocated_Sector_Ct` or `media_errors` warrants immediate hardware drive replacement.
