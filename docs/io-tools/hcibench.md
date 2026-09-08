---
id: hcibench
title: "HCIBench: Automated VMware vSAN & HCI Performance Appliance"
sidebar_label: "6. HCIBench (VMware vSAN & HCI)"
sidebar_position: 7
---

# HCIBench: Automated VMware vSAN & HCI Performance Appliance

> **Origin**: Developed by VMware Performance Engineering.  
> **Applicability**: Hyper-Converged Infrastructure (HCI), VMware vSAN (Original & Express Storage Architecture - ESA), VMware Cloud Foundation (VCF), and traditional vSphere VMFS/NFS datastores.

HCIBench (Hyper-converged Infrastructure Benchmark) is an automated benchmarking appliance packaged as an Open Virtual Appliance (OVA). It coordinates the deployment of **multiple guest VMs, auto-configures virtual disks, orchestrates distributed Vdbench or FIO workloads, applies Storage Policy Based Management (SPBM), and parses vSAN backend performance metrics into unified HTML reports**.

---

## 1. Architecture: Automated Orchestration Engine

```
+----------------------------------------------------------------------------+
|                          HCIBench Controller (OVA)                         |
|   - Web UI (Port 8443) / REST API                                          |
|   - Workload Coordinator (Ruby / Python / Ansible Engine)                  |
+-------------------------------------+--------------------------------------+
                                      |
               +----------------------+----------------------+
               | Deploy Guest VMs via vCenter REST API       |
               v                                             v
+-----------------------------+               +-----------------------------+
| Worker VM 01                |               | Worker VM N                 |
| - Debian Guest OS           |               | - Debian Guest OS           |
| - Virtual Disks (vmdk 1..M) | <--- Test --->| - Virtual Disks (vmdk 1..M) |
| - Local FIO / Vdbench       |               | - Local FIO / Vdbench       |
+--------------+--------------+               +--------------+--------------+
               |                                             |
               +----------------------+----------------------+
                                      |
                                      v
+----------------------------------------------------------------------------+
|                  vSphere vSAN Datastore (RAID-1 / RAID-5/6)               |
|            - Storage Policy Based Management (SPBM) Enforced               |
|            - Performance Service Collector (vsan-perfsvc)                 |
+----------------------------------------------------------------------------+
```

---

## 2. Appliance Deployment & Access

1. Deploy `HCIBench_X.X.X.ova` onto your ESXi cluster via vCenter.
2. Assign static or DHCP IP, Netmask, Gateway, and Root password.
3. Access Web UI: `https://<HCIBENCH_IP>:8443`
4. Access SSH Terminal: `ssh root@<HCIBENCH_IP>`

---

## 3. The 10 Essential HCIBench Workload Snippets & Automation

### Snippet 1: Appliance Health Check & Service Verification
*Objective*: Verify that the HCIBench automation services, vCenter connectivity, and test runner daemons are operational.

```bash
# Check status of HCIBench web server and test executor
systemctl status hcibench-web
systemctl status hcibench-controller

# Test network latency and reachability to vCenter Server
curl -k -I https://vcenter.lab.corp/sdk
```

---

### Snippet 2: REST API Cluster Discovery
*Objective*: Programmatically discover vCenter clusters, datastores, and storage policies via the HCIBench REST API.

```bash
curl -k -X POST https://localhost:8443/api/vcenter/discover \
  -H "Content-Type: application/json" \
  -d '{
    "vcenter": "vcenter.lab.corp",
    "username": "administrator@vsphere.local",
    "password": "VMware123!Password",
    "datacenter": "Datacenter-01",
    "cluster": "vSAN-Cluster-01"
  }'
```

---

### Snippet 3: Sizing Guest VM Specification File (`guest-vm-spec.cfg`)
*Objective*: Define the worker VM footprint, CPU allocation, RAM, and virtual disk targets.

Create `/opt/automation/conf/guest-vm-spec.cfg`:
```ini
[vm_spec]
vm_prefix = HCIBench-Worker
num_vms = 8
num_vcpus_per_vm = 4
ram_mb_per_vm = 4096
num_data_disks_per_vm = 4
disk_size_gb = 50
datastore_name = vsanDatastore
storage_policy = "vSAN Default Storage Policy"
network_name = "VM Network"
```

---

### Snippet 4: Automated "Easy Run" Baseline Configuration
*Objective*: Execute VMware's automated multi-profile qualification sequence (evaluates 4K random read, 4K random write, 8K 70/30, and 64K throughput sequentially).

