// Shared primitives: brand, top nav, icons, mock data
const { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } = React;

const Brand = ({ size = 15 }) => (
  <span className="brand" style={{ fontSize: size }}>
    <span className="brand-mark" />
    <span className="brand-name"><b>harakiri</b> <span style={{color:'var(--muted)'}}>sandbox</span></span>
  </span>
);

// Tiny line icons — stroke-based, kept abstract & minimal
const Icon = ({ name, size = 14, stroke = 1.5, style }) => {
  const common = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round', style };
  const paths = {
    box: <><path d="M2.5 4.5 8 1.5l5.5 3v7L8 14.5l-5.5-3v-7Z"/><path d="M2.5 4.5 8 7.5l5.5-3"/><path d="M8 7.5v7"/></>,
    play: <><path d="M4 3v10l9-5-9-5Z"/></>,
    stop: <><rect x="3.5" y="3.5" width="9" height="9" rx="1"/></>,
    plus: <><path d="M8 3v10M3 8h10"/></>,
    search: <><circle cx="7" cy="7" r="4"/><path d="m10 10 3 3"/></>,
    chevron: <><path d="m6 4 4 4-4 4"/></>,
    chevDown: <><path d="m4 6 4 4 4-4"/></>,
    arrowR: <><path d="M3 8h10M9 4l4 4-4 4"/></>,
    terminal: <><rect x="1.5" y="2.5" width="13" height="11" rx="1"/><path d="m4 6 2 2-2 2M8 10h4"/></>,
    file: <><path d="M4 1.5h5L13 5v9.5H4z"/><path d="M9 1.5V5h4"/></>,
    folder: <><path d="M1.5 4a1 1 0 0 1 1-1H6l1.5 1.5h6a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V4Z"/></>,
    logs: <><path d="M2.5 3h11M2.5 6h11M2.5 9h7M2.5 12h11"/></>,
    cpu: <><rect x="3" y="3" width="10" height="10" rx="1"/><rect x="6" y="6" width="4" height="4"/><path d="M6 1v2M10 1v2M6 13v2M10 13v2M1 6h2M1 10h2M13 6h2M13 10h2"/></>,
    chart: <><path d="M2 13h12M4 11V7M7 11V4M10 11V8M13 11V5"/></>,
    bell: <><path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3L4 11Z"/><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0"/></>,
    key: <><circle cx="5" cy="11" r="2.5"/><path d="m7 9 5-5M11 5l1.5 1.5M9.5 6.5 11 8"/></>,
    book: <><path d="M2.5 2.5h4a2 2 0 0 1 2 2v9a1.5 1.5 0 0 0-1.5-1.5H2.5v-9.5Z"/><path d="M13.5 2.5h-4a2 2 0 0 0-2 2v9a1.5 1.5 0 0 1 1.5-1.5h4.5v-9.5Z"/></>,
    settings: <><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5 13 13M3 13l1.5-1.5M11.5 4.5 13 3"/></>,
    user: <><circle cx="8" cy="6" r="2.5"/><path d="M3 13.5c.5-2 2.5-3.5 5-3.5s4.5 1.5 5 3.5"/></>,
    copy: <><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2"/></>,
    check: <><path d="m3 8 3.5 3.5L13 5"/></>,
    x: <><path d="m4 4 8 8M12 4l-8 8"/></>,
    dot: <><circle cx="8" cy="8" r="1.5" fill="currentColor"/></>,
    refresh: <><path d="M13.5 8a5.5 5.5 0 0 1-9.4 3.9M2.5 8a5.5 5.5 0 0 1 9.4-3.9"/><path d="M13.5 2.5v3h-3M2.5 13.5v-3h3"/></>,
    git: <><circle cx="4" cy="3.5" r="1.5"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="8" r="1.5"/><path d="M4 5v6M5.5 8H10"/></>,
    py: <><path d="M3 8h7a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2V8Z"/><path d="M13 8H6a2 2 0 0 0-2 2v2.5a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V8Z"/></>,
    node: <><path d="M8 1.5 2.5 4.5v7L8 14.5l5.5-3v-7L8 1.5Z"/></>,
    lock: <><rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></>,
    bolt: <><path d="M9 1.5 3 9h4l-1 5.5L13 7H9l1-5.5h-1Z"/></>,
    globe: <><circle cx="8" cy="8" r="6.5"/><path d="M1.5 8h13M8 1.5c2 2 2 11 0 13M8 1.5c-2 2-2 11 0 13"/></>,
  };
  return <svg {...common}>{paths[name] || paths.dot}</svg>;
};

// Mock data — sandboxes
const mkId = () => 'sbx_' + Math.random().toString(36).slice(2, 10);
const MOCK_SANDBOXES = [
  { id: 'sbx_jt29kf01x4', name: 'agent-eval-runner',     template: 'python-3.12-data', status: 'running', cpu: 38, mem: 412, started: '2m 14s', owner: 'lyra@k.ai',  cost: 0.014 },
  { id: 'sbx_b8m4qa3eyl', name: 'browser-use-pool-04',   template: 'node-20-chromium', status: 'running', cpu: 71, mem: 980, started: '14m 02s', owner: 'sam',       cost: 0.083 },
  { id: 'sbx_p0w2rmnk7c', name: 'tool-call-harness',     template: 'python-3.12',      status: 'idle',    cpu: 2,  mem: 64,  started: '1h 21m',  owner: 'lyra@k.ai', cost: 0.001 },
  { id: 'sbx_98aa1cvz4t', name: 'codex-replay-3f9',      template: 'node-20',          status: 'running', cpu: 22, mem: 218, started: '38s',     owner: 'sam',       cost: 0.006 },
  { id: 'sbx_qq77dolfes', name: 'rag-ingest-batch',      template: 'python-3.12-data', status: 'error',   cpu: 0,  mem: 0,   started: '\u2014',  owner: 'mira',      cost: 0.000 },
  { id: 'sbx_xz5n11pawh', name: 'devbox-scratch',        template: 'ubuntu-24.04',     status: 'idle',    cpu: 4,  mem: 102, started: '3h 04m',  owner: 'lyra@k.ai', cost: 0.012 },
  { id: 'sbx_e3kkrjj99q', name: 'eval-harness-shadow',   template: 'python-3.12',      status: 'running', cpu: 55, mem: 612, started: '6m 41s', owner: 'mira',      cost: 0.027 },
];

const TEMPLATES = [
  { id: 'python-3.12',      name: 'Python 3.12',         desc: 'Bare Python with pip + uv.',            icon: 'py',   tags: ['python', 'cli'] },
  { id: 'python-3.12-data', name: 'Python 3.12 (data)',  desc: 'Numpy, pandas, polars, matplotlib.',    icon: 'py',   tags: ['python', 'data'] },
  { id: 'node-20',          name: 'Node 20',             desc: 'Node + pnpm + bun.',                    icon: 'node', tags: ['node', 'js'] },
  { id: 'node-20-chromium', name: 'Node 20 + Chromium',  desc: 'Headless browser for agents.',          icon: 'globe', tags: ['browser', 'node'] },
  { id: 'ubuntu-24.04',     name: 'Ubuntu 24.04',        desc: 'Plain devbox, root, apt available.',    icon: 'box',  tags: ['os'] },
  { id: 'custom',           name: 'Custom Dockerfile',   desc: 'Bring your own image.',                 icon: 'file', tags: ['custom'] },
];

window.Brand = Brand;
window.Icon = Icon;
window.MOCK_SANDBOXES = MOCK_SANDBOXES;
window.TEMPLATES = TEMPLATES;
