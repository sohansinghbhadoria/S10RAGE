---
id: csi-pv-pvc-statefulsets
title: 14. Kubernetes Storage & CSI
sidebar_label: 14. Kubernetes Storage
sidebar_position: 14
---

# 14. Kubernetes Storage & CSI

Containers are ephemeral by default. When a pod crashes or is rescheduled to another worker node, all data written to its local container root layer is permanently lost. Kubernetes persistent storage solves this by decoupling state from container lifecycles.

---

## 1. The Core Abstractions: StorageClass, PV & PVC

```
Developer / Application Pod
            │
            ▼ Mounts Volume
PersistentVolumeClaim (PVC)  <─── Application claims: "I need 50Gi with ReadWriteOnce"
            │
            ▼ Matches dynamically
StorageClass (SC)            <─── Defines provisioner (e.g. ebs.csi.aws.com, rook-ceph)
            │
            ▼ CSI Driver provisions
PersistentVolume (PV)        <─── Actual cluster resource: AWS EBS volume / Ceph RBD
```

- **StorageClass (SC)**: Defines the storage provisioner plugin and volume parameters (e.g., volume type, IOPS, filesystem type).
- **PersistentVolume (PV)**: A cluster-scoped storage resource provisioned statically by an admin or dynamically by a StorageClass.
- **PersistentVolumeClaim (PVC)**: A namespace-scoped request for storage by a user, specifying size, access mode, and StorageClass.

### Access Modes
- **`ReadWriteOnce` (RWO)**: Volume can be mounted as read-write by a single node. (Standard block devices like EBS, Azure Disk, Ceph RBD).
- **`ReadOnlyMany` (ROX)**: Volume can be mounted as read-only by multiple nodes simultaneously.
- **`ReadWriteMany` (RWX)**: Volume can be mounted as read-write by multiple nodes simultaneously. (Requires distributed filesystems like NFS, CephFS, or EFS).

---

## 2. Container Storage Interface (CSI) Architecture

CSI standardizes storage integration across container orchestrators via gRPC:

```
Kubernetes Control Plane
  │
  ├── external-provisioner  ──► CSI Controller: CreateVolume / DeleteVolume
  ├── external-attacher     ──► CSI Controller: ControllerPublishVolume (Attach disk to node)
  │
Worker Node (Kubelet)
  │
  └── CSI Node Plugin       ──► NodeStageVolume (Format disk, mount to global dir)
                            ──► NodePublishVolume (Bind mount into Pod directory)
```

---

## 3. StatefulSets vs. Deployments

- **Deployments**: Designed for stateless apps. All pod replicas share identical specs. If replicas request a PVC, they all attempt to mount the *exact same* single volume (failing for RWO block devices).
- **StatefulSets**: Designed for stateful databases (PostgreSQL, Kafka, Redis).
  - Provides stable, unique network identities (`postgres-0`, `postgres-1`).
  - Provides the **`volumeClaimTemplates`** array: Kubernetes dynamically provisions a dedicated, independent PV and PVC for every single pod replica!

---

## 4. Hands-on Lab: Deploying a Resilient Stateful Database on Kubernetes

### Step 1: Define a High-Performance StorageClass
```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-nvme-storage
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
parameters:
  type: gp3
  iops: "5000"
  throughput: "250"
```

> [!NOTE]
> `volumeBindingMode: WaitForFirstConsumer` delays volume provisioning until a pod is scheduled to a specific node, ensuring the storage volume is created in the exact same Availability Zone as the worker node.

### Step 2: Deploy a PostgreSQL StatefulSet
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres-db
spec:
  serviceName: "postgres-svc"
  replicas: 2
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
        image: postgres:16-alpine
        env:
        - name: POSTGRES_PASSWORD
          value: "<CHANGE_ME_DATABASE_PASSWORD>"
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: db-persistent-data
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
  - metadata:
      name: db-persistent-data
    spec:
      accessModes: [ "ReadWriteOnce" ]
      storageClassName: "fast-nvme-storage"
      resources:
        requests:
          storage: 20Gi
```

### Step 3: Inspect Kubernetes Storage Resources
```bash
# Verify pods, PVCs, and PVs
kubectl get pods -l app=postgres
kubectl get pvc
kubectl get pv
```