```bash
# Trigger Easy Run via CLI automation script
/opt/automation/bin/launch_easy_run.sh \
  --cluster "vSAN-Cluster-01" \
  --datastore "vsanDatastore" \
  --duration 3600 \
  --cleanup true
```

---

### Snippet 5: 100% Sequential Write Throughput Profile (`seq_write_max.cfg`)
*Objective*: Measure peak write bandwidth of the vSAN cluster with 256 KiB blocks to identify write-cache and network saturation thresholds.

Create `/opt/automation/workloads/seq_write_max.cfg`:
```text
sd=sd1,lun=/dev/sdb,openflag=o_direct
sd=sd2,lun=/dev/sdc,openflag=o_direct
wd=wd1,sd=(sd1,sd2),xfersize=256k,rdpct=0,seekpct=0
rd=rd1,wd=wd1,iorate=max,elapsed=600,warmup=60,interval=5
```

---

### Snippet 6: 100% Random Read 4 KiB Peak IOPS Profile
*Objective*: Maximize read IOPS across all worker VMs to determine the hardware limit of the NVMe caching tier.

Create `/opt/automation/workloads/rand_read_peak.cfg`:
```text
sd=sd1,lun=/dev/sdb,openflag=o_direct,threads=32
sd=sd2,lun=/dev/sdc,openflag=o_direct,threads=32
wd=wd1,sd=(sd1,sd2),xfersize=4k,rdpct=100,seekpct=100
rd=rd1,wd=wd1,iorate=max,elapsed=300,warmup=30,interval=5
```

---

### Snippet 7: 70/30 Mixed R/W Database Simulation with SPBM Deduplication
*Objective*: Test realistic production database traffic with vSAN Deduplication and Compression enabled to characterize Write Amplification.

Create `/opt/automation/workloads/oltp_vsan_spbm.cfg`:
```text
sd=sd1,lun=/dev/sdb,openflag=o_direct,threads=16
sd=sd2,lun=/dev/sdc,openflag=o_direct,threads=16
wd=wd1,sd=(sd1,sd2),xfersize=8k,rdpct=70,seekpct=100
rd=rd1,wd=wd1,iorate=max,elapsed=900,warmup=120,interval=5,dedupratio=2.5,compratio=1.8
```

---

### Snippet 8: Automated Worker VM Teardown & Disk Cleanup
*Objective*: Destroy all spawned guest worker VMs, unbind storage policies, and reclaim all temporary vmdk capacity after benchmark completion.

```bash
# Execute standalone cleanup utility
/opt/automation/bin/clean_vms.sh \
  --vcenter "vcenter.lab.corp" \
  --cluster "vSAN-Cluster-01" \
  --vm_prefix "HCIBench-Worker" \
  --delete_vmdk true \
  --force true
```

---

### Snippet 9: Scale-Out Stress Benchmark (16 VMs x 8 Disks)
*Objective*: Perform a cluster-wide stress run scaling to 128 virtual disks to assess tail latency (P95/P99) under heavy contention.

```bash
/opt/automation/bin/launch_custom_run.sh \
  --vms 16 \
  --disks_per_vm 8 \
  --profile /opt/automation/workloads/oltp_vsan_spbm.cfg \
  --runtime 1800 \
  --vsan_perfsvc_interval 20
```

---

### Snippet 10: Parsing Performance Results & vSAN Metric Bundles
*Objective*: Extract summary throughput, average latency, and backend disk group wait times from HCIBench tarballs.

```bash
# Unpack latest results bundle
cd /opt/automation/results
LATEST_RUN=$(ls -t | head -n 1)
tar -xzf ${LATEST_RUN}/res.tar.gz -C /tmp/run_res

# View parsed summary flatfile
cat /tmp/run_res/summary.txt

# Extract vSAN performance service counter statistics
python3 /opt/automation/lib/parse_perfsvc.py \
  --input /tmp/run_res/vsan-perfsvc-bundle.zip \
  --metric "diskgroup_write_buffer_free"
```

---

## 4. Key Metrics to Watch in vSAN Reports

- **Frontend VM Latency vs Backend Disk Group Latency**:
  If VM latency is high ($>10\text{ ms}$) but disk group latency is low ($<1\text{ ms}$), the bottleneck is inside the guest OS or vSphere hypervisor scheduling queue.
- **Congestion Points (`rcongestion`, `wcongestion`)**:
  vSAN throttles incoming guest writes when the write buffer cache fills faster than it can destage to the capacity tier. Any nonzero congestion value indicates destage starvation.
