import { gunzip } from "node:zlib";

export type TelemetrySignal = "traces" | "logs";
export type TelemetryBinding = {
  grantId: string;
  tenantId: number;
  organizationId: string;
  runId: string;
  sandboxId: string;
  capture: "metadata" | "content";
  expiresAt: number;
};

export class TelemetryIngestionError extends Error {
  constructor(readonly statusCode: number, readonly code: string) {
    super(code);
    this.name = "TelemetryIngestionError";
  }
}

export type TelemetryIngestionDependencies = {
  authorizeGrant: (token: string) => Promise<TelemetryBinding | null>;
  admit?: (binding: TelemetryBinding, decodedBytes: number) => Promise<TelemetryBinding>;
  collectorUrl: string;
  collectorToken: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
};

export const telemetryRequestLimit = 1024 * 1024;
const responseLimit = 64 * 1024;

function collectorDestination(input: string) {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Collector URL must be an operator-configured HTTP(S) origin");
  }
  return url;
}

function validBinding(binding: TelemetryBinding, now: number) {
  return Number.isInteger(binding.tenantId) && binding.tenantId > 0 && binding.tenantId <= 999_999_999
    && /^[A-Za-z0-9_-]{1,128}$/.test(binding.grantId)
    && /^[A-Za-z0-9_-]{1,128}$/.test(binding.organizationId)
    && /^run_[A-Za-z0-9_-]{1,64}$/.test(binding.runId)
    && /^sbx_[A-Za-z0-9_-]{1,64}$/.test(binding.sandboxId)
    && ["metadata", "content"].includes(binding.capture)
    && Number.isFinite(binding.expiresAt) && binding.expiresAt > now;
}

async function decompress(body: Buffer, encoding: string | undefined): Promise<Buffer> {
  if (body.length > telemetryRequestLimit) throw new TelemetryIngestionError(413, "telemetry_payload_too_large");
  if (!encoding || encoding === "identity") return body;
  if (encoding !== "gzip") throw new TelemetryIngestionError(415, "telemetry_encoding_unsupported");
  return new Promise((resolve, reject) => {
    gunzip(body, { maxOutputLength: telemetryRequestLimit }, (error, result) => {
      if (!error) return resolve(result);
      const tooLarge = (error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE";
      reject(new TelemetryIngestionError(tooLarge ? 413 : 400, tooLarge ? "telemetry_payload_too_large" : "telemetry_payload_invalid"));
    });
  });
}

async function boundedResponse(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return Buffer.concat(chunks, bytes);
      bytes += value.byteLength;
      if (bytes > responseLimit) throw new TelemetryIngestionError(503, "telemetry_unavailable");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Opaque OTLP transport: Collector owns parsing, normalization and privacy filtering. */
export function createTelemetryIngestion(dependencies: TelemetryIngestionDependencies) {
  const destination = collectorDestination(dependencies.collectorUrl);
  if (!dependencies.collectorToken || /[\r\n]/.test(dependencies.collectorToken)) throw new Error("Collector ingress credential is required");
  const fetch = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? Date.now;

  return {
    // Route handlers must call this before parsing the body. Normal API keys and
    // JWTs cannot authenticate this surface; only the grant store can resolve it.
    async authorize(authorization: string | undefined): Promise<TelemetryBinding> {
      const match = /^Bearer (htg_[A-Za-z0-9_-]{43})$/.exec(authorization ?? "");
      if (!match) throw new TelemetryIngestionError(401, "telemetry_grant_invalid");
      const binding = await dependencies.authorizeGrant(match[1]!);
      if (!binding || !validBinding(binding, now())) throw new TelemetryIngestionError(401, "telemetry_grant_invalid");
      return Object.freeze({ ...binding });
    },

    async forward(binding: TelemetryBinding, request: {
      signal: TelemetrySignal;
      contentType: string;
      contentEncoding?: string;
      body: Buffer;
    }) {
      if (!["traces", "logs"].includes(request.signal)) throw new TelemetryIngestionError(404, "telemetry_signal_unsupported");
      if (!["application/json", "application/x-protobuf"].includes(request.contentType)) {
        throw new TelemetryIngestionError(415, "telemetry_format_unsupported");
      }
      const body = await decompress(request.body, request.contentEncoding);
      if (!validBinding(binding, now())) throw new TelemetryIngestionError(401, "telemetry_grant_invalid");
      // Production admission revalidates revocation/policy after the body arrives
      // and charges decoded bytes. Qualification fixtures may omit the database.
      const admitted = dependencies.admit ? await dependencies.admit(binding, body.byteLength) : binding;
      if (!validBinding(admitted, now()) || admitted.grantId !== binding.grantId || admitted.tenantId !== binding.tenantId
        || admitted.organizationId !== binding.organizationId || admitted.runId !== binding.runId || admitted.sandboxId !== binding.sandboxId
        || (binding.capture === "metadata" && admitted.capture === "content")) throw new TelemetryIngestionError(401, "telemetry_grant_invalid");
      try {
        const response = await fetch(new URL(`/v1/${request.signal}`, destination), {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
          headers: {
            Authorization: `Bearer ${dependencies.collectorToken}`, "Content-Type": request.contentType,
            "x-harakiri-tenant": String(binding.tenantId), "x-harakiri-org": binding.organizationId,
            "x-harakiri-run": binding.runId, "x-harakiri-sandbox": binding.sandboxId,
            "x-harakiri-capture": admitted.capture
          },
          body: new Uint8Array(body)
        });
        if (response.status !== 200) {
          await response.body?.cancel();
          const status = [400, 413, 429].includes(response.status) ? response.status : 503;
          throw new TelemetryIngestionError(status, status === 503 ? "telemetry_unavailable" : "telemetry_rejected");
        }
        // Preserve the protocol's partial-success acknowledgement for the
        // exporter. HTTP 200 is not proof of durable storage or query visibility.
        const contentType = response.headers.get("content-type")?.split(";")[0];
        if (contentType !== request.contentType) {
          await response.body?.cancel();
          throw new TelemetryIngestionError(503, "telemetry_unavailable");
        }
        return { contentType, body: await boundedResponse(response) };
      } catch (error) {
        if (error instanceof TelemetryIngestionError) throw error;
        // Collector errors may contain URLs, credentials or rejected payloads.
        throw new TelemetryIngestionError(503, "telemetry_unavailable");
      }
    }
  };
}
