---
id: vdbench
title: "VDBench (Virtual Disk Benchmark): Enterprise Storage Validation"
sidebar_label: "2. VDBench (Virtual Disk Benchmark)"
sidebar_position: 3
---

# VDBench (Virtual Disk Benchmark): Enterprise Storage Validation

> **Origin**: Developed by Oracle / Sun Microsystems storage architects.  
> **Applicability**: Enterprise SAN/NAS arrays, raw block LUNs, distributed filesystems, deduplication and compression validation, and multi-host cluster testing.

Vdbench is a multi-threaded benchmark tool written in Java and C, widely recognized as the industry standard by storage array vendors (NetApp, Pure Storage, Dell EMC, IBM). It excels at **strict data integrity validation**, automated **deduplication and compression ratio generation**, and multi-host client execution.

---

## 1. Core Architecture & Primitives

Vdbench separates hardware definitions from workload generation using four structural building blocks:

```
+----------------------------------------------------------------------------+
|                          Vdbench Architecture                              |
|                                                                            |
|   +------------------------------------+                                   |
|   | Host Definitions (HD)              |  (Master / Slave JVMs)            |
|   +-----------------+------------------+                                   |
|                     |                                                      |
|   +-----------------v------------------+                                   |
|   | Storage / Filesystem (SD / FSD)    |  (Targets: /dev/sdb or /mnt/data) |
|   +-----------------+------------------+                                   |
|                     |                                                      |
|   +-----------------v------------------+                                   |
|   | Workload Definitions (WD / FWD)    |  (Block sizes, R/W mix, threads)  |
|   +-----------------+------------------+                                   |
|                     |                                                      |
|   +-----------------v------------------+                                   |
|   | Run Definitions (RD)               |  (Runtime, warmup, reporting)     |
|   +------------------------------------+                                   |
+----------------------------------------------------------------------------+
```

- **SD (Storage Definition)**: Defines raw block devices or disks (e.g., `sd=sd1,lun=/dev/sdb,openflag=o_direct`).
- **WD (Workload Definition)**: Defines block sizes, read/write ratios, and random/sequential access.
- **RD (Run Definition)**: Defines test duration, warm-up intervals, and ties WDs to SDs.
- **FSD / FWD**: Filesystem counterparts to test directory trees, file sizes, and metadata operations.

---

## 2. Prerequisites & Installation

Vdbench requires a Java Runtime Environment (JRE 8 or newer).

```bash
# Ubuntu / Debian
sudo apt-get update && sudo apt-get install -y default-jre

# RHEL / Rocky Linux
sudo dnf install -y java-latest-openjdk-headless

# Download and unpack Vdbench (from Oracle official release)
mkdir -p ~/vdbench && cd ~/vdbench
# Extract vdbench50407.zip into directory
unzip vdbench50407.zip
chmod +x vdbench

# Run built-in sanity self-test
./vdbench -t
```

---

## 3. The 10 Essential Vdbench Workload Snippets

### Snippet 1: Built-in Sanity Self-Test (Validation)
*Objective*: Validate Java environment, JNI C library bindings, and test directory permissions.

```bash
cd ~/vdbench
./vdbench -t
# Expected output: "Vdbench execution completed successfully"
```

---

### Snippet 2: Raw Block Sequential Write (Throughput Maxima)
*Objective*: Benchmark sustained sequential write throughput using 1 MiB blocks on a raw block device.

Create `seq_write.par`:
```text
sd=sd1,lun=/dev/sdb,openflag=o_direct
wd=wd1,sd=sd1,xfersize=1m,rdpct=0,seekpct=0
rd=rd1,wd=wd1,iorate=max,elapsed=60,interval=5
```

Execute:
```bash
./vdbench -f seq_write.par
```

---

### Snippet 3: Raw Block Sequential Read (Cache Bypass)
*Objective*: Measure sequential read throughput with Direct I/O cache bypass.

Create `seq_read.par`:
```text
sd=sd1,lun=/dev/sdb,openflag=o_direct
wd=wd1,sd=sd1,xfersize=1m,rdpct=100,seekpct=0
rd=rd1,wd=wd1,iorate=max,elapsed=60,interval=5
```

Execute:
```bash
./vdbench -f seq_read.par
```

---

### Snippet 4: Raw Block 4 KiB Random Write (Steady-State IOPS)
*Objective*: Measure maximum random write IOPS using 32 concurrent threads across the LUN.

Create `rand_write_4k.par`:
```text
sd=sd1,lun=/dev/sdb,openflag=o_direct,threads=32
wd=wd1,sd=sd1,xfersize=4k,rdpct=0,seekpct=100
rd=rd1,wd=wd1,iorate=max,elapsed=120,warmup=15,interval=5
```

