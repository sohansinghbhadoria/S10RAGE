---
id: filebench
title: "Filebench: Workload Model Language (WML) Application Emulation"
sidebar_label: "5. Filebench (WML App Profiles)"
sidebar_position: 6
---

# Filebench: Workload Model Language (WML) Application Emulation

> **Origin**: Originally developed at Sun Microsystems; maintained by academic storage researchers and kernel developers.  
> **Applicability**: Linux VFS layer profiling, filesystem metadata characterization, complex application simulation (NFS/CIFS Fileserver, Mailserver, Webserver, OLTP).

While synthetic generators like FIO issue uniform streams of random or sequential reads/writes, **real applications perform intricate sequences of metadata lookups, file creations, append operations, fsync flushes, and file deletions across hierarchical directory trees**.

Filebench models these nuanced application behaviors through its declarative **Workload Model Language (WML)**.

---

## 1. WML Core Architecture & Primitives

```
+-------------------------------------------------------------------------+
|                        Filebench WML Hierarchy                          |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | Fileset (define fileset name=..., path=..., files=N, dirwidth=M)  |  |
|  +---------------------------------+---------------------------------+  |
|                                    |                                    |
|  +---------------------------------v---------------------------------+  |
|  | Process (define process name=..., instances=P)                    |  |
|  |  +-------------------------------------------------------------+  |  |
|  |  | Thread (define thread name=..., instances=T)                |  |  |
|  |  |  +-------------------------------------------------------+  |  |  |
|  |  |  | Flowops (Ordered sequence of operational primitives)  |  |  |  |
|  |  |  |  - openfile / createfile                              |  |  |  |
|  |  |  |  - readwholefile / writefile / appendfilerand         |  |  |  |
|  |  |  |  - fsync / closefile / deletefile                    |  |  |  |
|  |  |  +-------------------------------------------------------+  |  |  |
|  |  +-------------------------------------------------------------+  |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

### Key Flowop Primitives
- `createfile` / `openfile`: Allocates inode/dentry in VFS.
- `writefile` / `readwholefile`: Performs streaming or random I/O.
- `appendfilerand`: Simulates append-only WAL or application log growth.
- `fsync`: Forces dirty kernel page writeback and updates on-disk journals.
- `deletefile`: Tests filesystem namespace unlinking and space reclamation.

---

## 2. Installation & Quick Start

```bash
# Ubuntu / Debian
sudo apt-get update && sudo apt-get install -y filebench

# RHEL / Rocky Linux (Build from source or EPEL)
sudo dnf install -y bison flex gcc git make
git clone https://github.com/filebench/filebench.git
cd filebench
libtoolize
aclocal && autoheader && automake --add-missing && autoconf
./configure
make -j$(nproc)
sudo make install

# Verify installation and default profile library
filebench -h
ls -l /usr/local/share/filebench/workloads/
```

---

## 3. The 10 Essential Filebench Workload Snippets

### Snippet 1: Interactive Shell Sanity Test
*Objective*: Launch the Filebench interactive shell and execute inline system commands.

```bash
filebench
filebench> echo "Checking Filebench Version"
filebench> version
filebench> quit
```

---

### Snippet 2: Basic Sequential Write Workload Script (`seq_write.f`)
*Objective*: Define a custom WML workload to pre-allocate and sequentially write 1,000 files.

Create `seq_write.f`:
```text
set $dir=/mnt/storage_test
set $nfiles=1000
set $meandirwidth=20
set $filesize=1m

define fileset name=bigfileset,path=$dir,size=$filesize,entries=$nfiles,dirwidth=$meandirwidth,prealloc=100

define process name=writer,instances=1
{
  thread name=writer_thread,instances=4
  {
    flowop writefile name=seqwrite,filesetname=bigfileset,iosize=1m
  }
}

run 30
```

Execute:
```bash
filebench -f seq_write.f
```

---

### Snippet 3: Basic Sequential Read Workload Script (`seq_read.f`)
*Objective*: Open, read completely, and close files across the allocated fileset.

Create `seq_read.f`:
```text
set $dir=/mnt/storage_test

define fileset name=bigfileset,path=$dir,reuse=1

define process name=reader,instances=1
{
  thread name=reader_thread,instances=4
  {
    flowop openfile name=open1,filesetname=bigfileset,fd=1
    flowop readwholefile name=read1,fd=1,iosize=1m
    flowop closefile name=close1,fd=1
  }
}

