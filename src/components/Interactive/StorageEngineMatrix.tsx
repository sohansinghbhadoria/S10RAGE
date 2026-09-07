import React, { useState } from 'react';

interface EngineProfile {
  name: string;
  architecture: string;
  idealFor: string[];
  readAmp: 'Low (1-3 I/Os)' | 'Medium (Bloom-filtered)' | 'High (Scan across runs)' | 'None (RAM)';
  writeAmp: 'High (Random in-place updates)' | 'Low (Sequential Append)' | 'Batched (MergeTree)' | 'None (RAM)';
  spaceAmp: 'Medium (50% fill factor)' | 'Low (Compacted)' | 'Very Low (Columnar compression)' | 'High (Pointer overhead)';
  examples: string[];
  description: string;
}

const ENGINES: Record<string, EngineProfile> = {
  'b-tree': {
    name: 'B+ Tree Engine',
    architecture: 'In-Place Updating Page-Based Tree (B+ Tree)',
    idealFor: ['read-heavy', 'point-queries', 'acid-oltp'],
    readAmp: 'Low (1-3 I/Os)',
    writeAmp: 'High (Random in-place updates)',
    spaceAmp: 'Medium (50% fill factor)',
    examples: ['PostgreSQL (heap + B-Tree)', 'MySQL InnoDB', 'SQLite', 'LMDB'],
    description: 'Pages are updated in-place using a buffer pool. Reads require traversing root to leaf ($O(\\log N)$). Ideal for read-heavy OLTP workloads with strong ACID requirements.',
  },
  'lsm-tree': {
    name: 'Log-Structured Merge Tree (LSM)',
    architecture: 'Append-Only Multi-Level Sorted String Tables (SSTables)',
    idealFor: ['write-heavy', 'time-series', 'distributed-nosql'],
    readAmp: 'Medium (Bloom-filtered)',
    writeAmp: 'Low (Sequential Append)',
    spaceAmp: 'Low (Compacted)',
    examples: ['RocksDB', 'Apache Cassandra', 'LevelDB', 'CockroachDB (Pebble)', 'ScyllaDB'],
    description: 'Writes are written sequentially to a Write-Ahead Log (WAL) and memory table (MemTable), then flushed to disk as immutable SSTables. Compaction merges runs in the background. Exceptional write throughput.',
  },
  'columnar': {
    name: 'Column-Oriented Engine',
    architecture: 'Decomposed Vectorized Column Chunks + Dictionary/RLE Compression',
    idealFor: ['olap-analytics', 'aggregations', 'data-warehouse'],
    readAmp: 'Low (Only reads queried columns)',
    writeAmp: 'Batched (MergeTree)',
    spaceAmp: 'Very Low (Columnar compression)',
    examples: ['ClickHouse', 'DuckDB', 'Apache Parquet / Arrow', 'Snowflake', 'BigQuery'],
    description: 'Stores data by column rather than row. Vectorized SIMD execution and high compression ratios (up to 10x with ZSTD/Gorilla). Ideal for scanning billions of rows for analytical aggregations.',
  },
  'segmented-log': {
    name: 'Append-Only Segmented Log',
    architecture: 'Sequential Byte Stream with Sparse Offset Indexing',
    idealFor: ['event-streaming', 'ordered-pubsub', 'immutable-ledger'],
    readAmp: 'Low (Sequential sequential prefetch)',
    writeAmp: 'Low (Sequential Append)',
    spaceAmp: 'Low (Zero fragmentation)',
    examples: ['Apache Kafka', 'Apache Pulsar', 'Redpanda', 'Apache BookKeeper'],
    description: 'Data is strictly appended sequentially to active segments. Clients read via monotonically increasing 64-bit offsets using zero-copy (sendfile / splice) directly from OS page cache to network socket.',
  },
  'in-memory': {
    name: 'In-Memory Key-Value Engine',
    architecture: 'RAM-Resident SkipList, Radix Tree & Hash Table',
    idealFor: ['sub-millisecond', 'caching', 'fast-session'],
    readAmp: 'None (RAM)',
    writeAmp: 'None (RAM)',
    spaceAmp: 'High (Pointer overhead)',
    examples: ['Redis', 'Dragonfly', 'Memcached', 'Aerospike'],
    description: 'Avoids disk I/O completely for read/write execution, relying on asynchronous snapshotting (RDB) and append-only journals (AOF) for persistence. Delivers sub-millisecond latencies.',
  },
};

