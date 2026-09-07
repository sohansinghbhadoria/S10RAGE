# S10RAGE — The MDN for Data Storage Engineering 🚀

[![Production Website](https://img.shields.io/badge/Live-s10rage.com-blue?style=for-the-badge&logo=google-chrome&logoColor=white)](https://s10rage.com)
[![Maintainer: Sohan Singh](https://img.shields.io/badge/Lead%20Maintainer-Sohan%20Singh-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://in.linkedin.com/in/amazinglysingh)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Docusaurus 3](https://img.shields.io/badge/Docusaurus-3.7-3ECC5F?style=for-the-badge&logo=docusaurus&logoColor=white)](https://docusaurus.io/)

> **All About Data Storage. Data Storage AI. Engineered.**
> An open-source, production-grade technical documentation portal for systems engineers, database architects, and storage professionals. From silicon physics and NAND flash to Linux kernel VFS, distributed consensus, and cloud-native storage.

---

## 🌐 Live Platform & Links

- **Official Website**: [https://s10rage.com](https://s10rage.com)
- **Interactive Documentation**: [https://s10rage.com/docs/intro](https://s10rage.com/docs/intro)
- **Contributor Guide**: [CONTRIBUTING.md](./CONTRIBUTING.md) or [s10rage.com/docs/contributing](https://s10rage.com/docs/contributing)
- **Core Maintainers**: [s10rage.com/maintainers](https://s10rage.com/maintainers)

---

## 🏛️ The 7 Core Pillars

1. **⚡ Physical Layer & Hardware Media**: Memory hierarchy, NAND flash, FTL, wear leveling, NVMe PCIe lanes, and magnetic media physics.
2. **🐧 Kernel & OS Storage Subsystem**: Linux VFS, Page Cache writeback, `io_uring` vs `epoll`, Direct I/O (`O_DIRECT`), and `mmap`.
3. **🌲 Storage Engines & Data Structures**: B+ Trees, LSM Trees, SSTables, Bloom filters, and Write-Ahead Logging (ARIES).
4. **🌐 Storage Networking & Enterprise Protocols**: Lossless RDMA (RoCEv2 / InfiniBand), NVMe-oF, SAS, SATA, and NFSv4 / Ganesha.
5. **🗄️ Database Storage Architectures**: Row-oriented (OLTP) vs Columnar (OLAP), MVCC, snapshot isolation, and Lakehouse table formats (Iceberg, Parquet).
6. **🐙 Distributed Storage & Consensus**: Raft, Paxos, Quorum, Ceph (CRUSH, BlueStore), MinIO, and S3 internals.
7. **☸️ Cloud & Kubernetes Storage**: CSI plugins, PersistentVolumes, StatefulSets, Rook-Ceph, and volume topologies.

---

## 🔬 Interactive Visual Tools

S10RAGE features interactive in-browser engineering visualizers:
- **⏱️ Latency Numbers Explorer**: Interactive visualization of storage latency scales from CPU L1 cache (1 ns) to multi-region cloud WAN (150 ms).
- **🧭 Storage Engine Decision Matrix**: Interactive filterable matrix comparing B-Trees, LSM-Trees, and Append-Only Logs for various workloads.
- **🔬 LSM Compaction Visualizer**: Step-by-step visualization of memtable flushes and tiered/leveled SSTable compaction.

---

## 🤝 Contributing & Adding Modules

We actively welcome contributions from the systems engineering community!

Whether you want to add a runbook on a real-world Ceph outage, author a deep-dive module on NVMe over Fabrics, or create an interactive simulation:

👉 **Please read our [Contributor Guide (CONTRIBUTING.md)](./CONTRIBUTING.md)** or open it on the web at **[s10rage.com/docs/contributing](https://s10rage.com/docs/contributing)** for step-by-step instructions on module naming, frontmatter, diagrams, and PR submission.

---

## 💻 Local Development

### Prerequisites
- Node.js >= 18.0
- npm >= 9.0

### Setup
```bash
# 1. Clone repository
git clone https://github.com/sohansinghbhadoria/S10RAGE.git
cd S10RAGE

# 2. Install dependencies
npm install

# 3. Start local development server
npm run start
```
The site will start at `http://localhost:3000`.

### Production Build & Link Check
```bash
npm run build
```
This compiles the static assets into `build/` and verifies 100% link integrity.

---

## 👥 Leadership & Project Maintainers

- **Founder & Lead Maintainer**: **Sohan Singh**
  - LinkedIn: [in/amazinglysingh](https://in.linkedin.com/in/amazinglysingh)
  - GitHub: [@sohansinghbhadoria](https://github.com/sohansinghbhadoria)

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
