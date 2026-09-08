---
id: aws-azure-gcp-comparison
title: "13. Cloud Storage Architecture: AWS, Azure & GCP Block, File & Object Deep-Dive"
sidebar_label: 13. Cloud Storage
sidebar_position: 13
---

# 13. Cloud Storage Architecture: AWS, Azure & GCP Block, File & Object Deep-Dive

> **Prerequisites**: Module 01 (Storage Metrics), Module 04 (Interfaces & Protocols), Module 07 (Object Storage & S3).  
> **Target Audience**: Cloud Architects, FinOps Engineers, Infrastructure Developers, and Multi-Cloud Platform SREs.

Public cloud providers partition storage into three distinct service classes: Block, File, and Object. While cloud APIs present simple, unified interfaces, the underlying architectures—such as custom ASIC hardware offload engines (AWS Nitro, Google Andromeda), distributed storage fabrics, and tiered pricing models—profoundly dictate system performance and operational budgets.

Selecting the wrong storage tier, failing to match EC2/VM network bandwidth to EBS/disk throughput, or neglecting API request fees can cause catastrophic production latency and six-figure cloud billing overruns.

---

## 1. The Multi-Cloud Storage Architecture Matrix

```
+----------------+-------------------------------+-------------------------------+-------------------------------+
| Storage Class  | Amazon Web Services (AWS)     | Microsoft Azure               | Google Cloud Platform (GCP)   |
+----------------+-------------------------------+-------------------------------+-------------------------------+
| Block Storage  | Amazon EBS (gp3, io2)         | Azure Managed Disks (Prem v2) | Persistent Disk & Hyperdisk   |
| Ephemeral Raw  | EC2 Instance Store (NVMe)     | Azure Temp Disk (DRAM/NVMe)   | Local SSD (Direct PCIe NVMe)  |
| File Storage   | Amazon EFS (NFSv4), FSx Lustre| Azure Files (SMB/NFS), ANF    | Filestore (NFSv3 / NFSv4.1)   |
| Object Storage | Amazon S3 (Standard, Glacier) | Azure Blob (Hot, Cool, Archive)| Cloud Storage (GCS Nearline)  |
+----------------+-------------------------------+-------------------------------+-------------------------------+
```

---

## 2. Cloud Block Storage Deep Dive: EBS vs. Azure Disks vs. GCP Hyperdisk

Unlike local physical disks plugged into a PCIe slot, cloud virtual block devices (EBS, Azure Managed Disks, GCP Persistent Disk) are **network-attached SAN block volumes** connected over internal datacenter fabrics.

```
+-----------------------------------------------------------------------------------+
| Virtual Machine Compute Host (AWS EC2 / Azure VM / GCP Compute Engine)            |
|  - Applications execute POSIX read()/write()                                      |
|  - Operating System submits I/O to virtual NVMe block controller                  |
+-----------------------------------------|-----------------------------------------+
                                          ▼
+-----------------------------------------------------------------------------------+
| Hardware Hypervisor Offload Engine (AWS Nitro Card / Azure Boost / GCP Andromeda) |
|  - Dedicated hardware ASIC offloads NVMe emulation, encryption, and network I/O   |
|  - Enforces per-instance network bandwidth and IOPS rate-limiting caps            |
+-----------------------------------------|-----------------------------------------+
                                          ▼ Dedicated Storage Network Fabric
+-----------------------------------------------------------------------------------+
| Distributed Storage Array Fabric (Amazon EBS Cells / Azure Storage Clusters)      |
|  - Synchronously replicates blocks across 3 availability domain storage servers   |
|  - Houses SSD / NVMe physical flash arrays                                        |
+-----------------------------------------------------------------------------------+
```

