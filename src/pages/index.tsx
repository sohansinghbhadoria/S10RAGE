import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import LatencyExplorer from '@site/src/components/Interactive/LatencyExplorer';
import StorageEngineMatrix from '@site/src/components/Interactive/StorageEngineMatrix';

import styles from './index.module.css';

const PILLARS = [
  {
    icon: '⚡',
    title: '1. Hardware & Physical Layer',
    desc: 'Memory hierarchies, NAND Flash cell physics (SLC/TLC/QLC), FTL wear leveling, NVMe over PCIe, and mechanical disk seeking.',
    link: '/docs/physical-layer/memory-hierarchy',
    sublinks: [
      { label: 'Memory Hierarchy & Latencies', url: '/docs/physical-layer/memory-hierarchy' },
      { label: 'NAND Flash, FTL & SSDs', url: '/docs/physical-layer/ssd-nand-ftl' },
      { label: 'HDDs & Magnetic Media', url: '/docs/physical-layer/hdds-and-magnetic-media' },
    ],
  },
  {
    icon: '🖥️',
    title: '2. Kernel & OS Subsystem',
    desc: 'How the Linux kernel abstracts block devices: VFS dentries/inodes, dirty page writeback, io_uring ring buffers, and O_DIRECT.',
    link: '/docs/os-subsystem/page-cache-vfs',
    sublinks: [
      { label: 'VFS & The Page Cache', url: '/docs/os-subsystem/page-cache-vfs' },
      { label: 'io_uring vs epoll vs AIO', url: '/docs/os-subsystem/io-uring-vs-epoll' },
      { label: 'Direct I/O, mmap & Zero-Copy', url: '/docs/os-subsystem/direct-io-and-mmap' },
    ],
  },
  {
    icon: '🌲',
    title: '3. Storage Engines & Data Structures',
    desc: 'The computational primitives organizing data on disk: B+ Tree slotted pages, LSM SSTables, Bloom filters, and segmented logs.',
    link: '/docs/storage-engines/b-trees',
    sublinks: [
      { label: 'B-Trees & B+ Trees', url: '/docs/storage-engines/b-trees' },
      { label: 'LSM Trees & Compaction', url: '/docs/storage-engines/lsm-trees' },
      { label: 'Append-Only Segmented Logs', url: '/docs/storage-engines/append-only-logs' },
    ],
  },
  {
    icon: '🗄️',
    title: '4. Database Storage Architectures',
    desc: 'Transactional durability and analytical engines: Row vs Columnar (OLTP vs OLAP), WAL & ARIES recovery, and MVCC snapshot isolation.',
    link: '/docs/database-architecture/row-vs-columnar',
    sublinks: [
      { label: 'Row vs Columnar (OLAP)', url: '/docs/database-architecture/row-vs-columnar' },
      { label: 'WAL & ARIES Crash Recovery', url: '/docs/database-architecture/wal-and-aries' },
      { label: 'MVCC & ACID Isolation', url: '/docs/database-architecture/mvcc-and-acid' },
    ],
  },
  {
    icon: '🌐',
    title: '5. Distributed Storage & Consensus',
    desc: 'Scaling persistence across fault-prone networks: Consistent hashing rings, tunable quorums (R+W>N), Raft state machines, and S3.',
    link: '/docs/distributed-storage/consistent-hashing-quorum',
    sublinks: [
      { label: 'Consistent Hashing & Quorum', url: '/docs/distributed-storage/consistent-hashing-quorum' },
      { label: 'Raft Consensus Protocol', url: '/docs/distributed-storage/raft-consensus' },
      { label: 'Object Storage & S3 Internals', url: '/docs/distributed-storage/object-storage-s3-internals' },
    ],
  },
  {
    icon: '📦',
    title: '6. Formats & Compression',
    desc: 'Binary encoding efficiency: Apache Parquet Dremel shredding, Apache Arrow in-memory IPC, and Zstandard / LZ4 compression.',
    link: '/docs/formats-and-compression/parquet-avro-arrow',
    sublinks: [
      { label: 'Parquet, Avro & Arrow', url: '/docs/formats-and-compression/parquet-avro-arrow' },
      { label: 'Compression & Encodings', url: '/docs/formats-and-compression/compression-algorithms' },
    ],
  },
  {
    icon: '🧠',
    title: '7. Caching & Memory Management',
    desc: 'Algorithms and topologies for high-speed caching: ARC, W-TinyLFU, Cache-Aside vs Write-Behind, and cache stampede solutions.',
    link: '/docs/caching/eviction-policies',
    sublinks: [
      { label: 'Eviction: LRU to W-TinyLFU', url: '/docs/caching/eviction-policies' },
      { label: 'Caching Topologies & Patterns', url: '/docs/caching/caching-topologies' },
    ],
  },
];

