import React, { useState } from 'react';

interface LatencyItem {
  id: string;
  name: string;
  category: 'cpu' | 'memory' | 'storage' | 'network';
  nanoseconds: number;
  description: string;
  hardware: string;
}

const LATENCY_DATA: LatencyItem[] = [
  {
    id: 'l1',
    name: 'L1 Cache Reference',
    category: 'cpu',
    nanoseconds: 0.5,
    description: 'Fetching an instruction or scalar from on-die L1 data cache.',
    hardware: 'CPU Core (L1d)',
  },
  {
    id: 'branch',
    name: 'Branch Mispredict',
    category: 'cpu',
    nanoseconds: 5,
    description: 'Pipeline flush & speculative execution rewind.',
    hardware: 'Branch Target Buffer',
  },
  {
    id: 'l2',
    name: 'L2 Cache Reference',
    category: 'cpu',
    nanoseconds: 7,
    description: 'Fetching from unified L2 core cache (~512KB - 1MB per core).',
    hardware: 'CPU Core (L2)',
  },
  {
    id: 'mutex',
    name: 'Mutex Lock / Unlock',
    category: 'cpu',
    nanoseconds: 25,
    description: 'Uncontended atomic compare-and-swap (CAS) operation.',
    hardware: 'CPU Cache Coherency (MESI)',
  },
  {
    id: 'dram',
    name: 'Main Memory (DRAM) Access',
    category: 'memory',
    nanoseconds: 100,
    description: 'DDR4/DDR5 memory controller access (CAS latency + transfer).',
    hardware: 'DIMM / Memory Bus',
  },
  {
    id: 'zstd_compress',
    name: 'Compress 1KB with Zstandard',
    category: 'cpu',
    nanoseconds: 2000,
    description: 'Lempel-Ziv + FSE fast compression pass on modern CPU.',
    hardware: 'SIMD / CPU registers',
  },
  {
    id: 'nvme_4k_read',
    name: 'NVMe Gen4 SSD 4KB Random Read',
    category: 'storage',
    nanoseconds: 10000,
    description: 'PCIe 4.0 x4 bus traversal + NAND Flash die cell read.',
    hardware: 'NVMe controller + 3D TLC',
  },
  {
    id: 'sata_ssd_read',
    name: 'SATA SSD Random 4KB Read',
    category: 'storage',
    nanoseconds: 150000,
    description: 'AHCI protocol queue + SATA 6Gbps bus overhead.',
    hardware: 'SATA III Flash SSD',
  },
  {
    id: 'dc_roundtrip',
    name: 'Datacenter Roundtrip (Same DC)',
    category: 'network',
    nanoseconds: 500000,
    description: 'Top-of-rack (ToR) switch hop + NIC interrupt handling.',
    hardware: '100GbE Optical Fabric',
  },
  {
    id: 'nvme_seq_1mb',
    name: 'Read 1MB Sequentially (NVMe)',
    category: 'storage',
    nanoseconds: 250000,
    description: 'Continuous DMA streaming at ~4,000 MB/s across multi-channel NAND.',
    hardware: 'PCIe NVMe Gen4',
  },
  {
    id: 'hdd_seek',
    name: 'HDD Mechanical Seek + Rotational',
    category: 'storage',
    nanoseconds: 10000000,
    description: 'Arm actuator movement + platter 7200 RPM rotational delay.',
    hardware: 'Magnetic Platter & Actuator',
  },
  {
    id: 'transatlantic_ping',
    name: 'Transatlantic Network Ping (NYC to London)',
    category: 'network',
    nanoseconds: 70000000,
    description: 'Speed of light in fiber optics (~200,000 km/s) across Atlantic seabed.',
    hardware: 'Submarine Optical Cable',
  },
];

function formatTime(ns: number): string {
  if (ns < 1000) return `${ns} ns`;
  if (ns < 1000000) return `${(ns / 1000).toFixed(1)} µs`;
  if (ns < 1000000000) return `${(ns / 1000000).toFixed(1)} ms`;
  return `${(ns / 1000000000).toFixed(2)} s`;
}

function formatHumanScale(ns: number): string {
  // If 0.5 ns = 1 second
  const seconds = (ns / 0.5);
  if (seconds < 60) return `${seconds.toFixed(0)} seconds`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)} minutes`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)} hours`;
  const days = hours / 24;
  if (days < 30.5) return `${days.toFixed(1)} days`;
  const months = days / 30.5;
  if (months < 12) return `${months.toFixed(1)} months`;
  const years = days / 365;
  return `${years.toFixed(1)} years`;
}

