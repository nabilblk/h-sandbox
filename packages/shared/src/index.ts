export type SandboxStatus = "running" | "idle" | "error" | "terminated" | "pending";

export type Template = {
  id: string;
  name: string;
  description: string;
  image: string;
  icon: "py" | "node" | "globe" | "box" | "file";
  tags: string[];
  bootMs: number;
  visibility: "public" | "private";
  defaultEntrypoint: string[];
};

export type SandboxSummary = {
  id: string;
  opensandboxId?: string | null;
  name: string;
  template: string;
  status: SandboxStatus;
  cpu: number;
  mem: number;
  started: string;
  owner: string;
  cost: number;
  ttlSeconds: number;
  expiresAt: string | null;
  publicUrl: string | null;
  createdAt: string;
};

export type ApiKeySummary = {
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type UsageSummary = {
  sandboxesSpawned: number;
  computeHours: number;
  avgColdStartMs: number;
  avgRuntimeSeconds: number;
  concurrentNow: number;
  concurrentPeak: number;
  series: number[];
  topTemplates: Array<{ label: string; value: number }>;
  statusBreakdown: Array<{ label: string; value: number }>;
};

export type RunResult = {
  sandboxId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
};

export const TEMPLATES: Template[] = [
  {
    id: "python-3.12",
    name: "Python 3.12",
    description: "Bare Python with pip + uv.",
    image: "python:3.12-slim",
    icon: "py",
    tags: ["python", "cli"],
    bootMs: 126,
    visibility: "public",
    defaultEntrypoint: ["sleep", "3600"]
  },
  {
    id: "python-3.12-data",
    name: "Python 3.12 (data)",
    description: "Numpy, pandas, polars, matplotlib.",
    image: "python:3.12-slim",
    icon: "py",
    tags: ["python", "data"],
    bootMs: 137,
    visibility: "public",
    defaultEntrypoint: ["sleep", "3600"]
  },
  {
    id: "node-20",
    name: "Node 20",
    description: "Node + pnpm + bun.",
    image: "node:20-bookworm-slim",
    icon: "node",
    tags: ["node", "js"],
    bootMs: 142,
    visibility: "public",
    defaultEntrypoint: ["sleep", "3600"]
  },
  {
    id: "node-20-chromium",
    name: "Node 20 + Chromium",
    description: "Headless browser for agents.",
    image: "mcr.microsoft.com/playwright:v1.57.0-noble",
    icon: "globe",
    tags: ["browser", "node"],
    bootMs: 184,
    visibility: "public",
    defaultEntrypoint: ["sleep", "3600"]
  },
  {
    id: "ubuntu-24.04",
    name: "Ubuntu 24.04",
    description: "Plain devbox, root, apt available.",
    image: "ubuntu:24.04",
    icon: "box",
    tags: ["os"],
    bootMs: 119,
    visibility: "public",
    defaultEntrypoint: ["sleep", "3600"]
  },
  {
    id: "custom",
    name: "Custom Dockerfile",
    description: "Bring your own image.",
    image: "ubuntu:24.04",
    icon: "file",
    tags: ["custom"],
    bootMs: 220,
    visibility: "private",
    defaultEntrypoint: ["sleep", "3600"]
  }
];

export const statusLabel = (status: SandboxStatus) => {
  if (status === "pending") return "running";
  return status;
};

export const apiPath = (path: string) => `/v1${path.startsWith("/") ? path : `/${path}`}`;