const STORAGE_MODULES = [
  { num: '01', title: 'Intro to Data Storage', desc: 'Data vs information, storage hierarchy, capacity, IOPS, latency, and Linux benchmark tools.', url: '/docs/introduction/fundamentals-and-metrics' },
  { num: '02', title: 'How Storage Actually Works', desc: 'App to disk I/O path, blocks, sectors, 4K alignment, RMW penalty, and page cache profiling.', url: '/docs/storage-mechanics/io-path-and-caching' },
  { num: '03', title: 'Storage Media (HDD, SSD, NVMe)', desc: 'Platters and seek times vs NAND flash physics, FTL wear leveling, garbage collection, and TRIM.', url: '/docs/storage-media/hdd-ssd-nvme' },
  { num: '04', title: 'Interfaces & Protocols', desc: 'SATA, SAS, Fibre Channel SAN, iSCSI, and hands-on NFS server configuration.', url: '/docs/interfaces-and-protocols/protocols-and-nfs' },
  { num: '05', title: 'Filesystems Deep-Dive', desc: 'Inodes, directory trees, ext4 vs XFS vs Btrfs vs ZFS, journaling, and mount tuning.', url: '/docs/filesystems/ext4-xfs-btrfs-zfs' },
  { num: '06', title: 'Block Storage, LVM & RAID', desc: 'Linux device mapper, LVM PV/VG/LV, RAID 0/1/5/6/10 write penalty, and disk failure simulation.', url: '/docs/block-storage-and-raid/lvm-raid-linux' },
  { num: '07', title: 'Object Storage Internals', desc: 'Block vs File vs Object, S3 architecture, versioning, multipart uploads, and local MinIO lab.', url: '/docs/object-storage/s3-architecture-and-minio' },
  { num: '08', title: 'Distributed Storage', desc: 'Replication models, quorum calculus (R+W>N), sharding, and Reed-Solomon Erasure Coding.', url: '/docs/distributed-storage/replication-and-erasure-coding' },
  { num: '09', title: 'Ceph in Practice', desc: 'RADOS, MON, OSD BlueStore, CRUSH map determinism, RBD block devices, and cluster recovery.', url: '/docs/ceph-in-practice/ceph-architecture-and-operations' },
  { num: '10', title: 'Databases & Storage', desc: 'Slotted pages, B-Tree vs LSM, Write Amplification Factor, ARIES WAL crash recovery.', url: '/docs/databases-and-storage/engine-tradeoffs-and-wal' },
  { num: '11', title: 'Performance & fio', desc: 'Workload characterization, Little’s Law, queue depth tuning, and enterprise fio benchmark suites.', url: '/docs/performance-engineering/fio-benchmarking-and-profiling' },
  { num: '12', title: 'Data Protection & DR', desc: 'Backup vs replication, CoW vs RoW snapshots, RPO & RTO formulas, and 3-2-1 backup strategies.', url: '/docs/data-protection/backup-dr-and-snapshots' },
  { num: '13', title: 'Cloud Storage (AWS/Azure/GCP)', desc: 'EBS gp3/io2 vs Managed Disks vs GCS, object lifecycle tiering, and cloud invoice optimization.', url: '/docs/cloud-storage/aws-azure-gcp-comparison' },
  { num: '14', title: 'Kubernetes Storage & CSI', desc: 'PV, PVC, StorageClasses, Container Storage Interface plugins, and StatefulSet database lab.', url: '/docs/kubernetes-storage/csi-pv-pvc-statefulsets' },
  { num: '15', title: 'Storage Security & Compliance', desc: 'LUKS block encryption, TLS in-transit, POSIX ACLs, IAM, and NIST SP 800-88 crypto-shredding.', url: '/docs/storage-security/encryption-iam-and-compliance' },
  { num: '16', title: 'Architecture & System Design', desc: '6-factor storage tradeoffs, capacity planning, and reference patterns for FinTech & streaming.', url: '/docs/architecture-and-design/system-design-patterns' },
  { num: '17', title: 'Troubleshooting Runbook', desc: 'Diagnostic playbooks: Inode exhaustion, latency spikes, degraded RAID, and slow Ceph OSDs.', url: '/docs/troubleshooting/real-world-storage-runbook' },
  { num: '18', title: 'Final Capstone Project', desc: 'Design a 100 TB multi-region storage platform: 30% growth, 99.99% SLA, hybrid DB + object.', url: '/docs/capstone-project/enterprise-storage-platform' },
];

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();

  return (
    <Layout
      title={`${siteConfig.title} — The MDN for Data Storage Engineering`}
      description="The definitive open-source reference guide for data storage fundamentals, hardware physics, storage engines, database architectures, and distributed consensus."
    >
      {/* Hero Header */}
      <header className={styles.heroContainer}>
        <div className={styles.heroTag}>
          <span>📖</span>
          <span>DATA STORAGE ENGINEERING MODULES</span>
        </div>
        <h1 className={styles.heroTitle}>
          Data Storage. <br />
          <span className={styles.brandHighlight}>Documented for Systems Engineers.</span>
        </h1>
        <p className={styles.heroSubtitle}>
          Complete reference documentation and interactive simulators: Linux, Filesystems, RAID, Ceph, Cloud, and Kubernetes. Zero fluff, production-tested.
        </p>
        <div className={styles.ctaButtons}>
          <Link className={styles.primaryBtn} to="/docs/introduction/fundamentals-and-metrics">
            <span>Explore Modules (Module 01)</span>
            <span>→</span>
          </Link>
          <Link className={styles.secondaryBtn} to="/docs/interactive/latency-explorer">
            <span>⏱️ Latency Explorer</span>
          </Link>
          <Link className={styles.secondaryBtn} to="/docs/interactive/storage-engine-matrix">
            <span>🧭 Engine Decision Matrix</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main>
        {/* Technical Modules Section */}
        <section className={styles.courseSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Modules</h2>
            <p className={styles.sectionSubtitle}>
              From Linux kernel I/O mechanics and RAID to Ceph, Cloud, and Kubernetes storage engineering. 18 comprehensive technical modules.
            </p>
          </div>

          <div className={styles.courseGrid}>
            {STORAGE_MODULES.map((mod) => (
              <Link key={mod.num} to={mod.url} className={styles.courseCard}>
                <div>
                  <div className={styles.courseNumber}>MODULE {mod.num}</div>
                  <h3 className={styles.courseTitle}>{mod.title}</h3>
                  <p className={styles.courseDesc}>{mod.desc}</p>
                </div>
                <div className={styles.courseAction}>
                  <span>Read Module</span>
                  <span>→</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Interactive Highlight Section */}
        <section className={styles.interactiveSection}>
          <div className={styles.interactiveContainer}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Mechanical Sympathy in Real Time</h2>
              <p className={styles.sectionSubtitle}>
                Explore the physical latencies separating registers from persistent flash and spinning disks.
              </p>
            </div>
            <LatencyExplorer />
          </div>
        </section>

        {/* 7 Pillars Grid */}
        <section className={styles.pillarsSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Deep-Dive Architectural Pillars</h2>
            <p className={styles.sectionSubtitle}>
              Specialized technical reference encyclopedia across 7 core domains.
            </p>
          </div>

          <div className={styles.pillarsGrid}>
            {PILLARS.map((pillar) => (
              <div key={pillar.title} className={styles.pillarCard}>
                <div>
                  <div className={styles.pillarIcon}>{pillar.icon}</div>
                  <h3 className={styles.pillarCardTitle}>{pillar.title}</h3>
                  <p className={styles.pillarCardDesc}>{pillar.desc}</p>
                </div>
                <div className={styles.pillarLinks}>
                  {pillar.sublinks.map((sub) => (
                    <Link key={sub.url} to={sub.url} className={styles.subLink}>
                      <span>→</span>
                      <span>{sub.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Storage Decision Matrix Section */}
        <section className={styles.interactiveSection}>
          <div className={styles.interactiveContainer}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Engine Decision Engine</h2>
              <p className={styles.sectionSubtitle}>
                Evaluate the RUM conjecture trade-offs for your specific workload.
              </p>
            </div>
            <StorageEngineMatrix />
          </div>
        </section>
      </main>
    </Layout>
  );
}
