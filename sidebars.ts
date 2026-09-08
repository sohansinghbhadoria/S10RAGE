import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  storageSidebar: [
    {
      type: 'doc',
      id: 'intro',
      label: '📖 Introduction & Overview',
    },
    {
      type: 'doc',
      id: 'contributing',
      label: '🤝 Contributor Guide & Adding Modules',
    },
    {
      type: 'category',
      label: '📦 Storage Engineering Modules',
      collapsed: false,
      items: [
        'introduction/fundamentals-and-metrics',
        'storage-mechanics/io-path-and-caching',
        'storage-media/hdd-ssd-nvme',
        'interfaces-and-protocols/protocols-and-nfs',
        'interfaces-and-protocols/storage-protocol-specifications-nvme-nvmeof',
        'filesystems/ext4-xfs-btrfs-zfs',
        'block-storage-and-raid/lvm-raid-linux',
        'object-storage/s3-architecture-and-minio',
        'distributed-storage/replication-and-erasure-coding',
        'ceph-in-practice/ceph-architecture-and-operations',
        'databases-and-storage/engine-tradeoffs-and-wal',
        'performance-engineering/fio-benchmarking-and-profiling',
        'data-protection/backup-dr-and-snapshots',
        'cloud-storage/aws-azure-gcp-comparison',
        'kubernetes-storage/csi-pv-pvc-statefulsets',
        'storage-security/encryption-iam-and-compliance',
        'architecture-and-design/system-design-patterns',
        'troubleshooting/real-world-storage-runbook',
        'reference-architecture/enterprise-storage-platform',
      ],
    },
    {
      type: 'category',
      label: '🛠️ Storage I/O Tools & Benchmarking Suite',
      collapsed: false,
      items: [
        'io-tools/overview',
        'io-tools/fio',
        'io-tools/vdbench',
        'io-tools/dd',
        'io-tools/elbencho',
        'io-tools/filebench',
        'io-tools/hcibench',
        'io-tools/s3cmd',
        'io-tools/s5cmd',
        'io-tools/awscli',
      ],
    },
    {
      type: 'category',
      label: '🤖 AI Engineering & Agentic Systems',
      collapsed: false,
      items: [
        'ai-engineering/ai-terminologies-glossary',
        'ai-engineering/overview',
        'ai-engineering/query-lifecycle',
        'ai-engineering/rag-architecture',
        'ai-engineering/agentic-ai-frameworks',
        'ai-engineering/local-llms-ollama',
        'ai-engineering/hands-on-rag-pipeline',
        'ai-engineering/hands-on-agentic-tools',
        'ai-engineering/interactive-apps-streamlit',
      ],
    },
    {
      type: 'category',
      label: '🛠️ Interactive Reference Tools',
      collapsed: false,
      items: [
        'interactive/latency-explorer',
        'interactive/storage-engine-matrix',
        'interactive/lsm-visualizer',
      ],
    },
    {
      type: 'category',
      label: '🌐 Storage Networking & Lossless RDMA',
      collapsed: true,
      items: [
        'storage-networking/rdma-infiniband-roce-lossless',
      ],
    },
    {
      type: 'category',
      label: '🔌 Protocols: SAS, SATA, NVMe, NVMe-oF & NFS',
      collapsed: true,
      items: [
        'interfaces-and-protocols/protocols-and-nfs',
        'interfaces-and-protocols/storage-protocol-specifications-nvme-nvmeof',
        'interfaces-and-protocols/nfs-architecture-and-ganesha',
      ],
    },
    {
      type: 'category',
      label: '🧱 Block Storage Operations & Benchmarking',
      collapsed: true,
      items: [
        'block-storage-and-raid/lvm-raid-linux',
        'block-storage-and-raid/block-device-ops-and-benchmarking',
      ],
    },
    {
      type: 'category',
      label: '⚡ Hardware & Physical Layer',
      collapsed: true,
      items: [
        'physical-layer/memory-hierarchy',
        'physical-layer/ssd-nand-ftl',
        'physical-layer/hdds-and-magnetic-media',
      ],
    },
    {
      type: 'category',
      label: '🖥️ Kernel & OS Subsystems',
      collapsed: true,
      items: [
        'os-subsystem/page-cache-vfs',
        'os-subsystem/io-uring-vs-epoll',
        'os-subsystem/direct-io-and-mmap',
      ],
    },
    {
      type: 'category',
      label: '🌲 Storage Engines & Data Structures',
      collapsed: true,
      items: [
        'storage-engines/b-trees',
        'storage-engines/lsm-trees',
        'storage-engines/append-only-logs',
      ],
    },
    {
      type: 'category',
      label: '🗄️ Database Storage Architectures',
      collapsed: true,
      items: [
        'database-architecture/row-vs-columnar',
        'database-architecture/wal-and-aries',
        'database-architecture/mvcc-and-acid',
        'database-storage/database-storage-block-file-object',
      ],
    },
    {
      type: 'category',
      label: '🌐 Distributed & Object Storage',
      collapsed: true,
      items: [
        'distributed-storage/consistent-hashing-quorum',
        'distributed-storage/raft-consensus',
        'distributed-storage/object-storage-s3-internals',
        'object-storage/s3-architecture-and-minio',
        'object-storage/object-storage-benchmarking-and-tools',
      ],
    },
    {
      type: 'category',
      label: '📦 Formats, Compression & Data Lakehouses',
      collapsed: true,
      items: [
        'formats-and-compression/parquet-avro-arrow',
        'formats-and-compression/compression-algorithms',
        'formats-and-compression/lakehouse-iceberg-hudi-parquet',
      ],
    },
    {
      type: 'category',
      label: '🐍 Python Storage Engineering & Testing',
      collapsed: true,
      items: [
        'storage-python/python-storage-ecosystem-and-testing',
      ],
    },
    {
      type: 'category',
      label: '🧠 Caching & Memory Management',
      collapsed: true,
      items: [
        'caching/eviction-policies',
        'caching/caching-topologies',
      ],
    },
  ],
};

export default sidebars;
