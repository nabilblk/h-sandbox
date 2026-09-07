import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RuntimeProvider } from "../providers/runtime/provider.js";
import type { Query } from "../services/query.js";
import type { Audit } from "../services/sandbox-runtime.js";
import { archiveWorkspace, createWorkspace, getWorkspaceRow, listWorkspaces, workspacePolicy, workspaceSummary } from "../services/persistent-workspaces.js";

const createSchema = z.object({ name: z.string().trim().min(1).max(80).regex(/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u) }).strict();

export async function registerWorkspaceRoutes(app: FastifyInstance, deps: { query: Query; runtimeProvider: RuntimeProvider; recordAudit: Audit }) {
  app.get("/v1/workspaces", async (request) => ({ workspaces: await listWorkspaces(request.auth.organizationId, deps.query), policy: workspacePolicy(deps.runtimeProvider) }));
  app.post("/v1/workspaces", async (request, reply) => {
    const body = createSchema.parse(request.body);
    const workspace = await createWorkspace(request.auth.organizationId, body.name, deps.query, deps.runtimeProvider);
    await deps.recordAudit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "workspace.create", "workspace", workspace.id, { sizeGiB: workspace.sizeGiB });
    return reply.code(201).send({ workspace });
  });
  app.get<{ Params: { id: string } }>("/v1/workspaces/:id", async (request) => ({ workspace: workspaceSummary(await getWorkspaceRow(request.auth.organizationId, request.params.id, deps.query)) }));
  app.post<{ Params: { id: string } }>("/v1/workspaces/:id/archive", async (request) => {
    const workspace = await archiveWorkspace(request.auth.organizationId, request.params.id, deps.query);
    await deps.recordAudit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "workspace.archive", "workspace", workspace.id, { storageRetained: true });
    return { workspace };
  });
}
