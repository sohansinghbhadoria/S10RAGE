import React, { useState } from 'react';

interface Entry {
  key: string;
  val: string;
}

interface SSTable {
  id: string;
  level: number;
  keys: string[];
  bloomFilter: string[];
}

export default function LsmVisualizer(): React.JSX.Element {
  const [memTable, setMemTable] = useState<Entry[]>([
    { key: 'usr:101', val: 'Alice' },
    { key: 'usr:103', val: 'Charlie' },
  ]);
  const [wal, setWal] = useState<string[]>([
    'PUT usr:101 Alice',
    'PUT usr:103 Charlie',
  ]);
  const [sstables, setSstables] = useState<SSTable[]>([
    {
      id: 'sst_01',
      level: 0,
      keys: ['usr:090', 'usr:095'],
      bloomFilter: ['usr:090', 'usr:095'],
    },
    {
      id: 'sst_02',
      level: 1,
      keys: ['usr:010', 'usr:050', 'usr:080'],
      bloomFilter: ['usr:010', 'usr:050', 'usr:080'],
    },
  ]);
  const [logMessage, setLogMessage] = useState<string>(
    'Engine initialized. MemTable has 2 keys. WAL is synchronized to disk.'
  );

  const addEntry = () => {
    const nextId = Math.floor(Math.random() * 800) + 100;
    const key = `usr:${nextId}`;
    const names = ['Dave', 'Elena', 'Frank', 'Grace', 'Heidi', 'Ivan'];
    const val = names[Math.floor(Math.random() * names.length)];

    if (memTable.length >= 4) {
      setLogMessage(`⚠️ MemTable full (${memTable.length}/4 keys)! Flush to Level 0 SSTable before adding more.`);
      return;
    }

    const updatedMem = [...memTable, { key, val }].sort((a, b) => a.key.localeCompare(b.key));
    setMemTable(updatedMem);
    setWal((prev) => [...prev, `PUT ${key} ${val}`]);
    setLogMessage(`✍️ Appended to WAL (sequential disk I/O) and inserted into in-memory SkipList MemTable (${key} -> ${val}).`);
  };

  const flushMemTable = () => {
    if (memTable.length === 0) {
      setLogMessage('ℹ️ MemTable is currently empty; nothing to flush.');
      return;
    }

    const newSst: SSTable = {
      id: `sst_${Date.now().toString().slice(-4)}`,
      level: 0,
      keys: memTable.map((e) => e.key),
      bloomFilter: memTable.map((e) => e.key),
    };

    setSstables((prev) => [newSst, ...prev]);
    setMemTable([]);
    setWal([]);
    setLogMessage(`📦 Flushed MemTable as immutable SSTable [${newSst.id}] into Level 0. WAL truncated.`);
  };

  const triggerCompaction = () => {
    const l0Tables = sstables.filter((s) => s.level === 0);
    if (l0Tables.length === 0) {
      setLogMessage('ℹ️ No Level 0 SSTables found to compact.');
      return;
    }

    // Merge all L0 into a single sorted L1 SSTable
    const mergedKeys = Array.from(
      new Set(l0Tables.flatMap((s) => s.keys))
    ).sort();

    const compactedSst: SSTable = {
      id: `sst_L1_${Date.now().toString().slice(-4)}`,
      level: 1,
      keys: mergedKeys,
      bloomFilter: mergedKeys,
    };

    const remaining = sstables.filter((s) => s.level !== 0);
    setSstables([compactedSst, ...remaining]);
    setLogMessage(`⚡ Level Compaction complete! Merged ${l0Tables.length} overlapping L0 SSTable(s) into non-overlapping L1 SSTable [${compactedSst.id}].`);
  };

  const simulateRead = (targetKey: string) => {
    // 1. Check MemTable
    const inMem = memTable.find((e) => e.key === targetKey);
    if (inMem) {
      setLogMessage(`🎯 Read Hit in MemTable (RAM)! Retrieved ${targetKey} = '${inMem.val}' with 0 disk reads.`);
      return;
    }

    // 2. Check SSTables via Bloom Filter
    for (const sst of sstables) {
      if (sst.bloomFilter.includes(targetKey)) {
        setLogMessage(`🔍 Bloom Filter HIT for [${sst.id}] (Level ${sst.level})! Executed single block disk read to retrieve ${targetKey}.`);
        return;
      }
    }

    setLogMessage(`❌ Key ${targetKey} not found. Bloom filters on all SSTables returned negative, eliminating unnecessary disk block reads!`);
  };

  const resetAll = () => {
    setMemTable([
      { key: 'usr:101', val: 'Alice' },
      { key: 'usr:103', val: 'Charlie' },
    ]);
    setWal(['PUT usr:101 Alice', 'PUT usr:103 Charlie']);
    setSstables([
      { id: 'sst_01', level: 0, keys: ['usr:090', 'usr:095'], bloomFilter: ['usr:090', 'usr:095'] },
      { id: 'sst_02', level: 1, keys: ['usr:010', 'usr:050', 'usr:080'], bloomFilter: ['usr:010', 'usr:050', 'usr:080'] },
    ]);
    setLogMessage('Reset engine state to default.');
  };

  return (
    <div className="interactive-widget">
      <div className="interactive-widget-header">
        <div className="interactive-widget-title">
          <span>🔬</span>
          <span>LSM Tree Write & Compaction Simulator</span>
        </div>
        <span className="mdn-badge mdn-badge-blue">Live State Simulator</span>
      </div>

      <p style={{ fontSize: '0.92rem', color: 'var(--ifm-color-content-secondary)' }}>
        See how Log-Structured Merge Trees turn random application writes into sequential disk I/O, using in-memory <strong>MemTables</strong>, <strong>Write-Ahead Logs</strong>, and multi-level <strong>SSTable Compaction</strong> with Bloom filters.
      </p>

      {/* Controller Buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button
          onClick={addEntry}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: 'var(--ifm-color-primary)',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          ➕ Write Key (PUT)
        </button>

        <button
          onClick={flushMemTable}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: '6px',
            border: '1px solid var(--mdn-border)',
            backgroundColor: 'var(--mdn-bg-subtle)',
            color: 'var(--ifm-color-content)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          📦 Flush MemTable $\to$ L0
        </button>

        <button
          onClick={triggerCompaction}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: '6px',
            border: '1px solid var(--mdn-border)',
            backgroundColor: 'var(--mdn-bg-subtle)',
            color: 'var(--ifm-color-content)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          ⚡ Compact L0 $\to$ L1
        </button>

        <button
          onClick={() => simulateRead('usr:101')}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: '6px',
            border: '1px solid var(--mdn-border)',
            backgroundColor: 'var(--site-accent-glow)',
            color: 'var(--site-accent)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          🔍 GET usr:101
        </button>

        <button
          onClick={() => simulateRead('usr:999')}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: '6px',
            border: '1px solid var(--mdn-border)',
            backgroundColor: 'var(--mdn-bg-subtle)',
            color: 'var(--ifm-color-content)',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          🔍 GET Missing Key
        </button>

        <button
          onClick={resetAll}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: '6px',
            border: '1px solid var(--mdn-border)',
            backgroundColor: 'transparent',
            color: 'var(--ifm-color-content-secondary)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            marginLeft: 'auto',
          }}
        >
          Reset
        </button>
      </div>

      {/* Engine Status Log */}
      <div
        style={{
          padding: '0.75rem 1rem',
          backgroundColor: 'var(--mdn-code-bg)',
          borderRadius: '6px',
          borderLeft: '4px solid var(--ifm-color-primary)',
          fontFamily: 'var(--ifm-font-family-monospace)',
          fontSize: '0.84rem',
          marginBottom: '1.25rem',
          color: 'var(--ifm-color-content)',
        }}
      >
        {logMessage}
      </div>

      {/* Architecture Layout Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        {/* Memory Tier */}
        <div style={{ backgroundColor: 'var(--mdn-bg-subtle)', border: '1px solid var(--mdn-border)', borderRadius: '8px', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>🧠 In-Memory Tier (RAM)</span>
            <span className="mdn-badge mdn-badge-green">Volatile / Fast</span>
          </div>

          <div style={{ fontSize: '0.82rem', marginBottom: '0.4rem', color: 'var(--ifm-color-content-secondary)' }}>
            MemTable (SkipList): {memTable.length}/4 keys
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minHeight: '120px' }}>
            {memTable.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--ifm-color-content-secondary)', fontStyle: 'italic', fontSize: '0.82rem' }}>
                MemTable empty (flushed)
              </div>
            ) : (
              memTable.map((e) => (
                <div key={e.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0.6rem', backgroundColor: 'var(--mdn-card-bg)', border: '1px solid var(--mdn-border)', borderRadius: '4px', fontSize: '0.82rem', fontFamily: 'var(--ifm-font-family-monospace)' }}>
                  <span>{e.key}</span>
                  <span style={{ color: 'var(--ifm-color-primary)' }}>{e.val}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Disk Tier */}
        <div style={{ backgroundColor: 'var(--mdn-bg-subtle)', border: '1px solid var(--mdn-border)', borderRadius: '8px', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>💾 Persistent Tier (Disk / SSD)</span>
            <span className="mdn-badge mdn-badge-purple">Immutable SSTables</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--ifm-color-content-secondary)', marginBottom: '0.3rem' }}>
                Write-Ahead Log (WAL) — Sequential append
              </div>
              <div style={{ padding: '0.4rem 0.6rem', backgroundColor: 'var(--mdn-card-bg)', border: '1px solid var(--mdn-border)', borderRadius: '4px', fontSize: '0.78rem', fontFamily: 'var(--ifm-font-family-monospace)', color: 'var(--ifm-color-content-secondary)' }}>
                {wal.length === 0 ? 'WAL clean' : `${wal.length} uncommitted log records`}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--ifm-color-content-secondary)', marginBottom: '0.3rem' }}>
                SSTable Files (Sorted String Tables)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '150px', overflowY: 'auto' }}>
                {sstables.map((s) => (
                  <div key={s.id} style={{ padding: '0.4rem 0.6rem', backgroundColor: 'var(--mdn-card-bg)', border: '1px solid var(--mdn-border)', borderRadius: '4px', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                      <span style={{ fontWeight: 600 }}>{s.id} (Level {s.level})</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--site-accent)' }}>Bloom Filter: OK</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', fontFamily: 'var(--ifm-font-family-monospace)', color: 'var(--ifm-color-content-secondary)' }}>
                      Keys: [{s.keys.join(', ')}]
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
