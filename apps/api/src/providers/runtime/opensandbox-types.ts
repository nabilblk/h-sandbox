export type ProviderSandbox = {
  id: string;
  status?: { state?: string };
  expiresAt?: string;
  metadata?: Record<string, string>;
};

export type ProviderList = {
  items?: ProviderSandbox[];
  sandboxes?: ProviderSandbox[];
  data?: ProviderSandbox[];
};

export type ProviderSnapshot = {
  id: string;
  sandboxId?: string;
  name?: string | null;
  status?: {
    state?: string;
    reason?: string | null;
    message?: string | null;
    lastTransitionAt?: string | null;
  };
  metadata?: Record<string, string>;
  createdAt?: string;
};

export type ProviderSnapshotList = {
  items?: ProviderSnapshot[];
  snapshots?: ProviderSnapshot[];
  data?: ProviderSnapshot[];
};

export type ProviderEndpoint = {
  endpoint?: string;
  url?: string;
  headers?: Record<string, string> | null;
};

export type ExecdFileInfo = {
  path: string;
  size?: number;
  modified_at?: string;
  created_at?: string;
  owner?: string;
  group?: string;
  mode?: number | string;
};

export type DiagnosticContent = {
  content?: string;
  contentUrl?: string;
  delivery?: "inline" | "url" | string;
};

export type SandboxFileEntry = {
  path: string;
  name: string;
  type: "file" | "directory" | "symlink" | "other";
  size: number;
  mode?: string;
  owner?: string;
  group?: string;
  modifiedAt?: string | null;
};

export type SandboxLogEntry = {
  ts: string;
  lvl: string;
  msg: string;
  source: "control-plane" | "sandbox";
};

export type SandboxMetricsSnapshot = {
  current: { cpu: number; mem: number; diskIo: number; networkOut: number; cpuCount?: number; memTotal?: number };
  series: Array<{ ts: string; cpu: number; mem: number }>;
};

export type SandboxRouteTarget = {
  routeKey: string;
  host: string;
  url: string;
  targetUrl: string;
  provider: string;
  providerRouteId: string | null;
  state: "provisioning" | "ready" | "unhealthy";
};
