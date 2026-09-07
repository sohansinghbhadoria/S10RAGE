import React, { type ReactNode } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import styles from './maintainers.module.css';

export default function Maintainers(): ReactNode {
  return (
    <Layout
      title="Project Maintainers | S10RAGE"
      description="Meet the core maintainers and leadership behind S10RAGE — All About Data Storage AI. Engineered."
    >
      <div className={styles.container}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.badge}>
            <span>👥</span>
            <span>CORE LEADERSHIP & AUTHORS</span>
          </div>
          <h1 className={styles.title}>
            Project <span className={styles.brandHighlight}>Maintainers</span>
          </h1>
          <p className={styles.subtitle}>
            The systems engineers and architects building and maintaining S10RAGE — the open-source technical reference for data storage engineering.
          </p>
        </header>

        {/* Maintainers Grid */}
        <div className={styles.cardsGrid}>
          <div className={styles.maintainerCard}>
            <div className={styles.cardHeader}>
              <div className={styles.avatarContainer}>
                SS
              </div>
              <div className={styles.nameBlock}>
                <h2 className={styles.name}>Sohan Singh</h2>
                <span className={styles.role}>Founder & Lead Maintainer</span>
              </div>
            </div>

            <p className={styles.bio}>
              Systems and storage architect passionate about high-performance data storage architectures, distributed systems, Linux kernel I/O mechanics, and educating the global engineering community on storage systems engineering from silicon physics to multi-region cloud scale.
            </p>

            <div className={styles.skillsSection}>
              <div className={styles.skillsTitle}>Areas of Focus</div>
              <div className={styles.skillPills}>
                <span className={styles.skillPill}>⚡ NVMe &amp; NVMe-oF</span>
                <span className={styles.skillPill}>🐧 Linux Kernel VFS &amp; I/O</span>
                <span className={styles.skillPill}>🌐 Lossless RDMA &amp; RoCEv2</span>
                <span className={styles.skillPill}>🐙 Ceph &amp; Distributed Storage</span>
                <span className={styles.skillPill}>☸️ Kubernetes CSI &amp; Cloud Storage</span>
                <span className={styles.skillPill}>🌲 Storage Engines (B-Tree &amp; LSM)</span>
                <span className={styles.skillPill}>❄️ Lakehouse Formats (Iceberg &amp; Parquet)</span>
              </div>
            </div>

            <div className={styles.linksBlock}>
              <a
                href="https://in.linkedin.com/in/amazinglysingh"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.linkedinBtn}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                </svg>
                <span>Connect on LinkedIn</span>
              </a>

              <a
                href="https://github.com/sohansinghbhadoria"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.githubBtn}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                <span>GitHub Profile</span>
              </a>
            </div>
          </div>
        </div>

        {/* Community Section */}
        <section className={styles.communitySection}>
          <h3 className={styles.communityTitle}>Contributing &amp; Getting Involved</h3>
          <p className={styles.communityDesc}>
            S10RAGE is an open-source technical reference built for the systems community. We welcome contributions, runbooks, real-world bug dissections, and peer reviews.
          </p>
          <div className={styles.communityActions}>
            <Link
              to="/docs/contributing"
              className={styles.actionBtn}
            >
              <span>🤝 Read Contributor Guide &amp; Add Modules</span>
            </Link>
            <Link
              to="https://github.com/sohansinghbhadoria/S10RAGE/issues"
              className={styles.actionBtn}
            >
              <span>💬 Suggest an Improvement or Topic</span>
            </Link>
            <Link
              to="https://github.com/sohansinghbhadoria/S10RAGE"
              className={styles.actionBtn}
            >
              <span>⭐ Star on GitHub</span>
            </Link>
          </div>
        </section>
      </div>
    </Layout>
  );
}
