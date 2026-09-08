---
id: csi-pv-pvc-statefulsets
title: "14. Kubernetes Storage Architecture: CSI Specification, PV/PVC & StatefulSets"
sidebar_label: 14. Kubernetes Storage
sidebar_position: 14
---

# 14. Kubernetes Storage Architecture: CSI Specification, PV/PVC & StatefulSets

> **Prerequisites**: Module 01 (Storage Metrics), Module 04 (Block vs. File Protocols), Module 06 (LVM & Block Layer).  
> **Target Audience**: Kubernetes Platform Engineers, SREs, Cloud Native Architects, and DevOps Engineers managing stateful container workloads.

Containers are designed to be ephemeral and immutable: when a container crashes or is rescheduled by the Kubernetes scheduler to another worker node, all state written to its local container write-layer (`overlayfs`) is permanently destroyed.

Kubernetes persistent storage decouples application data lifetimes from pod execution lifecycles through a modular abstraction hierarchy (**StorageClass**, **PersistentVolume**, **PersistentVolumeClaim**) and the standardized **Container Storage Interface (CSI)** specification.

---

## 1. The Core Abstraction Hierarchy: SC, PV, PVC & VolumeSnapshot

Kubernetes separates storage administration from developer consumption:

```
Cluster Storage Administrator (Defines Storage Infrastructure)
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ StorageClass (SC): ebs-gp3-sc                          │
│  - Provisioner: ebs.csi.aws.com                        │
│  - Parameters: type=gp3, iops=3000, throughput=125     │
│  - volumeBindingMode: WaitForFirstConsumer             │
│  - allowVolumeExpansion: true                          │
└───────────────────────┬────────────────────────────────┘
                        │ Dynamic Provisioning
                        ▼
Application Developer (Requests Storage via PVC)
┌────────────────────────────────────────────────────────┐
│ PersistentVolumeClaim (PVC): data-postgres-0           │
│  - Requests: storage: 100Gi                            │
│  - AccessMode: ReadWriteOnce                           │
│  - StorageClassName: ebs-gp3-sc                        │
└───────────────────────┬────────────────────────────────┘
                        │ Binds 1-to-1
                        ▼
Kubernetes Cluster Resource (Created Automatically by CSI)
┌────────────────────────────────────────────────────────┐
│ PersistentVolume (PV): pvc-7a419b2e-2026-09-08        │
│  - Actual physical volume ID: vol-09f48201a4e          │
│  - Status: Bound                                       │
│  - ReclaimPolicy: Delete (or Retain)                   │
└───────────────────────┬────────────────────────────────┘
                        │ Mounts into container
                        ▼
┌────────────────────────────────────────────────────────┐
│ StatefulSet Pod: postgres-0                            │
│  - Mount Path: /var/lib/postgresql/data                │
└────────────────────────────────────────────────────────┘
```

### Access Modes Defined
1. **`ReadWriteOnce` (RWO)**: The volume can be mounted as read-write by a **single node**. Multiple pods residing on the *exact same* worker node can share it, but pods on different nodes cannot. (Standard for block storage: AWS EBS, Azure Disk, Ceph RBD).
2. **`ReadWriteOncePod` (RWOP)**: Introduced in Kubernetes 1.22+. Restricts read-write access to a **single pod across the entire cluster**. Guarantees zero split-brain data corruption.
3. **`ReadOnlyMany` (ROX)**: The volume can be mounted read-only by multiple pods across multiple worker nodes simultaneously.
4. **`ReadWriteMany` (RWX)**: The volume can be mounted read-write by multiple pods across multiple worker nodes simultaneously. **Requires network file systems (NFSv4, CephFS, AWS EFS, Azure Files).**

---

## 2. The Container Storage Interface (CSI) Architecture

Prior to Kubernetes 1.13, all volume plugins were compiled directly into the Kubernetes core repository ("In-Tree"). Adding support for a new storage array required updating the entire Kubernetes source code.

Today, storage is managed via the out-of-tree **Container Storage Interface (CSI)** specification:

```
Control Plane / Controller Nodes                           Worker Node (kubelet)
┌──────────────────────────────────────────────┐        ┌────────────────────────────────────────┐
│ Kubernetes API Server & Volume Controller    │        │ kubelet (Running Pod container)        │
└──────────────────────┬───────────────────────┘        └───────────────────┬────────────────────┘
                       │                                                    │
        ┌──────────────┴──────────────┐                                     │
        ▼                             ▼                                     ▼
┌───────────────────────────┐ ┌───────────────────────┐ ┌────────────────────────────────────────┐
│ csi-provisioner (Sidecar) │ │ csi-attacher (Sidecar)│ │ csi-node-driver (DaemonSet on Host)    │
│ Watches PVCs -> calls:    │ │ Watches VolumeAttach: │ │ Unix Domain Socket: /var/lib/kubelet/  │
│ 1. CreateVolume()         │ │ 2. ControllerPublish()│ │ 3. NodeStageVolume() (Format Ext4/XFS) │
│ (Calls AWS/GCP Storage API│ │ (Attaches EBS to EC2) │ │ 4. NodePublishVolume() (Bind-mount)    │
└───────────────────────────┘ └───────────────────────┘ └────────────────────────────────────────┘
```

### The 4 gRPC Stages of a Volume Lifecycle
When a pod requesting storage is scheduled, the CSI driver executes four sequential gRPC RPC calls:

1. **`CreateVolume`**: Triggered by `csi-provisioner`. Calls the storage provider's control API (e.g., AWS EC2 `CreateVolume`) to allocate the raw disk.
2. **`ControllerPublishVolume`**: Triggered by `csi-attacher`. Attaches the storage volume to the specific physical worker node instance (e.g., `AttachVolume` to EC2 instance ID).
3. **`NodeStageVolume`**: Triggered on the worker node by `kubelet`. If the block device is unformatted, formats the disk with the specified filesystem (Ext4 or XFS) and mounts it to a global directory (`/var/lib/kubelet/plugins/kubernetes.io/csi/...`).
4. **`NodePublishVolume`**: Triggered by `kubelet`. Executes a Linux bind-mount (`mount -o bind`) from the global staging directory directly into the pod’s container mount namespace (`/var/lib/kubelet/pods/<pod-uuid>/volumes/...`).

---

## 3. StatefulSets vs. Deployments: VolumeClaimTemplates

Using standard `Deployments` with persistent volumes is a dangerous anti-pattern:
- A `Deployment` shares a single PVC across all replicas. If a Deployment scales to 3 replicas with an EBS volume (RWO), replicas 2 and 3 will crash with `Multi-Attach error for volume`.
- A **StatefulSet** provides stable pod network identifiers (`postgres-0`, `postgres-1`, `postgres-2`) and pairs with **`volumeClaimTemplates`**:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: "postgres"
  replicas: 3
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgresql
        image: postgres:16
        volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: [ "ReadWriteOnce" ]
      storageClassName: "ebs-gp3-sc"
      resources:
        requests:
          storage: 50Gi
```

### What `volumeClaimTemplates` Does:
- When `postgres-0` is created, Kubernetes dynamically provisions a unique PVC: `data-postgres-0`.
- When `postgres-1` is created, Kubernetes provisions an independent PVC: `data-postgres-1`.
- If `postgres-0` crashes and is rescheduled to a different physical worker node, Kubernetes reattaches the existing `data-postgres-0` volume to the new node, preserving data integrity.

---

## 4. Volume Binding Modes: Immediate vs. WaitForFirstConsumer

```
VolumeBindingMode: Immediate (The Topology Trap!)
Step 1: Admin applies PVC. StorageClass allocates EBS volume IMMEDIATELY in Availability Zone us-east-1a.
Step 2: Developer schedules Pod. Pod requires GPU or CPU nodes available ONLY in us-east-1b!
Step 3: SCHEDULING DEADLOCK! Pod is stuck in Pending forever!

VolumeBindingMode: WaitForFirstConsumer (Topology Sympathy!)
Step 1: Admin applies PVC. Kubernetes delays storage creation.
Step 2: Developer schedules Pod. Kubernetes Scheduler chooses an optimal node in us-east-1b.
Step 3: StorageClass provisions the EBS volume strictly inside us-east-1b! Pod starts cleanly!
```

> [!IMPORTANT]
> **Always configure `volumeBindingMode: WaitForFirstConsumer`** on cloud block storage classes (AWS EBS, GCP Persistent Disk, Azure Managed Disks). This prevents cross-AZ scheduling deadlocks by ensuring volumes are provisioned in the exact Availability Zone where the pod is scheduled.

---

## 5. Hands-on Linux & Kubernetes Lab: CSI Management & Online Resizing

### Step 1: Define an Enterprise Production StorageClass
```yaml
# storageclass.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: enterprise-gp3
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true   # Enables online zero-downtime disk resizing!
parameters:
  type: gp3
  iops: "5000"
  throughput: "250"
  encrypted: "true"
```

Apply the configuration:
```bash
kubectl apply -f storageclass.yaml
```

### Step 2: Dynamically Expand a Volume Without Pod Restart
```bash
# 1. Edit the active PVC to increase storage from 50Gi to 100Gi
kubectl patch pvc data-postgres-0 -p '{"spec":{"resources":{"requests":{"storage":"100Gi"}}}}'

