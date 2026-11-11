import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createTelemetryIngestion, TelemetryIngestionError, telemetryRequestLimit } from "../../apps/api/src/services/observability/ingestion.ts";

// The protocol fixture replaces the PostgreSQL grant store and HTTP routing.
// A separate application gate exercises the persisted store and real routes.
// It exercises the actual ingestion transport, not a second proxy implementation.
export async function qualificationGateway(stack) {
  const grants = new Map();
  const hash = (token) => createHash("sha256").update(token).digest("hex");
  const ingress = createTelemetryIngestion({
    collectorUrl: stack.url("collector"), collectorToken: stack.token,
    authorizeGrant: async (token) => grants.get(hash(token)) ?? null
  });
  const server = createServer({ requestTimeout: 10_000, headersTimeout: 3000 }, async (request, response) => {
    try {
      const signal = /^\/v1\/(traces|logs)$/.exec(request.url ?? "")?.[1];
      if (request.method !== "POST" || !signal) throw new TelemetryIngestionError(404, "not_found");
      const binding = await ingress.authorize(request.headers.authorization);
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > telemetryRequestLimit) throw new TelemetryIngestionError(413, "telemetry_payload_too_large");
        chunks.push(chunk);
      }
      const result = await ingress.forward(binding, {
        signal, contentType: request.headers["content-type"] ?? "",
        contentEncoding: request.headers["content-encoding"], body: Buffer.concat(chunks, bytes)
      });
      response.writeHead(200, { "Content-Type": result.contentType });
      response.end(result.body);
    } catch (error) {
      response.writeHead(error instanceof TelemetryIngestionError ? error.statusCode : 503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error instanceof TelemetryIngestionError ? error.code : "telemetry_unavailable" }));
    }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  let closed = false;
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    issue(tenant, capture = "metadata") {
      const token = `htg_${randomBytes(32).toString("base64url")}`;
      grants.set(hash(token), {
        grantId: hash(token), tenantId: tenant, organizationId: `org_${tenant}`, runId: `run_${tenant}`,
        sandboxId: `sbx_${tenant}`, capture, expiresAt: Date.now() + 60_000
      });
      return token;
    },
    revoke(token) { grants.delete(hash(token)); },
    async close() {
      if (closed) return;
      closed = true;
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  };
}
