import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {
  SandboxFileMkdirResponse,
  SandboxFileDownloadResponse,
  SandboxFileReadResponse,
  SandboxFileRemoveResponse,
  SandboxFileRenameResponse,
  SandboxFileStatResponse,
  SandboxFileUploadResponse,
  SandboxFileWriteResponse,
  RunSandboxResponse,
  SandboxCommandLogsResponse,
  SandboxCommandResponse,
  SandboxCommandSessionResponse,
  SandboxCommandsResponse,
  RunSandboxCommandSessionResponse,
  SandboxFilesResponse,
  SandboxEgressResponse,
  SandboxLogsResponse,
  SandboxMetricsResponse,
  RuntimeCapabilitiesResponse,
  SandboxRouteResponse,
  SandboxRoutesResponse,
  SandboxTerminalAttachTicketResponse,
  TestSandboxEgressResponse
} from "@harakiri/shared";
import { apiErrorResponse } from "@harakiri/shared";
import WebSocket from "ws";
import { query as defaultQuery } from "../db.js";
import { runtimeProvider as defaultRuntimeProvider, type RuntimeProvider } from "../providers/runtime/index.js";
import {
  attachSandboxTerminal,
  createSandboxCommand,
  createSandboxCommandSession,
  createSandboxRoute,
  deleteSandboxCommandSession,
  deleteSandboxRoute,
  getSandboxCommand,
  getSandboxCommandLogs,
  getSandboxMetrics,
  getRuntimeCapabilities,
  getSandboxEgress,
  killSandboxCommand,
  listSandboxCommands,
  listSandboxFiles,
  listSandboxLogs,
  listSandboxRoutes,
  mkdirSandboxFile,
  readSandboxFile,
  removeSandboxFile,
  renameSandboxFile,
  runSandboxCommand,
  runSandboxCommandSession,
  proxySandboxRouteRequest,
  statSandboxFile,
  testSandboxEgress,
  updateSandboxEgress,
  downloadSandboxFileArtifact,
  uploadSandboxFileArtifact,
  writeSandboxFile,
  sandboxRouteAccessTokenHeader,
  sandboxRouteAccessTokenQueryParam,
  type Audit,
  type SandboxEventRecorder
} from "../services/sandbox-runtime.js";
import {
  consumeTerminalAttachTicket,
  createTerminalAttachTicket
} from "../services/terminal-attach-tickets.js";
import type { Query } from "../services/query.js";
import {
  commandLogsSchema,
  commandSessionCreateSchema,
  commandSessionRunSchema,
  commandSchema,
  egressPatchSchema,
  egressTestSchema,
  fileMkdirSchema,
  filePathSchema,
  fileReadSchema,
  fileRemoveSchema,
  fileRenameSchema,
  fileUploadSchema,
  fileWriteSchema,
  routeSchema,
  runSchema,
  terminalAttachSchema
} from "./sandbox-runtime.schema.js";

export type SandboxRuntimeRouteDependencies = {
  query?: Query;
  runtimeProvider?: RuntimeProvider;
  recordAudit: Audit;
  recordSandboxEvent: SandboxEventRecorder;
};

