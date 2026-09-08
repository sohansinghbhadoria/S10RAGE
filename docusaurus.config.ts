import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const config: Config = {
  title: 'S10RAGE',
  tagline: 'The Definitive MDN for Data Storage Engineering & Fundamentals',
  favicon: 'img/favicon.ico',
  headTags: [
    {
      tagName: 'link',
      attributes: {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/img/favicon.svg',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'apple-touch-icon',
        href: '/img/favicon.png',
      },
    },
  ],

  // Custom Domain GitHub Pages configuration
  url: 'https://s10rage.com',
  baseUrl: '/',
  organizationName: 'sohansinghbhadoria',
  projectName: 'S10RAGE',
  trailingSlash: false,

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  stylesheets: [
    {
      href: 'https://cdn.jsdelivr.net/npm/katex@0.13.24/dist/katex.min.css',
      type: 'text/css',
      integrity: 'sha384-odtC+0UGzzFL/6PNoE8rX/SPcQDXBJ+uRepguP4QkPCm2LBxH3FA3y+fKSiJ+AmM',
      crossorigin: 'anonymous',
    },
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/sohansinghbhadoria/S10RAGE/tree/main/',
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      /** @type {import("@easyops-cn/docusaurus-search-local").PluginOptions} */
      ({
        hashed: true,
        docsRouteBasePath: '/docs',
        indexBlog: false,
        highlightSearchTermsOnTargetPage: true,
      }),
    ],
  ],

  themeConfig: {
    image: 'img/s10rage-social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: true,
      },
    },
    navbar: {
      title: '',
      logo: {
        alt: 'S10RAGE — Data Storage AI',
        src: 'img/logo-dark.png',
        srcDark: 'img/logo-dark.png',
        height: 36,
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'storageSidebar',
          position: 'left',
          label: '📚 Storage Modules (18 Core)',
        },
        {
          type: 'dropdown',
          label: '⚡ Core Pillars',
          position: 'left',
          items: [
            {
              label: '⚡ Physical Layer & SSD Internals',
              to: '/docs/physical-layer/memory-hierarchy',
            },
            {
              label: '🖥️ Linux Kernel I/O & Page Cache',
              to: '/docs/os-subsystem/page-cache-vfs',
            },
            {
              label: '🌲 Storage Engines (B-Tree vs LSM)',
              to: '/docs/storage-engines/b-trees',
            },
            {
              label: '🌐 Distributed Consensus & Quorum',
              to: '/docs/distributed-storage/consistent-hashing-quorum',
            },
            {
              label: '🗄️ Database Storage Internals',
              to: '/docs/database-architecture/row-vs-columnar',
            },
            {
              label: '📦 Formats, Parquet & Compression',
              to: '/docs/formats-and-compression/parquet-avro-arrow',
            },
            {
              label: '🧠 Caching & Eviction Policies',
              to: '/docs/caching/eviction-policies',
            },
          ],
        },
        {
          type: 'dropdown',
          label: '🔬 Interactive Tools',
          position: 'left',
          items: [
            {
              label: '⏱️ Latency Numbers Explorer',
              to: '/docs/interactive/latency-explorer',
            },
            {
              label: '🧭 Storage Engine Decision Matrix',
              to: '/docs/interactive/storage-engine-matrix',
            },
            {
              label: '🔬 LSM Compaction Visualizer',
              to: '/docs/interactive/lsm-visualizer',
            },
          ],
        },
        {
          type: 'dropdown',
          label: '🚀 Protocols & Deep Dives',
          position: 'left',
          items: [
            {
              label: '🌐 Lossless RDMA, RoCEv2 & Infiniband',
              to: '/docs/storage-networking/rdma-infiniband-roce-lossless',
            },
            {
              label: '🔌 Protocols: SAS, SATA, NVMe & NVMe-oF',
              to: '/docs/interfaces-and-protocols/storage-protocol-specifications-nvme-nvmeof',
            },
            {
              label: '📂 File Storage: NFSv3, v4 & Ganesha',
              to: '/docs/interfaces-and-protocols/nfs-architecture-and-ganesha',
            },
            {
              label: '🧱 Block Storage & Benchmarks (FIO, Vdbench)',
              to: '/docs/block-storage-and-raid/block-device-ops-and-benchmarking',
            },
            {
              label: '🪣 Object Storage & Lakehouses (s5cmd, COSBench)',
              to: '/docs/object-storage/object-storage-benchmarking-and-tools',
            },
            {
              label: '🐍 Python Storage Testing (pynvme, ceph-nvmeof)',
              to: '/docs/storage-python/python-storage-ecosystem-and-testing',
            },
            {
              label: '🗄️ Databases on Storage (MySQL & MongoDB)',
              to: '/docs/database-storage/database-storage-block-file-object',
            },
            {
              label: '❄️ Data Lakehouse (Iceberg, Hudi, Parquet)',
              to: '/docs/formats-and-compression/lakehouse-iceberg-hudi-parquet',
            },
          ],
        },
        {
          type: 'dropdown',
          label: '🛠️ I/O Tools Suite',
          position: 'left',
          items: [
            {
              label: '📊 Overview & Tool Selection Matrix',
              to: '/docs/io-tools/overview',
            },
            {
              label: '⚡ 1. FIO (Flexible I/O Tester)',
              to: '/docs/io-tools/fio',
            },
            {
              label: '☕ 2. VDBench (Enterprise Block/File)',
              to: '/docs/io-tools/vdbench',
            },
            {
              label: '💾 3. DD (POSIX Baseline & Direct I/O)',
              to: '/docs/io-tools/dd',
            },
            {
              label: '🚀 4. Elbencho (Distributed NVMe & S3)',
              to: '/docs/io-tools/elbencho',
            },
            {
              label: '📁 5. Filebench (WML App Profiles)',
              to: '/docs/io-tools/filebench',
            },
            {
              label: '🏢 6. HCIBench (VMware vSAN & HCI)',
              to: '/docs/io-tools/hcibench',
            },
            {
              label: '🪣 7. S3cmd (S3 Admin & Scripting)',
              to: '/docs/io-tools/s3cmd',
            },
            {
              label: '⚡ 8. S5cmd (High-Speed Parallel S3)',
              to: '/docs/io-tools/s5cmd',
            },
            {
              label: '☁️ 9. AWS CLI (aws s3 & s3api)',
              to: '/docs/io-tools/awscli',
            },
          ],
        },
        {
          type: 'dropdown',
          label: '🤖 AI Modules',
          position: 'left',
          items: [
            {
              label: '📖 AI Terminologies Glossary',
              to: '/docs/ai-engineering/ai-terminologies-glossary',
            },
            {
              label: '🧠 1. AI & LLM Foundations',
              to: '/docs/ai-engineering/overview',
            },
            {
              label: '🔬 2. ChatGPT Query Lifecycle',
              to: '/docs/ai-engineering/query-lifecycle',
            },
            {
              label: '📐 3. RAG Architecture & Vector Math',
              to: '/docs/ai-engineering/rag-architecture',
            },
            {
              label: '🤖 4. Agentic AI & Tool Calling',
              to: '/docs/ai-engineering/agentic-ai-frameworks',
            },
            {
              label: '💻 5. Local LLMs with Ollama',
              to: '/docs/ai-engineering/local-llms-ollama',
            },
            {
              label: '🧪 6. Lab: Local RAG Pipeline',
              to: '/docs/ai-engineering/hands-on-rag-pipeline',
            },
            {
              label: '🛠️ 7. Lab: Autonomous Agent Tools',
              to: '/docs/ai-engineering/hands-on-agentic-tools',
            },
            {
              label: '⚡ 8. Lab: Streamlit AI Studio',
              to: '/docs/ai-engineering/interactive-apps-streamlit',
            },
          ],
        },
        {
          to: '/docs/intro',
          label: '📖 Introduction',
          position: 'left',
        },
        {
          to: '/maintainers',
          label: '👥 Maintainers',
          position: 'left',
        },
        {
          to: '/docs/contributing',
          label: '🤝 Contributing',
          position: 'left',
        },
        {
          href: 'https://github.com/sohansinghbhadoria/S10RAGE',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Storage Pillars',
          items: [
            {
              label: 'Physical & SSD Internals',
              to: '/docs/physical-layer/memory-hierarchy',
            },
            {
              label: 'Kernel & io_uring',
              to: '/docs/os-subsystem/io-uring-vs-epoll',
            },
            {
              label: 'B-Trees vs LSM Trees',
              to: '/docs/storage-engines/lsm-trees',
            },
            {
              label: 'Row vs Columnar (OLAP)',
              to: '/docs/database-architecture/row-vs-columnar',
            },
          ],
        },
        {
          title: 'Interactive Tools',
          items: [
            {
              label: 'Latency Numbers Explorer',
              to: '/docs/interactive/latency-explorer',
            },
            {
              label: 'Engine Decision Matrix',
              to: '/docs/interactive/storage-engine-matrix',
            },
            {
              label: 'LSM Compaction Visualizer',
              to: '/docs/interactive/lsm-visualizer',
            },
          ],
        },
        {
          title: 'Project & Leadership',
          items: [
            {
              label: '👥 Maintainers',
              to: '/maintainers',
            },
            {
              label: '🤝 Contributor Guide',
              to: '/docs/contributing',
            },
            {
              label: 'LinkedIn (Sohan Singh)',
              href: 'https://in.linkedin.com/in/amazinglysingh',
            },
            {
              label: 'GitHub Repository',
              href: 'https://github.com/sohansinghbhadoria/S10RAGE',
            },
            {
              label: 'GitHub Actions CI',
              href: 'https://github.com/sohansinghbhadoria/S10RAGE/actions',
            },
          ],
        },
      ],
      logo: {
        alt: 'S10RAGE — Data Storage AI',
        src: 'img/logo-dark.png',
        href: '/',
        width: 170,
      },
      copyright: `Copyright © ${new Date().getFullYear()} S10RAGE. Data Storage AI.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ['bash', 'rust', 'c', 'cpp', 'python', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