Execute:
```bash
./vdbench -f rand_write_4k.par
```

---

### Snippet 5: 8 KiB Mixed 70/30 Read/Write Workload
*Objective*: Simulate enterprise transaction processing with 70% reads, 30% writes, and 100% random seeks.

Create `oltp_70_30.par`:
```text
sd=sd1,lun=/dev/sdb,openflag=o_direct,threads=64
wd=wd1,sd=sd1,xfersize=8k,rdpct=70,seekpct=100
rd=rd1,wd=wd1,iorate=max,elapsed=180,warmup=20,interval=5
```

Execute:
```bash
./vdbench -f oltp_70_30.par
```

---

### Snippet 6: Filesystem Definition (FSD) Directory Creation & File Write
*Objective*: Benchmark filesystem metadata creation by generating a tree of 1,000 files across 10 directories.

Create `fsd_write.par`:
```text
fsd=fsd1,anchor=/mnt/storage_test,depth=2,width=5,files=100,size=1m
fwd=fwd1,fsd=fsd1,operation=write,xfersize=64k,threads=8
rd=rd1,fwd=fwd1,fwdrate=max,format=yes,elapsed=60,interval=5
```

Execute:
```bash
./vdbench -f fsd_write.par
```

---

### Snippet 7: Filesystem Random Read & Hotspot Skew
*Objective*: Measure filesystem read latency when 80% of I/O targets a 20% "hot" working set.

Create `fsd_read_skew.par`:
```text
fsd=fsd1,anchor=/mnt/storage_test,depth=2,width=5,files=100,size=1m
fwd=fwd1,fsd=fsd1,operation=read,xfersize=16k,threads=16,skew=80
rd=rd1,fwd=fwd1,fwdrate=max,format=no,elapsed=90,interval=5
```

Execute:
```bash
./vdbench -f fsd_read_skew.par
```

---

### Snippet 8: Filesystem File Delete & Teardown Benchmark
*Objective*: Measure filesystem metadata unlink and directory reclamation rate by deleting pre-existing files.

Create `fsd_delete.par`:
```text
fsd=fsd1,anchor=/mnt/storage_test,depth=2,width=5,files=100,size=1m
fwd=fwd1,fsd=fsd1,operation=delete,threads=16
rd=rd1,fwd=fwd1,fwdrate=max,format=clean,elapsed=60,interval=5
```

Execute:
```bash
./vdbench -f fsd_delete.par
```

---

### Snippet 9: Deduplication & Compression Ratio Qualification
*Objective*: Generate synthetic data blocks guaranteed to achieve an exact 3:1 deduplication ratio and 2:1 compression ratio to validate storage array efficiency engines.

Create `dedup_compress.par`:
```text
sd=sd1,lun=/dev/sdb,openflag=o_direct,threads=32
wd=wd1,sd=sd1,xfersize=16k,rdpct=0,seekpct=100
rd=rd1,wd=wd1,iorate=max,elapsed=120,interval=5,dedupratio=3,compratio=2,dedupunit=8k
```

Execute:
```bash
./vdbench -f dedup_compress.par
```

---

### Snippet 10: Multi-Host Distributed Benchmark (Master/Slave Mode)
*Objective*: Coordinate multiple client servers against a centralized storage target (e.g., SAN or All-Flash array).

Create `multi_host.par`:
```text
hd=default,vdbench=/home/admin/vdbench,user=admin
hd=host1,system=192.168.10.101
hd=host2,system=192.168.10.102

sd=sd1,hd=host1,lun=/dev/mapper/mpatha,openflag=o_direct,threads=32
sd=sd2,hd=host2,lun=/dev/mapper/mpatha,openflag=o_direct,threads=32

wd=wd1,sd=(sd1,sd2),xfersize=8k,rdpct=50,seekpct=100
rd=rd1,wd=wd1,iorate=max,elapsed=300,warmup=30,interval=5
```

Execute from the Master host:
```bash
./vdbench -f multi_host.par
```

---

## 4. Analyzing Vdbench Results

Vdbench writes tabular reports to `output/summary.html` and standard output:

```
May 28, 2026 ...
                     interval        i/o   MB/sec   bytes   read     resp     resp     resp    cpu%
                                    rate             i/o    pct     time      max   stddev  sys+usr
avg_2-120                 120   48214.2   376.68    8192   70.0    1.327    14.82    0.412     18.2
```

- **`resp time`**: Total service latency in milliseconds ($1.327\text{ ms}$).
- **`resp max`**: Worst recorded latency spike during the interval ($14.82\text{ ms}$).
- **`resp stddev`**: Standard deviation of response times; lower values signify consistent, predictable latency.
- **`cpu% sys+usr`**: Client host CPU consumption, verifying if the test was CPU-bound or storage-bound.