run 30
```

Execute:
```bash
filebench -f seq_read.f
```

---

### Snippet 4: Fileserver Persona Profile (`fileserver.f`)
*Objective*: Emulate a high-concurrency enterprise network fileserver (NFS/CIFS) performing file creates, deletes, appends, reads, and stats.

```bash
# Run standard fileserver profile for 60 seconds
sudo filebench -f /usr/local/share/filebench/workloads/fileserver.f
```

*Profile Parameters*:
- Simulates 50 active threads.
- Mean file size: 128 KiB.
- Workload ratio: 1:1 reads vs appends with frequent metadata `stat` calls.

---

### Snippet 5: Webserver Persona Profile (`webserver.f`)
*Objective*: Emulate an Apache / NGINX web server serving static assets with high read-concurrency and an append-only access log.

```bash
sudo filebench -f /usr/local/share/filebench/workloads/webserver.f
```

*Profile Parameters*:
- 100 concurrent reader threads performing `openfile -> readwholefile -> closefile`.
- 1 background thread appending HTTP access records with periodic fsync.

---

### Snippet 6: Varmail Persona Profile (`varmail.f`)
*Objective*: Emulate Postfix/Dovecot enterprise mail server handling thousands of small messages.

```bash
sudo filebench -f /usr/local/share/filebench/workloads/varmail.f
```

*Profile Parameters*:
- Characterized by small (16 KiB) files with a strict **create -> append -> fsync -> read -> delete** loop.
- Severely stresses filesystem journal commit latency and metadata lock contention.

---

### Snippet 7: OLTP Database Persona Profile (`oltp.f`)
*Objective*: Emulate an enterprise database engine (Oracle, PostgreSQL, MySQL) performing table random I/O, undo logging, and write-ahead log (WAL) commits.

```bash
sudo filebench -f /usr/local/share/filebench/workloads/oltp.f
```

*Profile Parameters*:
- Multiple reader threads executing random 2 KiB and 8 KiB page lookups.
- Dedicated DB writer process flushing dirty pages.
- High-priority log writer calling synchronous fsync on segmented WAL logs.

---

### Snippet 8: High-Speed File Deletion & Namespace Reclamation (`delete_bench.f`)
*Objective*: Measure filesystem metadata unlink rate by rapidly opening and deleting files from a pre-populated fileset.

Create `delete_bench.f`:
```text
set $dir=/mnt/storage_test
set $nfiles=10000

define fileset name=delfileset,path=$dir,size=16k,entries=$nfiles,dirwidth=50,prealloc=100

define process name=deleter,instances=1
{
  thread name=deleter_thread,instances=8
  {
    flowop deletefile name=delflow,filesetname=delfileset
  }
}

run 60
```

Execute:
```bash
filebench -f delete_bench.f
```

---

### Snippet 9: Dynamic Variable Overrides via CLI
*Objective*: Dynamically scale thread counts, file counts, and test duration without modifying WML script files.

```bash
filebench << EOF
set \$dir=/mnt/storage_test
set \$nthreads=64
set \$nfiles=50000
load /usr/local/share/filebench/workloads/fileserver.f
run 120
shutdown
EOF
```

---

### Snippet 10: Advanced Latency Histograms & Trace Generation
*Objective*: Capture granular latency distributions across distinct flowops (separating read latency from fsync latency).

```bash
filebench << EOF
set \$dir=/mnt/storage_test
load /usr/local/share/filebench/workloads/varmail.f
enable stats
stats clear
run 60
stats snap
stats dump /tmp/varmail_stats.csv
shutdown
EOF
```

---

## 4. Reading Filebench Output

```
148: 60.003: IO Summary: 114256 ops 1904.148 ops/s 78.4/38.2 r/w mb/s 0.521ms cpu/op 1.284ms latency
148: 60.003: Flowop breakdown:
148: 60.003:   openfile1: 1904.148 ops/s, latency=0.124ms
148: 60.003:   readfile1: 1904.148 ops/s, latency=0.312ms
148: 60.003:   closefile1: 1904.148 ops/s, latency=0.082ms
148: 60.003:   deletefile1: 1904.148 ops/s, latency=0.766ms
```
- **`ops/s`**: Composite operations per second completed across all flowops.
- **`r/w mb/s`**: Separate read and write bandwidth.
- **`Flowop breakdown`**: Shows the exact latency contribution of each system call, isolating whether slowdowns stem from disk throughput or metadata serialization.