### 1. AWS Elastic Block Store (EBS)
- **`gp3` (General Purpose SSD)**: Baseline provides **3,000 IOPS** and **125 MB/s** throughput included free with any volume size (from 1 GB to 16 TB). Administrators can independently scale up to **16,000 IOPS** and **1,000 MB/s** for a small fee without purchasing extra capacity.
- **`io2 Block Express`**: Mission-critical SAN storage delivering up to **256,000 IOPS**, **4,000 MB/s** throughput, and sub-millisecond latency. Backed by a **99.999% volume durability SLA** (five nines).
- **EC2 Instance Store (Ephemeral NVMe)**: Directly attached physical NVMe SSDs installed on the motherboard of the host hypervisor. Delivers millions of IOPS and sub-20 µs latency, but **data is ephemeral**: data is wiped if the EC2 instance is stopped or hardware fails.

### 2. Azure Managed Disks
- **Premium SSD v2**: Decoupled architecture allowing independent provisioning of IOPS (up to 80,000) and throughput (up to 1,200 MB/s) per disk.
- **Ultra Disk**: Sub-millisecond latency block storage scaling up to 160,000 IOPS and 4,000 MB/s.
- **Host Caching (BlobCache)**: Azure unique capability allowing VMs to cache disk blocks in host DRAM and local NVMe (`None`, `ReadOnly`, `ReadWrite`). `ReadOnly` host caching dramatically improves read IOPS without consuming network storage bandwidth.

### 3. GCP Persistent Disk (PD) & Hyperdisk
- **Hyperdisk Extreme & Balanced**: Decouples IOPS and throughput from volume size, delivering up to **500,000 IOPS** and **10,000 MB/s** per VM.
- **GCP Local SSD**: Directly attached physical NVMe scratch drives striped up to 9 TB per instance.

---

## 3. The "EBS-Optimized" Instance Bottleneck Trap

A common failure mode is provisioning a high-performance 64,000 IOPS EBS volume and attaching it to a small or medium compute instance:

```
[ Application needs 64,000 IOPS ]
                │
                ▼
[ EC2 c6i.large Instance ] ──Dedicated EBS Bandwidth Cap: 1,562 Mbps (195 MB/s, 10,000 IOPS Max!)
                │
         NETWORK BOTTLENECK!
                │
                ▼
[ EBS Volume io2 (Provisioned for 64,000 IOPS) ] ──> 84% of Provisioned IOPS WASTED!
```

> [!WARNING]
> Every cloud compute instance type has a hard **EBS-Optimized Network Bandwidth Ceiling**. If an EC2 instance type is capped at 10,000 IOPS, attaching a 64,000 IOPS volume will still yield a maximum of 10,000 IOPS. You must size the VM compute instance and storage volume in lockstep.

---

## 4. Cloud Object Storage: Tiering, Retention & The Hidden Cost Trap

Public cloud object stores (AWS S3, Azure Blob, GCS) offer tiered storage classes to balance access latency against raw storage cost:

```
                        Cloud Object Storage Cost & Latency Pyramid
                                            ▲
                                           / \     S3 Express One Zone (< 10 ms, Ultra-High Cost)
                                          /   \    S3 Standard (Immediate Access, $0.023 / GB)
                                         /     \   S3 Intelligent-Tiering (Automated Dynamic Tiers)
                                        /       \  S3 Standard-IA ($0.0125 / GB + Retrieval Fee)
                                       /         \ S3 Glacier Flexible ($0.0036 / GB, 1-5 hr retrieval)
                                      /           \S3 Glacier Deep Archive ($0.00099 / GB, 12 hr retrieval)
                                     ▼─────────────▼
                         Storage Cost Drops (23x Reduction)
                     Data Retrieval Penalties & Latency Explode!
```

### The 4 Hidden Costs of Cloud Object Storage
1. **API Request Costs (`PUT`, `LIST`, `GET`)**:
   - Writing 1,000,000 objects to S3 Standard costs $\$5.00$ in `PUT` fees. If objects are only 1 KB each (total 1 GB = $\$0.023$), **the API fees are 217 times more expensive than the storage itself!**
