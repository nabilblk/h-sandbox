import { Readable } from "node:stream";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { apiErrorResponse } from "@harakiri/shared";
import { streamAuthValid } from "../auth.js";
import { hasScope } from "../authorization.js";
import type { RuntimeProvider } from "../providers/runtime/provider.js";
import type { Query } from "../services/query.js";
import { commandEvents, encodeCommandEvent, parseCommandCursor } from "../services/command-events.js";
import { getSandboxCommand, getSandboxCommandLogs } from "../services/sandbox-runtime.js";

export async function registerCommandEventRoutes(app: FastifyInstance, deps: { query: Query; runtimeProvider: RuntimeProvider; authorize?: (request: FastifyRequest) => Promise<boolean> }) {
  const viewers = new Map<string, number>();
  const controllers = new Set<AbortController>();
  app.addHook("preClose", async () => { for (const controller of controllers) controller.abort(); });
  app.get<{ Params: { id: string; commandId: string } }>("/v1/sandboxes/:id/commands/:commandId/events", async (request, reply) => {
    const { cursor: queryCursor } = z.object({ cursor: z.string().max(300).optional() }).parse(request.query);
    const header = request.headers["last-event-id"];
    const cursor = queryCursor ?? (Array.isArray(header) ? header[0] : header);
    parseCommandCursor(request.params.commandId, cursor);
    const input = { organizationId: request.auth.organizationId, sandboxId: request.params.id, commandId: request.params.commandId };
    const initial = await getSandboxCommand(input, deps);
    if (!initial) return reply.code(404).send(apiErrorResponse("command_not_found"));
    if (!initial.detached && ["running", "queued"].includes(initial.status)) return reply.code(409).send(apiErrorResponse("command_stream_requires_detached"));
    const count = viewers.get(input.organizationId) ?? 0;
    if (count >= 16 || controllers.size >= 256) return reply.code(429).send(apiErrorResponse("command_stream_limit"));
    const controller = new AbortController();
    controllers.add(controller); viewers.set(input.organizationId, count + 1);
    const cleanup = () => {
      if (!controllers.delete(controller)) return;
      controller.abort();
      const remaining = (viewers.get(input.organizationId) ?? 1) - 1;
      if (remaining) viewers.set(input.organizationId, remaining); else viewers.delete(input.organizationId);
    };
    reply.raw.once("close", cleanup);
    const events = commandEvents({ commandId: input.commandId, cursor, signal: controller.signal,
      readCommand: () => getSandboxCommand({ ...input, signal: controller.signal }, deps),
      readLogs: (offset) => getSandboxCommandLogs({ ...input, cursor: offset, signal: controller.signal }, deps),
      authorize: async () => await (deps.authorize ? deps.authorize(request) : streamAuthValid(request, deps.query)) && hasScope(request.auth, "sandboxes:read") });
    const stream = Readable.from((async function* () {
      try { for await (const event of events) yield encodeCommandEvent(event); }
      finally { cleanup(); }
    })(), { objectMode: false, highWaterMark: 16384 });
    return reply.type("text/event-stream").header("Cache-Control", "no-store, no-transform")
      .header("X-Accel-Buffering", "no").send(stream);
  });
}
