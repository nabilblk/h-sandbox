import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ObservabilityServices } from "../services/observability/services.js";
import { TelemetryIngestionError, telemetryRequestLimit, type TelemetryBinding } from "../services/observability/ingestion.js";

export async function registerTelemetryIngestionRoutes(app: FastifyInstance, services: ObservabilityServices | null) {
  await app.register(async (scoped) => {
    const bindings = new WeakMap<FastifyRequest, TelemetryBinding>();
    const releases = new WeakMap<FastifyRequest, () => void>();
    let active = 0;
    scoped.removeAllContentTypeParsers();
    scoped.addContentTypeParser("*", { parseAs: "buffer", bodyLimit: telemetryRequestLimit }, (_request, body, done) => done(null, body));
    scoped.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "private, no-store");
      if (!services) throw new TelemetryIngestionError(503, "observability_disabled");
      if (active >= 16) throw new TelemetryIngestionError(429, "telemetry_ingestion_busy");
      active++;
      let released = false;
      const timeout = setTimeout(() => { release(); request.raw.destroy(); }, 15_000);
      timeout.unref();
      const release = () => {
        if (released) return;
        released = true;
        active--;
        clearTimeout(timeout);
        request.raw.off("aborted", release);
      };
      releases.set(request, release);
      request.raw.once("aborted", release);
      try {
        const authorizations = request.raw.rawHeaders.filter((_, index) => index % 2 === 0)
          .filter((name) => name.toLowerCase() === "authorization").length;
        if (Object.keys(request.query as object).length || authorizations !== 1) {
          throw new TelemetryIngestionError(401, "telemetry_grant_invalid");
        }
        bindings.set(request, await services.ingestion.authorize(request.headers.authorization));
      } catch (error) { release(); throw error; }
    });
    scoped.addHook("onResponse", async (request) => { releases.get(request)?.(); });
    scoped.addHook("onTimeout", async (request) => { releases.get(request)?.(); });
    scoped.setErrorHandler((error, request, reply) => {
      releases.get(request)?.();
      const known = error instanceof TelemetryIngestionError;
      const tooLarge = (error as { code?: string }).code === "FST_ERR_CTP_BODY_TOO_LARGE";
      const status = known ? error.statusCode : tooLarge ? 413 : 503;
      if (status === 429 || status === 503) reply.header("Retry-After", "1");
      return reply.code(status).send({ error: known ? error.code : tooLarge ? "telemetry_payload_too_large" : "telemetry_unavailable" });
    });
    for (const signal of ["traces", "logs"] as const) {
      scoped.post(`/v1/telemetry/${signal}`, { bodyLimit: telemetryRequestLimit }, async (request, reply) => {
        const binding = bindings.get(request);
        if (!binding || !services) throw new TelemetryIngestionError(401, "telemetry_grant_invalid");
        try {
          const result = await services.ingestion.forward(binding, {
            signal, body: request.body as Buffer,
            contentType: request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() ?? "",
            contentEncoding: request.headers["content-encoding"]
          });
          // A failed watermark write must not cause exporters to retransmit an
          // already accepted batch. Missing watermarks stay unknown in the UI.
          await services.control.recordIngestion(binding).catch(() => undefined);
          return reply.type(result.contentType).send(result.body);
        } catch (error) {
          const status = error instanceof TelemetryIngestionError ? error.statusCode : 503;
          if ([400, 413, 429, 503].includes(status)) {
            await services.control.recordIngestion(binding, status === 429 ? "rate_limited" : status === 503 ? "collector_unavailable" : "collector_rejected").catch(() => undefined);
          }
          throw error;
        }
      });
    }
  }, {
    logSerializers: {
      req: (request: FastifyRequest) => `${request.method} /v1/telemetry/:signal`,
      err: () => "Telemetry request failed"
    }
  });
}