2. **Minimum Storage Duration Penalties**:
   - S3 Standard-IA has a **30-day minimum billing duration**.
   - S3 Glacier has a **90-day minimum**.
   - S3 Glacier Deep Archive has a **180-day minimum**.
   - *The Trap*: If you write a 10 TB backup to Glacier Deep Archive and delete it 2 days later, AWS bills you for the full 180 days!
3. **Data Retrieval Fees**:
   - Moving data out of cold tiers incurs per-gigabyte retrieval charges (e.g., $\$0.01$ per GB for Standard-IA, $\$0.02$ per GB for Glacier Expedited).
4. **Data Egress (Transfer Out)**:
   - Moving data out of an AWS region to the public internet costs $\approx \$0.09$ per GB. Exporting a 100 TB dataset costs **$\$9,000$ in network egress alone.**

---

## 5. Governing Mathematical Formulations

### 1. Cloud Storage Total Cost of Ownership (TCO) Equation
Total monthly cost for cloud storage is governed by four cost vectors:

$$\text{Monthly Cost} = C_{\text{storage}} + C_{\text{requests}} + C_{\text{retrieval}} + C_{\text{egress}}$$

$$\text{Monthly Cost} = (S \times P_S) + \left(\frac{N_{\text{PUT}}}{1000} \times P_{\text{PUT}}\right) + \left(\frac{N_{\text{GET}}}{10000} \times P_{\text{GET}}\right) + (R \times P_R) + (E \times P_E)$$

Where:
- $S$: Gigabytes stored per month.
- $P_S$: Price per GB-month.
- $N_{\text{PUT}}, N_{\text{GET}}$: Count of API requests.
- $R$: Gigabytes retrieved from archival tiers.
- $E$: Gigabytes egressed across regions or to the internet.

---

## 6. Hands-on Linux Lab: Cloud Storage Benchmarking & Inspection

Run these commands on any AWS EC2 instance.

### Step 1: Benchmark Raw EBS Throughput & IOPS with `fio`
```bash
# Verify EBS block device name (e.g., /dev/nvme1n1)
lsblk

# Benchmark 4 KB random writes to measure provisioned IOPS limit
sudo fio --name=ebs-iops-test \
    --filename=/dev/nvme1n1 \
    --ioengine=libaio \
    --direct=1 \
    --rw=randwrite \
    --bs=4k \
    --iodepth=64 \
    --numjobs=4 \
    --runtime=30 \
    --time_based \
    --group_reporting
```

### Step 2: Measure Instance Network EBS Bandwidth Throttling
```bash
# Inspect whether the EC2 instance is experiencing EBS volume throttling
# Check CloudWatch / kernel disk stats for queue backpressure
cat /proc/diskstats | grep nvme1n1
```

### Step 3: Deploy Automated S3 Intelligent Lifecycle Policy
```bash
# Configure automatic transition from S3 Standard -> Glacier Deep Archive after 90 days
aws s3api put-bucket-lifecycle-configuration \
    --bucket enterprise-telemetry-archive \
    --lifecycle-configuration '{
        "Rules": [
            {
                "ID": "ArchiveOldLogs",
                "Status": "Enabled",
                "Filter": {"Prefix": "logs/"},
                "Transitions": [
                    {
                        "Days": 30,
                        "StorageClass": "STANDARD_IA"
                    },
                    {
                        "Days": 90,
                        "StorageClass": "DEEP_ARCHIVE"
                    }
                ]
            }
        ]
    }'
```

---

## 7. Real-World Production Failure Scenarios

### Failure Scenario 1: The Micro-Object S3 Billing Explosion
#### Incident
An IoT startup ingested sensor data from 50,000 devices. Each device uploaded a 200-byte JSON payload every 5 seconds directly to S3 Standard.
At the end of month 1, the company stored only $120\text{ GB}$ of data ($\approx \$2.76$ storage cost).
However, their AWS invoice arrived at **$\$12,960$**!

#### Root Cause
- Total requests per month:
  $$50,000\text{ devices} \times \frac{86,400\text{ s/day}}{5\text{ s}} \times 30\text{ days} = 2,592,000,000\text{ PUT requests}$$