export default function LatencyExplorer(): React.JSX.Element {
  const [filter, setFilter] = useState<'all' | 'cpu' | 'memory' | 'storage' | 'network'>('all');
  const [humanScale, setHumanScale] = useState(true);

  const filtered = filter === 'all' 
    ? LATENCY_DATA 
    : LATENCY_DATA.filter((item) => item.category === filter);

  return (
    <div className="interactive-widget">
      <div className="interactive-widget-header">
        <div className="interactive-widget-title">
          <span>⏱️</span>
          <span>Numbers Every Storage Engineer Should Know</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={humanScale}
              onChange={(e) => setHumanScale(e.target.checked)}
            />
            <span>Human Scale (1 cycle = 1 sec)</span>
          </label>
        </div>
      </div>

      <p style={{ fontSize: '0.92rem', color: 'var(--ifm-color-content-secondary)' }}>
        Hardware access times span <strong>8 orders of magnitude</strong>. 
        {humanScale ? (
          <span> If an L1 cache hit took <strong>1 second</strong>, reading from an NVMe SSD is like waiting <strong>5.5 hours</strong>, and an HDD seek is like waiting <strong>7.6 months</strong>!</span>
        ) : (
          <span> Comparing raw clock cycles and access times across physical media.</span>
        )}
      </p>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: 'All Operations' },
          { key: 'cpu', label: 'CPU & Caches' },
          { key: 'memory', label: 'DRAM' },
          { key: 'storage', label: 'Flash / NVMe / HDD' },
          { key: 'network', label: 'Network' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as any)}
            style={{
              padding: '0.35rem 0.8rem',
              borderRadius: '6px',
              border: '1px solid var(--mdn-border)',
              backgroundColor: filter === tab.key ? 'var(--ifm-color-primary)' : 'var(--mdn-bg-subtle)',
              color: filter === tab.key ? '#ffffff' : 'var(--ifm-color-content)',
              fontSize: '0.82rem',
              cursor: 'pointer',
              fontWeight: filter === tab.key ? 600 : 500,
              transition: 'all 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Items list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {filtered.map((item) => {
          // Logarithmic scale for visual bar width
          const minLog = Math.log10(0.5);
          const maxLog = Math.log10(150000000);
          const currentLog = Math.log10(item.nanoseconds);
          const percentage = Math.max(4, Math.min(100, ((currentLog - minLog) / (maxLog - minLog)) * 100));

          let badgeColor = 'mdn-badge-blue';
          if (item.category === 'memory') badgeColor = 'mdn-badge-green';
          if (item.category === 'storage') badgeColor = 'mdn-badge-purple';
          if (item.category === 'network') badgeColor = 'mdn-badge-amber';

          return (
            <div
              key={item.id}
              style={{
                backgroundColor: 'var(--mdn-bg-subtle)',
                border: '1px solid var(--mdn-border)',
                borderRadius: '8px',
                padding: '0.85rem 1.1rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{item.name}</span>
                  <span className={`mdn-badge ${badgeColor}`}>{item.category}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontFamily: 'var(--ifm-font-family-monospace)', fontWeight: 600, color: 'var(--ifm-color-primary)', fontSize: '0.9rem' }}>
                    {formatTime(item.nanoseconds)}
                  </span>
                  {humanScale && (
                    <span style={{ fontSize: '0.82rem', padding: '0.15rem 0.5rem', backgroundColor: 'var(--site-accent-glow)', color: 'var(--site-accent)', borderRadius: '4px', fontWeight: 600 }}>
                      ⏳ {formatHumanScale(item.nanoseconds)}
                    </span>
                  )}
                </div>
              </div>

              {/* Progress bar representing scale */}
              <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: '3px', overflow: 'hidden', margin: '0.5rem 0' }}>
                <div
                  style={{
                    width: `${percentage}%`,
                    height: '100%',
                    backgroundColor: item.category === 'storage' ? 'var(--site-accent)' : 'var(--ifm-color-primary)',
                    borderRadius: '3px',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--ifm-color-content-secondary)', marginTop: '0.25rem' }}>
                <span>{item.description}</span>
                <span style={{ fontStyle: 'italic' }}>{item.hardware}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