export default function StorageEngineMatrix(): React.JSX.Element {
  const [workload, setWorkload] = useState<'oltp' | 'write' | 'olap' | 'streaming' | 'cache'>('write');

  let selectedEngineKey = 'lsm-tree';
  if (workload === 'oltp') selectedEngineKey = 'b-tree';
  else if (workload === 'write') selectedEngineKey = 'lsm-tree';
  else if (workload === 'olap') selectedEngineKey = 'columnar';
  else if (workload === 'streaming') selectedEngineKey = 'segmented-log';
  else if (workload === 'cache') selectedEngineKey = 'in-memory';

  const engine = ENGINES[selectedEngineKey];

  return (
    <div className="interactive-widget">
      <div className="interactive-widget-header">
        <div className="interactive-widget-title">
          <span>🧭</span>
          <span>Storage Engine Architecture Decision Matrix</span>
        </div>
        <span className="mdn-badge mdn-badge-purple">Interactive Tool</span>
      </div>

      <p style={{ fontSize: '0.92rem', color: 'var(--ifm-color-content-secondary)' }}>
        Storage engines make fundamental trade-offs governed by the <strong>RUM Conjecture</strong> (Read, Update, Memory/Space). Select your workload profile to explore the optimal storage structure:
      </p>

      {/* Selector Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', marginBottom: '1.5rem' }}>
        {[
          { id: 'oltp', label: 'Point Reads & ACID OLTP', icon: '🔍' },
          { id: 'write', label: 'Write-Heavy Ingestion', icon: '⚡' },
          { id: 'olap', label: 'Analytical Scans (OLAP)', icon: '📊' },
          { id: 'streaming', label: 'Event Streaming Log', icon: '📜' },
          { id: 'cache', label: 'Sub-ms Memory Cache', icon: '🚀' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setWorkload(item.id as any)}
            style={{
              padding: '0.75rem',
              borderRadius: '8px',
              border: workload === item.id ? '2px solid var(--ifm-color-primary)' : '1px solid var(--mdn-border)',
              backgroundColor: workload === item.id ? 'var(--mdn-badge-bg)' : 'var(--mdn-bg-subtle)',
              color: 'var(--ifm-color-content)',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
            <span style={{ fontWeight: 600, fontSize: '0.86rem' }}>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Selected Engine Details */}
      <div style={{ backgroundColor: 'var(--mdn-bg-subtle)', border: '1px solid var(--mdn-border)', borderRadius: '10px', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--ifm-color-primary)' }}>{engine.name}</h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--ifm-color-content-secondary)' }}>{engine.architecture}</span>
          </div>
          <span className="mdn-badge mdn-badge-green">Optimal Fit</span>
        </div>

        <p style={{ fontSize: '0.92rem', lineHeight: '1.6', marginBottom: '1rem' }}>{engine.description}</p>

        {/* Matrix Comparison Table */}
        <table style={{ margin: '0.75rem 0' }}>
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Characteristics & Trade-off</th>
              <th>Impact</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Read Amplification</strong></td>
              <td>{engine.readAmp}</td>
              <td><span className="mdn-badge mdn-badge-blue">Read Path</span></td>
            </tr>
            <tr>
              <td><strong>Write Amplification</strong></td>
              <td>{engine.writeAmp}</td>
              <td><span className="mdn-badge mdn-badge-purple">NAND Wear / Throughput</span></td>
            </tr>
            <tr>
              <td><strong>Space Amplification</strong></td>
              <td>{engine.spaceAmp}</td>
              <td><span className="mdn-badge mdn-badge-amber">Disk Footprint</span></td>
            </tr>
          </tbody>
        </table>

        {/* Production Systems */}
        <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--mdn-border)' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--ifm-color-content-secondary)' }}>
            Notable Production Systems:
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
            {engine.examples.map((ex) => (
              <span key={ex} style={{ fontSize: '0.82rem', padding: '0.2rem 0.6rem', backgroundColor: 'var(--mdn-card-bg)', border: '1px solid var(--mdn-border)', borderRadius: '4px', fontWeight: 500 }}>
                {ex}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
