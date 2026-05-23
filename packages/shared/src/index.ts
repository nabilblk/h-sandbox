export type SandboxStatus = "running" | "idle" | "error" | "terminated" | "pending";

export type Template = {
  id: string;
  name: string;
  description: string;
  image: string;
  imageDigest?: string | null;
  icon: "py" | "node" | "globe" | "box" | "file";
  tags: string[];
  aliases: string[];
  bootMs: number;
  visibility: "public" | "private" | "internal";
  status: string;
  defaultEntrypoint: string[];
  cpuCount: number;
  memoryMb: number;
  workdir: string;
  defaultPorts: number[];
  runtimeFamily: string;
  latestVersionId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type TemplateVersionSummary = {
  id: string;
  templateId: string;
  buildId: string | null;
  versionNumber: number;
  aliases: string[];
  imageUri: string;
  imageDigest: string | null;
  status: string;
  defaultEntrypoint: string[];
  cpuCount: number;
  memoryMb: number;
  workdir: string;
  defaultPorts: number[];
  envSchema: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  promotedAt: string | null;
};

export type TemplateBuildSummary = {
  id: string;
  organizationId: string;
  templateId: string;
  status: "queued" | "building" | "success" | "failed" | "canceled" | string;
  sourceType: "dockerfile" | "git" | "image" | string;
  contextHash: string | null;
  dockerfilePath: string | null;
  buildArgs: Record<string, unknown>;
  imageDestination: string | null;
  imageDigest: string | null;
  logRef: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TemplateBuildLogEntry = {
  lineNo: number;
  stream: string;
  message: string;
  createdAt: string;
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
  templateVersionId?: string | null;
  templateImageDigest?: string | null;
  createdAt: string;
};

export type SandboxRouteState = "provisioning" | "ready" | "unhealthy" | "terminated";

export type SandboxRouteSummary = {
  port: number;
  protocol: "http" | "https";
  routeKey: string;
  host: string;
  url: string;
  targetUrl: string;
  state: SandboxRouteState;
  provider: string;
  providerRouteId: string | null;
  createdAt: string;
  lastCheckedAt: string | null;
  terminatedAt: string | null;
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
    aliases: ["python"],
    bootMs: 126,
    visibility: "public",
    status: "ready",
    defaultEntrypoint: ["sleep", "3600"],
    cpuCount: 1,
    memoryMb: 1024,
    workdir: "/",
    defaultPorts: [],
    runtimeFamily: "python"
  },
  {
    id: "python-3.12-data",
    name: "Python 3.12 (data)",
    description: "Numpy, pandas, polars, matplotlib.",
    image: "python:3.12-slim",
    icon: "py",
    tags: ["python", "data"],
    aliases: ["python-data"],
    bootMs: 137,
    visibility: "public",
    status: "ready",
    defaultEntrypoint: ["sleep", "3600"],
    cpuCount: 2,
    memoryMb: 2048,
    workdir: "/",
    defaultPorts: [],
    runtimeFamily: "python-data"
  },
  {
    id: "node-20",
    name: "Node 20",
    description: "Node + pnpm + bun.",
    image: "node:20-bookworm-slim",
    icon: "node",
    tags: ["node", "js"],
    aliases: ["node"],
    bootMs: 142,
    visibility: "public",
    status: "ready",
    defaultEntrypoint: ["sleep", "3600"],
    cpuCount: 1,
    memoryMb: 1024,
    workdir: "/",
    defaultPorts: [3000, 5173],
    runtimeFamily: "node"
  },
  {
    id: "node-20-chromium",
    name: "Node 20 + Chromium",
    description: "Headless browser for agents.",
    image: "mcr.microsoft.com/playwright:v1.57.0-noble",
    icon: "globe",
    tags: ["browser", "node"],
    aliases: ["browser"],
    bootMs: 184,
    visibility: "public",
    status: "ready",
    defaultEntrypoint: ["sleep", "3600"],
    cpuCount: 2,
    memoryMb: 2048,
    workdir: "/",
    defaultPorts: [3000, 5173, 4321, 8000],
    runtimeFamily: "browser"
  },
  {
    id: "ubuntu-24.04",
    name: "Ubuntu 24.04",
    description: "Plain devbox, root, apt available.",
    image: "ubuntu:24.04",
    icon: "box",
    tags: ["os"],
    aliases: ["ubuntu"],
    bootMs: 119,
    visibility: "public",
    status: "ready",
    defaultEntrypoint: ["sleep", "3600"],
    cpuCount: 1,
    memoryMb: 1024,
    workdir: "/",
    defaultPorts: [],
    runtimeFamily: "linux"
  },
  {
    id: "custom",
    name: "Custom Dockerfile",
    description: "Bring your own image.",
    image: "ubuntu:24.04",
    icon: "file",
    tags: ["custom"],
    aliases: [],
    bootMs: 220,
    visibility: "private",
    status: "ready",
    defaultEntrypoint: ["sleep", "3600"],
    cpuCount: 2,
    memoryMb: 2048,
    workdir: "/workspace",
    defaultPorts: [3000, 5173, 4321, 8000],
    runtimeFamily: "custom"
  }
];

export const statusLabel = (status: SandboxStatus) => {
  if (status === "pending") return "running";
  return status;
};

export const apiPath = (path: string) => `/v1${path.startsWith("/") ? path : `/${path}`}`;