- S3 charges $\$0.005$ per 1,000 `PUT` requests:
  $$\text{Request Cost} = \frac{2,592,000,000}{1,000} \times \$0.005 = \$12,960$$
- The startup paid $\$12,960$ for API calls to store $\$2.76$ worth of data!

#### Solution
Never write micro-objects directly to cloud object stores. Buffer, batch, and compress payloads at the edge or via Kafka/Kinesis, writing large $64\text{ MB} - 128\text{ MB}$ Parquet files to S3.

---

### Failure Scenario 2: Unexpected Data Loss on EC2 Instance Store
#### Incident
A developer configured a MongoDB primary database on an EC2 `i3en.2xlarge` instance using its internal 2.5 TB NVMe drive (`/dev/nvme1n1`), celebrating 250,000 IOPS.
Over the weekend, an engineer stopped the instance to upgrade CPU sizing. Upon starting the instance, **the entire 2.5 TB database was completely gone**.

#### Root Cause
The developer used the **EC2 Instance Store**:
- Instance Store NVMe drives are physical hardware modules inside the host rack.
- Stopping an instance releases the underlying physical host hardware back to the AWS pool.
- All Instance Store drives are cryptographically wiped upon instance stop.

#### Prevention Rule
Use Instance Store strictly for **ephemeral caches, scratch space, and stateless replicas**. Always place persistent database data on **EBS volumes** or replicate across independent database nodes.

---

## 8. Practical Engineering Exercises (With Solutions)

### Exercise: Multi-Cloud Cold Archive TCO Sizing
**Problem**: An enterprise must store **$600\text{ TB}$ of compliance audit logs** for 5 years. The data is rarely if ever read (estimated at 1% retrieval per year).
Compare the annual storage and retrieval costs between:
1. **Amazon S3 Standard**: $\$0.023$ per GB-month, $\$0.00$ retrieval fee.
2. **Amazon S3 Glacier Deep Archive**: $\$0.00099$ per GB-month, $\$0.02$ per GB retrieval fee.

#### Solution:
1. **S3 Standard Annual Cost**:
   $$\text{Storage Cost} = 600\text{ TB} \times 1,024\text{ GB/TB} \times \$0.023/\text{GB-mo} \times 12\text{ mo} \approx \$169,574/\text{year}$$
   $$\text{Retrieval Cost} = \$0$$
   $$\text{Total S3 Standard} \approx \$169,574/\text{year}$$
2. **S3 Glacier Deep Archive Annual Cost**:
   $$\text{Storage Cost} = 600\text{ TB} \times 1,024\text{ GB/TB} \times \$0.00099/\text{GB-mo} \times 12\text{ mo} \approx \$7,299/\text{year}$$
   $$\text{Retrieval Cost (1\% of 600 TB = 6 TB)} = 6 \times 1,024\text{ GB} \times \$0.02/\text{GB} = \$122.88$$
   $$\text{Total Glacier Deep Archive} \approx \$7,299 + \$123 = \$7,422/\text{year}$$
- **Engineering Conclusion**: Migrating cold compliance data from S3 Standard to Glacier Deep Archive saves **$\$162,152 per year** (a **95.6% cost reduction**), easily absorbing the minimal 1% retrieval penalty!

---

## 9. Summary Checklist & Key Takeaways

1. **Verify EBS-Optimized Caps**: Always match your EC2 instance bandwidth limits with your provisioned EBS IOPS and throughput.
2. **Never Write Micro-Objects to S3**: Batch small records into 64 MB+ files to avoid API request charges dwarfing storage costs.
3. **Instance Store is Ephemeral**: Use Instance Store for high-IOPS caches and temporary files; never use it for un-replicated persistent databases.
4. **Automate Lifecycle Transitions**: Move older objects to Standard-IA and Glacier Deep Archive to slash storage costs by $> 90\%$.
5. **Beware Minimum Retention Times**: Archival tiers enforce 90-to-180-day minimum billing durations; deleting early triggers penalty charges.