export const registerSandboxRuntimeRoutes = async (app: FastifyInstance, dependencies: SandboxRuntimeRouteDependencies) => {
  const query = dependencies.query ?? defaultQuery;
  const runtimeProvider = dependencies.runtimeProvider ?? defaultRuntimeProvider;
  const recordEvent = dependencies.recordSandboxEvent;
  const recordAudit = dependencies.recordAudit;
  const idempotencyKey = (headers: Record<string, unknown>) => {
    const value = headers["idempotency-key"];
    return Array.isArray(value) ? value[0] : typeof value === "string" ? value : undefined;
  };

  const proxySandboxRoute = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { routeKey: string; "*": string | undefined };
    const queryParams = request.query as Record<string, string | string[] | undefined>;
    const tokenHeader = request.headers[sandboxRouteAccessTokenHeader];
    const tokenFromHeader = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
    const tokenFromQuery = queryParams[sandboxRouteAccessTokenQueryParam];
    const token = tokenFromHeader ?? (Array.isArray(tokenFromQuery) ? tokenFromQuery[0] : tokenFromQuery);
    const result = await proxySandboxRouteRequest(
      {
        routeKey: params.routeKey,
        path: params["*"],
        url: request.url,
        method: request.method,
        headers: request.headers,
        body: request.body,
        token
      },
      { query }
    );
    if (result.kind === "not_found") return reply.code(404).send(apiErrorResponse("route_not_found"));
    if (result.kind === "route_not_ready") return reply.code(409).send(apiErrorResponse("route_not_ready", { state: result.state }));
    if (result.kind === "public_route") return reply.code(409).send(apiErrorResponse("route_proxy_requires_token_route"));
    if (result.kind === "unauthorized") return reply.code(401).send(apiErrorResponse("route_token_required", { headerName: result.headerName }));
    if (result.kind === "upstream_unreachable") {
      return reply.code(502).send(apiErrorResponse("route_proxy_upstream_unreachable", { message: result.message }));
    }
    for (const [header, value] of Object.entries(result.headers)) reply.header(header, value);
    return reply.code(result.status).send(result.body);
  };

  app.all("/v1/route-proxy/:routeKey", proxySandboxRoute);
  app.all("/v1/route-proxy/:routeKey/*", proxySandboxRoute);

  app.get("/v1/runtime/capabilities", async () => {
    return getRuntimeCapabilities(runtimeProvider) satisfies RuntimeCapabilitiesResponse;
  });

  app.post("/v1/sandboxes/:id/terminal/attach-ticket", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await createTerminalAttachTicket({ sandboxId: id, auth: request.auth }, { query });
    if (result.kind === "not_found") return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    if (result.kind === "sandbox_not_running") return reply.code(409).send(apiErrorResponse("sandbox_not_running", { status: result.status }));
    return reply.code(201).send({
      ticket: result.ticket,
      expiresAt: result.expiresAt,
      attachUrl: result.attachUrl
    } satisfies SandboxTerminalAttachTicketResponse);
  });

  const sendTerminalAttachError = (socket: WebSocket, closeCode: number, payload: ReturnType<typeof apiErrorResponse>) =>
    new Promise<void>((resolve) => {
      const close = () => {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close(closeCode, payload.error);
      };
      if (socket.readyState !== WebSocket.OPEN) {
        close();
        resolve();
        return;
      }
      socket.send(JSON.stringify(payload));
      setTimeout(() => {
        close();
        resolve();
      }, 150);
    });

  app.get("/v1/sandboxes/:id/terminal/attach", { websocket: true }, async (socket, request) => {
    const { id } = request.params as { id: string };
    let queryParams: ReturnType<typeof terminalAttachSchema.parse>;
    try {
      queryParams = terminalAttachSchema.parse(request.query ?? {});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sendTerminalAttachError(socket, 1008, apiErrorResponse("runtime_terminal_unavailable", { message }));
      return;
    }
    const requestWithOptionalAuth = request as typeof request & { auth?: typeof request.auth };
    let auth = requestWithOptionalAuth.auth;
    if (!auth && queryParams.ticket) {
      const ticket = await consumeTerminalAttachTicket({ sandboxId: id, ticket: queryParams.ticket }, { query });
      if (ticket.kind !== "ok") {
        await sendTerminalAttachError(socket, 1008, apiErrorResponse("unauthorized", { message: "Terminal attach ticket is invalid, expired, or already used." }));
        return;
      }
      auth = ticket.auth;
    }
    if (!auth) {
      await sendTerminalAttachError(socket, 1008, apiErrorResponse("unauthorized"));
      return;
    }
    const { ticket: _ticket, ...attachOptions } = queryParams;
    const result = await attachSandboxTerminal(
      {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        actorLabel: auth.actorLabel,
        sandboxId: id,
        client: socket,
        ...attachOptions
      },
      { query, runtimeProvider, recordEvent }
    );
    if (result.kind === "not_found") {
      await sendTerminalAttachError(socket, 1008, apiErrorResponse("sandbox_not_found"));
      return;
    }
    if (result.kind === "sandbox_not_running") {
      await sendTerminalAttachError(socket, 1008, apiErrorResponse("sandbox_not_running", { status: result.status }));
      return;
    }
    if (result.kind === "unsupported") {
      await sendTerminalAttachError(socket, 1011, apiErrorResponse("runtime_terminal_unsupported", { message: result.message }));
      return;
    }
    if (result.kind === "provider_unavailable") {
      await sendTerminalAttachError(socket, 1011, apiErrorResponse("runtime_terminal_unavailable", { message: result.message }));
    }
  });

  app.post("/v1/sandboxes/:id/run", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = runSchema.parse(request.body ?? {});
    const result = await runSandboxCommand(
      {
        organizationId: request.auth.organizationId,
        sandboxId: id,
        command: body.command,
        stdin: body.stdin,
        cwd: body.cwd,
        env: body.env,
        timeoutMs: body.timeoutMs,
        metadata: body.metadata,
        actorUserId: request.auth.userId,
        actorLabel: request.auth.actorLabel
      },
      { query, runtimeProvider, recordEvent, recordAudit }
    );
    if (result.kind === "not_found") return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    if (result.kind === "sandbox_not_running") return reply.code(409).send(apiErrorResponse("sandbox_not_running", { status: result.status }));
    if (result.kind === "unsupported") return reply.code(501).send(apiErrorResponse("runtime_command_unsupported", { message: result.message }));
    return { result: result.result } satisfies RunSandboxResponse;
  });

  app.get("/v1/sandboxes/:id/commands", async (request, reply) => {
    const { id } = request.params as { id: string };
    const commands = await listSandboxCommands({ organizationId: request.auth.organizationId, sandboxId: id }, query);
    if (!commands) return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    return { commands } satisfies SandboxCommandsResponse;
  });

  app.post("/v1/sandboxes/:id/commands", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = commandSchema.parse(request.body ?? {});
    const result = await createSandboxCommand(
      { organizationId: request.auth.organizationId, sandboxId: id, body },
      { query, runtimeProvider, recordEvent, recordAudit, actorUserId: request.auth.userId, actorLabel: request.auth.actorLabel }
    );
    if (result.kind === "not_found") return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    if (result.kind === "sandbox_not_running") return reply.code(409).send(apiErrorResponse("sandbox_not_running", { status: result.status }));
    if (result.kind === "unsupported") return reply.code(501).send(apiErrorResponse("runtime_command_unsupported", { message: result.message }));
    return reply.code(201).send({ command: result.command } satisfies SandboxCommandResponse);
  });

  app.get("/v1/sandboxes/:id/commands/:commandId", async (request, reply) => {
    const { id, commandId } = request.params as { id: string; commandId: string };
    const command = await getSandboxCommand({ organizationId: request.auth.organizationId, sandboxId: id, commandId }, { query, runtimeProvider });
    if (!command) return reply.code(404).send(apiErrorResponse("sandbox_command_not_found"));
    return { command } satisfies SandboxCommandResponse;
  });

  app.get("/v1/sandboxes/:id/commands/:commandId/logs", async (request, reply) => {
    const { id, commandId } = request.params as { id: string; commandId: string };
    const { cursor, tail } = commandLogsSchema.parse(request.query ?? {});
    const logs = await getSandboxCommandLogs({ organizationId: request.auth.organizationId, sandboxId: id, commandId, cursor, tail }, { query, runtimeProvider });
    if (!logs) return reply.code(404).send(apiErrorResponse("sandbox_command_not_found"));
    return logs satisfies SandboxCommandLogsResponse;
  });

  app.delete("/v1/sandboxes/:id/commands/:commandId", async (request, reply) => {
    const { id, commandId } = request.params as { id: string; commandId: string };
    const command = await killSandboxCommand({ organizationId: request.auth.organizationId, sandboxId: id, commandId }, { query, runtimeProvider, recordEvent });
    if (!command) return reply.code(404).send(apiErrorResponse("sandbox_command_not_found"));
    return { command } satisfies SandboxCommandResponse;
  });

  const sendCommandSessionError = (reply: FastifyReply, result: { kind: string; status?: string; message?: string }) => {
    if (result.kind === "not_found") return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    if (result.kind === "session_not_found") return reply.code(404).send(apiErrorResponse("sandbox_command_session_not_found"));
    if (result.kind === "sandbox_not_running") return reply.code(409).send(apiErrorResponse("sandbox_not_running", { status: result.status }));
    if (result.kind === "unsupported") return reply.code(501).send(apiErrorResponse("runtime_command_unsupported", { message: result.message }));
    if (result.kind === "provider_unavailable") return reply.code(502).send(apiErrorResponse("runtime_command_unavailable", { message: result.message }));
    return reply.code(500).send(apiErrorResponse("runtime_command_unavailable"));
  };

  app.post("/v1/sandboxes/:id/command-sessions", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = commandSessionCreateSchema.parse(request.body ?? {});
    const result = await createSandboxCommandSession(
      { organizationId: request.auth.organizationId, sandboxId: id, body },
      { query, runtimeProvider, recordEvent }
    );
    if (result.kind !== "ok") return sendCommandSessionError(reply, result);
    return reply.code(201).send(result.response satisfies SandboxCommandSessionResponse);
  });

  app.post("/v1/sandboxes/:id/command-sessions/:sessionId/run", async (request, reply) => {
    const { id, sessionId } = request.params as { id: string; sessionId: string };
    const body = commandSessionRunSchema.parse(request.body ?? {});
    const result = await runSandboxCommandSession(
      { organizationId: request.auth.organizationId, sandboxId: id, sessionId, body },
      { query, runtimeProvider, recordEvent }
    );
    if (result.kind !== "ok") return sendCommandSessionError(reply, result);
    return result.response satisfies RunSandboxCommandSessionResponse;
  });

  app.delete("/v1/sandboxes/:id/command-sessions/:sessionId", async (request, reply) => {
    const { id, sessionId } = request.params as { id: string; sessionId: string };
    const result = await deleteSandboxCommandSession(
      { organizationId: request.auth.organizationId, sandboxId: id, sessionId },
      { query, runtimeProvider, recordEvent }
    );
    if (result.kind !== "ok") return sendCommandSessionError(reply, result);
    return result.response satisfies SandboxCommandSessionResponse;
  });

  app.get("/v1/sandboxes/:id/logs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const logs = await listSandboxLogs({ organizationId: request.auth.organizationId, sandboxId: id }, { query, runtimeProvider });
    if (!logs) return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    return { logs } satisfies SandboxLogsResponse;
  });

  app.get("/v1/sandboxes/:id/files", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { path } = request.query as { path?: string };
    const result = await listSandboxFiles({ organizationId: request.auth.organizationId, sandboxId: id, path }, { query, runtimeProvider });
    if (result.kind === "not_found") return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    if (result.kind === "unavailable") return reply.code(502).send(result.files);
    return {
      cwd: result.cwd,
      files: result.files,
      source: result.source,
      warnings: result.warnings
    } satisfies SandboxFilesResponse;
  });

  const sendFileOperationError = (reply: FastifyReply, result: { kind: string; message?: string; code?: string; statusCode?: number; error?: { code: string; message: string; statusCode?: number } }) => {
    if (result.kind === "not_found") return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    if (result.kind === "unsupported") return reply.code(501).send(apiErrorResponse("runtime_file_operation_unsupported", { message: result.message }));
    if (result.kind === "invalid_artifact") {
      return reply.code(result.statusCode ?? 400).send(apiErrorResponse(result.code ?? "sandbox_file_artifact_invalid", { message: result.message }));
    }
    if (result.kind === "file_error" && result.error) {
      return reply.code(result.error.statusCode ?? 502).send(apiErrorResponse(result.error.code, { message: result.error.message }));
    }
    return reply.code(500).send(apiErrorResponse("runtime_file_operation_failed"));
  };

  app.get("/v1/sandboxes/:id/files/stat", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { path } = filePathSchema.parse(request.query ?? {});
    const result = await statSandboxFile({ organizationId: request.auth.organizationId, sandboxId: id, path }, { query, runtimeProvider });
    if (result.kind !== "ok") return sendFileOperationError(reply, result);
    return { file: result.file } satisfies SandboxFileStatResponse;
  });

  app.get("/v1/sandboxes/:id/files/read", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = fileReadSchema.parse(request.query ?? {});
    const result = await readSandboxFile({ organizationId: request.auth.organizationId, sandboxId: id, path: body.path, encoding: body.encoding }, { query, runtimeProvider });
    if (result.kind !== "ok") return sendFileOperationError(reply, result);
    return { path: result.path, encoding: result.encoding, content: result.content } satisfies SandboxFileReadResponse;
  });

  app.get("/v1/sandboxes/:id/files/download", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { path } = filePathSchema.parse(request.query ?? {});
    const result = await downloadSandboxFileArtifact({ organizationId: request.auth.organizationId, sandboxId: id, path }, { query, runtimeProvider });
    if (result.kind !== "ok") return sendFileOperationError(reply, result);
    return { path: result.path, contentBase64: result.contentBase64, sizeBytes: result.sizeBytes, sha256: result.sha256 } satisfies SandboxFileDownloadResponse;
  });

  app.put("/v1/sandboxes/:id/files", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = fileWriteSchema.parse(request.body ?? {});
    const result = await writeSandboxFile({ organizationId: request.auth.organizationId, sandboxId: id, ...body }, { query, runtimeProvider });
    if (result.kind !== "ok") return sendFileOperationError(reply, result);
    return { file: result.file } satisfies SandboxFileWriteResponse;
  });

  app.post("/v1/sandboxes/:id/files/upload", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = fileUploadSchema.parse(request.body ?? {});
    const result = await uploadSandboxFileArtifact({ organizationId: request.auth.organizationId, sandboxId: id, ...body }, { query, runtimeProvider });
    if (result.kind !== "ok") return sendFileOperationError(reply, result);
    return { file: result.file, sizeBytes: result.sizeBytes, sha256: result.sha256 } satisfies SandboxFileUploadResponse;
  });

  app.post("/v1/sandboxes/:id/files/mkdir", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = fileMkdirSchema.parse(request.body ?? {});
    const result = await mkdirSandboxFile({ organizationId: request.auth.organizationId, sandboxId: id, ...body }, { query, runtimeProvider });
    if (result.kind !== "ok") return sendFileOperationError(reply, result);
    return { file: result.file } satisfies SandboxFileMkdirResponse;
  });

  app.delete("/v1/sandboxes/:id/files", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = fileRemoveSchema.parse(request.query ?? {});
    const result = await removeSandboxFile({ organizationId: request.auth.organizationId, sandboxId: id, ...body }, { query, runtimeProvider });
    if (result.kind !== "ok") return sendFileOperationError(reply, result);
    return { ok: true, path: result.path } satisfies SandboxFileRemoveResponse;
  });

  app.post("/v1/sandboxes/:id/files/rename", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = fileRenameSchema.parse(request.body ?? {});
    const result = await renameSandboxFile({ organizationId: request.auth.organizationId, sandboxId: id, ...body }, { query, runtimeProvider });
    if (result.kind !== "ok") return sendFileOperationError(reply, result);
    return { file: result.file } satisfies SandboxFileRenameResponse;
  });

  app.get("/v1/sandboxes/:id/metrics", async (request, reply) => {
    const { id } = request.params as { id: string };
    const metrics = await getSandboxMetrics({ organizationId: request.auth.organizationId, sandboxId: id }, { query, runtimeProvider });
    if (!metrics) return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    return metrics satisfies SandboxMetricsResponse;
  });

  app.get("/v1/sandboxes/:id/egress", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await getSandboxEgress({ organizationId: request.auth.organizationId, sandboxId: id }, { query, runtimeProvider });
    if (result.kind === "not_found") return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    return { egress: result.egress } satisfies SandboxEgressResponse;
  });

  app.patch("/v1/sandboxes/:id/egress", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = egressPatchSchema.parse(request.body ?? {});
    const result = await updateSandboxEgress(
      {
        organizationId: request.auth.organizationId,
        actorUserId: request.auth.userId,
        actorLabel: request.auth.actorLabel,
        sandboxId: id,
        patch: body
      },
      { query, runtimeProvider, recordEvent, recordAudit }
    );
    if (result.kind === "not_found") return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    if (result.kind === "sandbox_terminated") return reply.code(409).send(apiErrorResponse("sandbox_terminated"));
    if (result.kind === "invalid_policy") return reply.code(400).send(apiErrorResponse("egress_policy_invalid", { message: result.message }));
    if (result.kind === "preset_not_allowed") return reply.code(403).send(apiErrorResponse("egress_preset_not_allowed", { preset: result.preset }));
    if (result.kind === "custom_domains_disabled") return reply.code(403).send(apiErrorResponse("egress_custom_domains_disabled"));
    if (result.kind === "rule_limit_exceeded") return reply.code(429).send(apiErrorResponse("egress_rule_limit_exceeded", { limit: result.limit }));
    if (result.kind === "provider_unavailable") return reply.code(502).send(apiErrorResponse("egress_provider_unavailable", { message: result.message }));
    return { egress: result.egress } satisfies SandboxEgressResponse;
  });

  app.post("/v1/sandboxes/:id/egress/test", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = egressTestSchema.parse(request.body ?? {});
    const result = await testSandboxEgress(
      { organizationId: request.auth.organizationId, sandboxId: id, target: body.target },
      {
        query,
        runtimeProvider,
        recordEvent,
        recordAudit,
        actorUserId: request.auth.userId,
        actorLabel: request.auth.actorLabel
      }
    );
    if (result.kind === "not_found") return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    if (result.kind === "sandbox_not_running") return reply.code(409).send(result.response satisfies TestSandboxEgressResponse);
    return result.response satisfies TestSandboxEgressResponse;
  });

  app.get("/v1/sandboxes/:id/routes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const routes = await listSandboxRoutes({ organizationId: request.auth.organizationId, sandboxId: id }, query);
    if (!routes) return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    return { routes } satisfies SandboxRoutesResponse;
  });

  app.post("/v1/sandboxes/:id/routes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = routeSchema.parse(request.body ?? {});
    const result = await createSandboxRoute(
      {
        organizationId: request.auth.organizationId,
        actorUserId: request.auth.userId,
        actorLabel: request.auth.actorLabel,
        sandboxId: id,
        port: body.port,
        protocol: body.protocol,
        accessMode: body.accessMode,
        labels: body.labels,
        idempotencyKey: idempotencyKey(request.headers)
      },
      { query, runtimeProvider, recordEvent, recordAudit }
    );
    if (result.kind === "sandbox_not_found") return reply.code(404).send(apiErrorResponse("sandbox_not_found"));
    if (result.kind === "sandbox_terminated") return reply.code(409).send(apiErrorResponse("sandbox_terminated"));
    if (result.kind === "sandbox_route_limit_exceeded") {
      return reply.code(429).send(apiErrorResponse("sandbox_route_limit_exceeded", { limit: result.limit }));
    }
    if (result.kind === "organization_route_limit_exceeded") {
      return reply.code(429).send(apiErrorResponse("organization_route_limit_exceeded", { limit: result.limit }));
    }
    if (result.kind === "route_access_mode_conflict") {
      return reply.code(409).send(apiErrorResponse("route_access_mode_conflict", { accessMode: result.existing }));
    }
    if (result.kind === "existing") return { route: result.route } satisfies SandboxRouteResponse;
    return reply.code(201).send({
      route: result.route,
      accessToken: result.accessToken,
      accessHeaderName: result.accessHeaderName
    } satisfies SandboxRouteResponse);
  });

  app.delete("/v1/sandboxes/:id/routes/:port", async (request, reply) => {
    const { id, port } = request.params as { id: string; port: string };
    const parsed = routeSchema.pick({ port: true }).parse({ port });
    const route = await deleteSandboxRoute(
      {
        organizationId: request.auth.organizationId,
        actorUserId: request.auth.userId,
        actorLabel: request.auth.actorLabel,
        sandboxId: id,
        port: parsed.port
      },
      { query, recordEvent, recordAudit }
    );
    if (!route) return reply.code(404).send(apiErrorResponse("route_not_found"));
    return { route } satisfies SandboxRouteResponse;
  });
};