# 2. Watch the CSI Resizer controller expand the volume online
kubectl describe pvc data-postgres-0 | grep -E 'FileSystemResize|Storage'

# 3. Verify inside the running pod that the filesystem expanded automatically
kubectl exec -it postgres-0 -- df -h /var/lib/postgresql/data
```

---

## 6. Real-World Production Failure Scenarios

### Failure Scenario 1: The Multi-Attach Error Deadlock
#### Incident
A worker node running a production Redis StatefulSet crashed due to hardware failure. The Kubernetes control plane attempted to reschedule the Redis pod to another healthy worker node.
The pod remained stuck in `ContainerCreating` for **over 30 minutes** with the error:
`Multi-Attach error for volume "pvc-...": Volume is already exclusively attached to one node and can't be attached to another`.

#### Root Cause
- The failed worker node was unresponsive, but AWS EC2 still listed the EBS volume as attached to the dead instance.
- The `csi-attacher` could not safely detach the volume without verification from the dead kubelet, fearing split-brain data corruption.

#### Remediation Playbook
1. If the node is permanently dead, force-delete the node resource to signal to the volume controller that it is safe to tear down the attachment:
   ```bash
   kubectl delete node <crashed-node-name>
   ```
2. Manually detach the volume using the cloud CLI:
   ```bash
   aws ec2 detach-volume --volume-id <vol-id> --force
   ```
3. The `csi-attacher` will immediately pick up the detached volume and attach it to the new worker node.

---

### Failure Scenario 2: Permission Denied on Root-Mounted Storage Volumes
#### Incident
A developer deployed a non-root container (`runAsUser: 10001`). The pod crashed on boot with:
`java.io.FileNotFoundException: /data/db.lock (Permission denied)`.

#### Root Cause
When the CSI driver formats and mounts an Ext4 or XFS volume, the root directory of the mounted filesystem is owned by `root:root` with permissions `0755`. A non-root user cannot write to it.

#### Solution: `fsGroup` Security Context
Configure `fsGroup` in the pod's `securityContext`:
```yaml
spec:
  securityContext:
    fsGroup: 10001
    fsGroupChangePolicy: "OnRootMismatch"  # Skips chown if permissions already match (avoids slow boots!)
```
Kubernetes automatically updates the group ownership of the mounted filesystem to GID `10001` during the `NodePublishVolume` stage.

---

## 7. Practical Engineering Exercises (With Solutions)

### Exercise: Sizing Online PVC Volume Expansion
**Problem**: A PostgreSQL StatefulSet running on Kubernetes has a 100 GiB PVC that is currently 92% full. The StorageClass has `allowVolumeExpansion: true`.
1. What command expands the storage to 200 GiB?
2. Does the pod need to be terminated or restarted during the expansion process?
3. What sequence of operations does the Kubernetes control plane and node agent execute during expansion?

#### Solution:
1. **Expansion Command**:
   ```bash
   kubectl patch pvc data-postgres-0 -p '{"spec":{"resources":{"requests":{"storage":"200Gi"}}}}'
   ```
2. **Zero Downtime**: The pod does **not** need to be terminated. Modern Linux CSI drivers and filesystems (Ext4 via `resize2fs`, XFS via `xfs_growfs`) support fully online live filesystem expansion.
3. **Internal Sequence**:
   - `csi-resizer` sidecar intercepts the PVC patch and calls cloud API `ControllerExpandVolume()` (e.g., AWS EBS `ModifyVolume` from 100 GiB to 200 GiB).
   - Once cloud storage completes block expansion, `kubelet` on the worker node detects the larger block device.
   - `kubelet` calls `NodeExpandVolume()`, which invokes the filesystem resizing utility directly on the mounted directory without interrupting active database transactions.

---

## 8. Summary Checklist & Key Takeaways

1. **Always Use `WaitForFirstConsumer`**: Prevents cross-Availability Zone scheduling deadlocks for cloud block storage.
2. **Deploy StatefulSets for Persistent Workloads**: Never use Deployments with shared RWO volumes; leverage `volumeClaimTemplates`.
3. **Enable `allowVolumeExpansion`**: Ensure all production StorageClasses support dynamic zero-downtime volume resizing.
4. **Use `fsGroupChangePolicy: OnRootMismatch`**: Prevents slow pod restarts caused by recursive file permission traversals on large volumes.
5. **Use `ReadWriteOncePod` for High-Security State**: Enforce strict single-pod exclusive volume locking in Kubernetes 1.22+.
