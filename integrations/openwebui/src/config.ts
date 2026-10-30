import { z } from "zod";

const positive = (fallback: number, max: number) => z.coerce.number().int().min(1).max(max).default(fallback);
const httpUrl = z.url().refine((value) => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
}, "Expected an HTTP origin without credentials or query");

const environment = z.object({
  HARAKIRI_API_URL: httpUrl,
  HARAKIRI_API_KEY: z.string().min(1),
  HARAKIRI_TEMPLATE: z.string().min(1),
  ADAPTER_INSTANCE_ID: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  ADAPTER_DATABASE_URL: z.string().min(1),
  ADAPTER_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  OPENWEBUI_ADAPTER_KEY: z.string().min(32),
  ADAPTER_PORT: positive(8080, 65535),
  ADAPTER_TTL_SECONDS: positive(900, 3600),
  ADAPTER_MAX_SESSION_SECONDS: positive(14400, 86400),
  ADAPTER_MAX_REQUEST_BYTES: positive(16 * 1024 * 1024, 32 * 1024 * 1024),
  ADAPTER_MAX_CONNECTIONS: positive(16, 128),
  ADAPTER_READY_TIMEOUT_MS: positive(180000, 240000)
});

export const readConfig = (env: NodeJS.ProcessEnv = process.env) => {
  const parsed = environment.safeParse(env);
  if (!parsed.success)
    throw new Error(`Invalid adapter settings: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  if (parsed.data.ADAPTER_TTL_SECONDS > parsed.data.ADAPTER_MAX_SESSION_SECONDS)
    throw new Error("Adapter TTL must not exceed maximum session age");
  return parsed.data;
};
export type AdapterConfig = ReturnType<typeof readConfig>;

export class AdapterError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
    this.name = "AdapterError";
  }
}
