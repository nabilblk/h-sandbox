import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TEMPLATES } from "@harakiri/shared";
import { requireAuth } from "./auth.js";
import { config } from "./config.js";
import { createApiKey, makeId } from "./crypto.js";
import { query } from "./db.js";
import { openSandbox } from "./opensandbox.js";

const createSandboxSchema = z.object({
  template: z.string().default("python-3.12-data"),
  name: z.string().optional(),
  ttlSeconds: z.number().int().min(10).max(86400).default(300)
});

const runSchema = z.object({
  command: z.string().optional(),
  stdin: z.string().optional()
});

const routeSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535),
  protocol: z.enum(["http", "https"]).default("http")
});

const apiKeySchema = z.object({
  name: z.string().min(1).default("cli")
});

const settingsSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  idleTtlSeconds: z.number().int().min(10).max(86400).optional(),
  maxConcurrency: z.number().int().min(1).max(10000).optional(),
  defaultTemplateId: z.string().optional()
});

const sandboxSelect = `
  SELECT s.id, s.opensandbox_id AS "opensandboxId", s.name, s.template_id AS template,
         s.status, s.cpu_pct AS cpu, s.memory_mb AS mem,
         COALESCE(to_char(now() - s.started_at, 'HH24"h "MI"m"'), '-') AS started,
         s.owner_label AS owner, s.cost_usd::float AS cost, s.ttl_seconds AS "ttlSeconds",
         s.expires_at AS "expiresAt", s.public_url AS "publicUrl", s.created_at AS "createdAt"
  FROM sandboxes s
`;

const routeSelect = `
  SELECT port, protocol, route_key AS "routeKey", host,
         COALESCE(url, target_url) AS url,
         target_url AS "targetUrl",
         state, provider, provider_route_id AS "providerRouteId",
         created_at AS "createdAt",
         last_checked_at AS "lastCheckedAt",
         terminated_at AS "terminatedAt"
  FROM sandbox_routes
`;

const audit = async (organizationId: string, actorUserId: string, actorLabel: string, action: string, targetType: string, targetId?: string, metadata = {}) => {
  await query(
    `INSERT INTO audit_events (organization_id, actor_user_id, actor_label, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [organizationId, actorUserId, actorLabel, action, targetType, targetId ?? null, metadata]
  );
};

const event = async (organizationId: string, sandboxId: string, type: string, message: string, metadata = {}) => {
  await query(
    `INSERT INTO sandbox_events (sandbox_id, organization_id, type, message, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [sandboxId, organizationId, type, message, metadata]
  );
};

export const registerRoutes = async (app: FastifyInstance) => {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/v1/bootstrap", async () => ({
    apiUrl: config.publicApiUrl,
    keycloak: {
      url: process.env.PUBLIC_KEYCLOAK_URL ?? "http://127.0.0.1:8081",
      realm: process.env.PUBLIC_KEYCLOAK_REALM ?? "harakiri",
      clientId: process.env.PUBLIC_KEYCLOAK_CLIENT_ID ?? "harakiri-web"
    }
  }));

  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/health" || request.url === "/v1/bootstrap") return;
    return requireAuth(request, reply);
  });

  app.get("/v1/me", async (request) => {
    const org = await query(
      `SELECT o.id, o.name, o.slug, o.default_template_id AS "defaultTemplateId",
              o.idle_ttl_seconds AS "idleTtlSeconds", o.max_concurrency AS "maxConcurrency"
       FROM organizations o WHERE o.id = $1`,
      [request.auth.organizationId]
    );
    const user = await query(
      `SELECT id, email, full_name AS "fullName", onboarding_completed_at AS "onboardingCompletedAt"
       FROM users WHERE id = $1`,
      [request.auth.userId]
    );
    return { auth: request.auth, user: user.rows[0], organization: org.rows[0] };
  });

  app.post("/v1/me/onboarding/complete", async (request) => {
    const result = await query(
      `UPDATE users
       SET onboarding_completed_at = COALESCE(onboarding_completed_at, now()), updated_at = now()
       WHERE id = $1
       RETURNING id, email, full_name AS "fullName", onboarding_completed_at AS "onboardingCompletedAt"`,
      [request.auth.userId]
    );
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "onboarding.complete", "user", request.auth.userId);
    return { user: result.rows[0] };
  });

  app.get("/v1/templates", async () => {
    const result = await query<{ id: string; name: string; prefix: string; lastFour: string; createdAt: Date }>(
      `SELECT id, name, description, image, icon, tags, boot_ms AS "bootMs",
              visibility, default_entrypoint AS "defaultEntrypoint"
       FROM templates ORDER BY boot_ms ASC`
    );
    return { templates: result.rows.length ? result.rows : TEMPLATES };
  });

  app.get("/v1/sandboxes", async (request) => {
    const { status, q } = request.query as { status?: string; q?: string };
    const params: unknown[] = [request.auth.organizationId];
    let where = "WHERE s.organization_id = $1";
    if (status && status !== "all") {
      params.push(status);
      where += ` AND s.status = $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (s.id ILIKE $${params.length} OR s.name ILIKE $${params.length})`;
    }
    const result = await query(`${sandboxSelect} ${where} ORDER BY s.created_at DESC`, params);
    return { sandboxes: result.rows };
  });

  app.post("/v1/sandboxes", async (request, reply) => {
    const body = createSandboxSchema.parse(request.body ?? {});
    const template = TEMPLATES.find((item) => item.id === body.template) ?? TEMPLATES[0];
    const id = makeId("sbx", 10);
    const name = body.name?.trim() || `${template.id}-runner`;
    const provider = await openSandbox.create({
      templateId: template.id,
      ttlSeconds: body.ttlSeconds,
      name,
      metadata: { "harakiri.id": id, "harakiri.org": request.auth.organizationId }
    });
    const publicUrl = `${id}.sandbox.harakiri.local`;
    await query(
      `INSERT INTO sandboxes
       (id, opensandbox_id, organization_id, template_id, name, status, cpu_pct, memory_mb,
        owner_id, owner_label, ttl_seconds, started_at, last_active_at, expires_at, public_url)
       VALUES ($1, $2, $3, $4, $5, 'running', 3, 128, $6, $7, $8, now(), now(), now() + make_interval(secs => $8::int), $9)`,
      [id, provider.id, request.auth.organizationId, template.id, name, request.auth.userId, request.auth.actorLabel, body.ttlSeconds, publicUrl]
    );
    await query(
      `INSERT INTO sandbox_schedules (sandbox_id, organization_id, kind, run_at)
       VALUES ($1, $2, 'idle_ttl', now() + make_interval(secs => $3::int))`,
      [id, request.auth.organizationId, body.ttlSeconds]
    );
    await event(request.auth.organizationId, id, "created", `created through ${provider.provider}`, { opensandboxId: provider.id });
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "sandbox.create", "sandbox", id);
    const result = await query(`${sandboxSelect} WHERE s.id = $1 AND s.organization_id = $2`, [id, request.auth.organizationId]);
    return reply.code(201).send({ sandbox: result.rows[0] });
  });

  app.get("/v1/sandboxes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await query(`${sandboxSelect} WHERE s.id = $1 AND s.organization_id = $2`, [id, request.auth.organizationId]);
    if (!result.rowCount) return reply.code(404).send({ error: "sandbox_not_found" });
    return { sandbox: result.rows[0] };
  });

  app.delete("/v1/sandboxes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await query<{ opensandbox_id: string | null }>(
      "SELECT opensandbox_id FROM sandboxes WHERE id = $1 AND organization_id = $2",
      [id, request.auth.organizationId]
    );
    if (!result.rowCount) return reply.code(404).send({ error: "sandbox_not_found" });
    if (result.rows[0].opensandbox_id) await openSandbox.delete(result.rows[0].opensandbox_id);
    await query("UPDATE sandboxes SET status = 'terminated', updated_at = now() WHERE id = $1", [id]);
    await query("UPDATE sandbox_routes SET state = 'terminated', terminated_at = COALESCE(terminated_at, now()), updated_at = now() WHERE sandbox_id = $1", [id]);
    await event(request.auth.organizationId, id, "terminated", "sandbox terminated - disk zeroed");
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "sandbox.kill", "sandbox", id);
    return { ok: true };
  });

  app.post("/v1/sandboxes/:id/renew", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await query<{ opensandbox_id: string | null; ttl_seconds: number }>(
      "SELECT opensandbox_id, ttl_seconds FROM sandboxes WHERE id = $1 AND organization_id = $2",
      [id, request.auth.organizationId]
    );
    if (!result.rowCount) return reply.code(404).send({ error: "sandbox_not_found" });
    if (result.rows[0].opensandbox_id) await openSandbox.renew(result.rows[0].opensandbox_id);
    await query("UPDATE sandboxes SET expires_at = now() + (ttl_seconds || ' seconds')::interval, last_active_at = now() WHERE id = $1", [id]);
    await event(request.auth.organizationId, id, "renewed", "ttl reset");
    return { ok: true };
  });

  app.post("/v1/sandboxes/:id/run", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = runSchema.parse(request.body ?? {});
    const sandbox = await query<{ id: string; opensandbox_id: string | null }>("SELECT id, opensandbox_id FROM sandboxes WHERE id = $1 AND organization_id = $2", [id, request.auth.organizationId]);
    if (!sandbox.rowCount) return reply.code(404).send({ error: "sandbox_not_found" });
    const command = body.command ?? (body.stdin ? "python agent.py" : "ls");
    const result = await openSandbox.run({ sandboxId: id, opensandboxId: sandbox.rows[0].opensandbox_id, command, stdin: body.stdin });
    await query("UPDATE sandboxes SET last_active_at = now(), expires_at = now() + (ttl_seconds || ' seconds')::interval WHERE id = $1", [id]);
    await event(request.auth.organizationId, id, "run", `command: ${command}`, { exitCode: result.exitCode, durationMs: result.durationMs });
    return { result };
  });

  app.get("/v1/sandboxes/:id/logs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const sandbox = await query<{ opensandbox_id: string | null }>(
      "SELECT opensandbox_id FROM sandboxes WHERE id = $1 AND organization_id = $2",
      [id, request.auth.organizationId]
    );
    if (!sandbox.rowCount) return reply.code(404).send({ error: "sandbox_not_found" });
    const controlPlaneLogs = await query<{ ts: Date; lvl: string; msg: string }>(
      `SELECT created_at AS ts, type AS lvl, message AS msg
       FROM sandbox_events WHERE sandbox_id = $1 AND organization_id = $2 ORDER BY created_at ASC LIMIT 200`,
      [id, request.auth.organizationId]
    );
    const runtimeLogs = await openSandbox.logs(sandbox.rows[0].opensandbox_id).catch(() => []);
    const logs: Array<{ ts: string; lvl: string; msg: string; source: string }> = [
      ...controlPlaneLogs.rows.map((row) => ({ ...row, ts: new Date(row.ts).toISOString(), source: "control-plane" })),
      ...runtimeLogs
    ].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    return { logs };
  });

  app.get("/v1/sandboxes/:id/files", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { path } = request.query as { path?: string };
    const sandbox = await query<{ opensandbox_id: string | null }>(
      "SELECT opensandbox_id FROM sandboxes WHERE id = $1 AND organization_id = $2",
      [id, request.auth.organizationId]
    );
    if (!sandbox.rowCount) return reply.code(404).send({ error: "sandbox_not_found" });
    return openSandbox.files(sandbox.rows[0].opensandbox_id, path ?? "/");
  });

  app.get("/v1/sandboxes/:id/metrics", async (request, reply) => {
    const { id } = request.params as { id: string };
    const sandbox = await query<{ opensandbox_id: string | null; cpu_pct: number; memory_mb: number }>(
      "SELECT opensandbox_id, cpu_pct, memory_mb FROM sandboxes WHERE id = $1 AND organization_id = $2",
      [id, request.auth.organizationId]
    );
    if (!sandbox.rowCount) return reply.code(404).send({ error: "sandbox_not_found" });
    const liveMetrics = await openSandbox.metrics(sandbox.rows[0].opensandbox_id).catch(() => null);
    if (liveMetrics) {
      await query("UPDATE sandboxes SET cpu_pct = $1, memory_mb = $2, updated_at = now() WHERE id = $3", [
        liveMetrics.current.cpu,
        liveMetrics.current.mem,
        id
      ]);
      return liveMetrics;
    }
    const ts = new Date().toISOString();
    return {
      current: { cpu: sandbox.rows[0].cpu_pct, mem: sandbox.rows[0].memory_mb, diskIo: 0, networkOut: 0 },
      series: [{ ts, cpu: sandbox.rows[0].cpu_pct, mem: sandbox.rows[0].memory_mb }]
    };
  });

  app.get("/v1/sandboxes/:id/routes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const sandbox = await query<{ opensandbox_id: string | null }>(
      "SELECT opensandbox_id FROM sandboxes WHERE id = $1 AND organization_id = $2",
      [id, request.auth.organizationId]
    );
    if (!sandbox.rowCount) return reply.code(404).send({ error: "sandbox_not_found" });
    const existing = await query(`${routeSelect} WHERE sandbox_id = $1 AND organization_id = $2 ORDER BY port ASC`, [id, request.auth.organizationId]);
    return { routes: existing.rows };
  });

  app.post("/v1/sandboxes/:id/routes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = routeSchema.parse(request.body ?? {});
    const sandbox = await query<{ id: string; opensandbox_id: string | null; status: string }>(
      "SELECT id, opensandbox_id, status FROM sandboxes WHERE id = $1 AND organization_id = $2",
      [id, request.auth.organizationId]
    );
    if (!sandbox.rowCount) return reply.code(404).send({ error: "sandbox_not_found" });
    if (sandbox.rows[0].status === "terminated") return reply.code(409).send({ error: "sandbox_terminated" });

    const existing = await query(`${routeSelect} WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3`, [
      id,
      request.auth.organizationId,
      body.port
    ]);
    if (existing.rowCount) return { route: existing.rows[0] };

    const [sandboxRouteCount, orgRouteCount] = await Promise.all([
      query<{ count: string }>("SELECT count(*) FROM sandbox_routes WHERE sandbox_id = $1 AND state <> 'terminated'", [id]),
      query<{ count: string }>("SELECT count(*) FROM sandbox_routes WHERE organization_id = $1 AND state <> 'terminated'", [request.auth.organizationId])
    ]);
    if (Number(sandboxRouteCount.rows[0]?.count ?? 0) >= config.sandboxMaxRoutesPerSandbox) {
      return reply.code(429).send({ error: "sandbox_route_limit_exceeded", limit: config.sandboxMaxRoutesPerSandbox });
    }
    if (Number(orgRouteCount.rows[0]?.count ?? 0) >= config.sandboxMaxRoutesPerOrg) {
      return reply.code(429).send({ error: "organization_route_limit_exceeded", limit: config.sandboxMaxRoutesPerOrg });
    }

    const providerRoute = sandbox.rows[0].opensandbox_id
      ? await openSandbox.ensureRoute(sandbox.rows[0].opensandbox_id, body.port)
      : {
          routeKey: `${id.replace(/[^A-Za-z0-9-]+/g, "-")}-${body.port}`,
          host: `${id.replace(/[^A-Za-z0-9-]+/g, "-")}-${body.port}.sandbox.localhost`,
          url: `http://${id.replace(/[^A-Za-z0-9-]+/g, "-")}-${body.port}.sandbox.localhost:${body.port}`,
          targetUrl: `http://${id.replace(/[^A-Za-z0-9-]+/g, "-")}-${body.port}.sandbox.localhost:${body.port}`,
          provider: "fallback-local",
          providerRouteId: null,
          state: "ready" as const
        };

    await query(
      `INSERT INTO sandbox_routes
       (sandbox_id, organization_id, port, protocol, route_key, host, url, target_url, state, provider, provider_route_id, last_checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       ON CONFLICT (sandbox_id, port) DO NOTHING`,
      [
        id,
        request.auth.organizationId,
        body.port,
        body.protocol,
        providerRoute.routeKey,
        providerRoute.host,
        providerRoute.url,
        providerRoute.targetUrl,
        providerRoute.state,
        providerRoute.provider,
        providerRoute.providerRouteId
      ]
    );
    await event(request.auth.organizationId, id, "route.created", `exposed ${body.protocol} port ${body.port}`, {
      port: body.port,
      routeKey: providerRoute.routeKey,
      provider: providerRoute.provider
    });
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "sandbox.route.create", "sandbox", id, {
      port: body.port,
      routeKey: providerRoute.routeKey
    });
    const created = await query(`${routeSelect} WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3`, [
      id,
      request.auth.organizationId,
      body.port
    ]);
    return reply.code(201).send({ route: created.rows[0] });
  });

  app.delete("/v1/sandboxes/:id/routes/:port", async (request, reply) => {
    const { id, port } = request.params as { id: string; port: string };
    const parsed = routeSchema.pick({ port: true }).parse({ port });
    const result = await query(
      `${routeSelect}
       WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3`,
      [id, request.auth.organizationId, parsed.port]
    );
    if (!result.rowCount) return reply.code(404).send({ error: "route_not_found" });
    await query(
      `UPDATE sandbox_routes
       SET state = 'terminated', terminated_at = COALESCE(terminated_at, now()), updated_at = now()
       WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3`,
      [id, request.auth.organizationId, parsed.port]
    );
    await event(request.auth.organizationId, id, "route.terminated", `route for port ${parsed.port} disabled`, { port: parsed.port });
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "sandbox.route.delete", "sandbox", id, { port: parsed.port });
    const updated = await query(`${routeSelect} WHERE sandbox_id = $1 AND organization_id = $2 AND port = $3`, [
      id,
      request.auth.organizationId,
      parsed.port
    ]);
    return { route: updated.rows[0] };
  });

  app.get("/v1/api-keys", async (request) => {
    const result = await query(
      `SELECT id, name, prefix, last_four AS "lastFour", created_at AS "createdAt",
              last_used_at AS "lastUsedAt", revoked_at AS "revokedAt"
       FROM api_keys WHERE organization_id = $1 ORDER BY created_at DESC`,
      [request.auth.organizationId]
    );
    return { keys: result.rows };
  });

  app.post("/v1/api-keys", async (request, reply) => {
    const body = apiKeySchema.parse(request.body ?? {});
    const key = createApiKey("live");
    const result = await query(
      `INSERT INTO api_keys (organization_id, name, key_hash, prefix, last_four)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, prefix, last_four AS "lastFour", created_at AS "createdAt"`,
      [request.auth.organizationId, body.name, key.hash, key.prefix, key.lastFour]
    );
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "api_key.create", "api_key", result.rows[0].id);
    return reply.code(201).send({ key: result.rows[0], token: key.token });
  });

  app.delete("/v1/api-keys/:id", async (request) => {
    const { id } = request.params as { id: string };
    await query("UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND organization_id = $2", [id, request.auth.organizationId]);
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "api_key.revoke", "api_key", id);
    return { ok: true };
  });

  app.get("/v1/usage", async (request) => {
    const counts = await query<{ status: string; count: string }>(
      "SELECT status, count(*) FROM sandboxes WHERE organization_id = $1 GROUP BY status",
      [request.auth.organizationId]
    );
    const topTemplates = await query<{ label: string; value: string }>(
      `SELECT template_id AS label, count(*)::text AS value
       FROM sandboxes
       WHERE organization_id = $1
       GROUP BY template_id
       ORDER BY count(*) DESC, template_id ASC
       LIMIT 5`,
      [request.auth.organizationId]
    );
    const runtime = await query<{ compute_hours: string | null; avg_runtime_seconds: string | null }>(
      `SELECT
         COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(last_active_at, updated_at, now()) - started_at))) / 3600, 0)::numeric(10,2) AS compute_hours,
         COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(last_active_at, updated_at, now()) - started_at))), 0)::numeric(10,2) AS avg_runtime_seconds
       FROM sandboxes
       WHERE organization_id = $1 AND started_at IS NOT NULL`,
      [request.auth.organizationId]
    );
    const total = counts.rows.reduce((sum, row) => sum + Number(row.count), 0);
    const concurrentNow = Number(counts.rows.find((row) => row.status === "running")?.count ?? 0);
    return {
      sandboxesSpawned: total,
      computeHours: Number(runtime.rows[0]?.compute_hours ?? 0),
      avgColdStartMs: total ? Math.round(TEMPLATES.reduce((sum, template) => sum + template.bootMs, 0) / TEMPLATES.length) : 0,
      avgRuntimeSeconds: Number(runtime.rows[0]?.avg_runtime_seconds ?? 0),
      concurrentNow,
      concurrentPeak: concurrentNow,
      series: Array.from({ length: 14 * 24 }, () => concurrentNow),
      topTemplates: topTemplates.rows.map((row) => ({ label: row.label, value: Number(row.value) })),
      statusBreakdown: counts.rows.map((row) => ({ label: row.status, value: Number(row.count) }))
    };
  });

  app.get("/v1/org/settings", async (request) => {
    const result = await query(
      `SELECT id, name, slug, default_template_id AS "defaultTemplateId",
              idle_ttl_seconds AS "idleTtlSeconds", max_concurrency AS "maxConcurrency"
       FROM organizations WHERE id = $1`,
      [request.auth.organizationId]
    );
    return { organization: result.rows[0] };
  });

  app.patch("/v1/org/settings", async (request) => {
    const body = settingsSchema.parse(request.body ?? {});
    const current = await query<{
      name: string;
      slug: string;
      default_template_id: string;
      idle_ttl_seconds: number;
      max_concurrency: number;
    }>("SELECT * FROM organizations WHERE id = $1", [request.auth.organizationId]);
    const next = {
      name: body.name ?? current.rows[0].name,
      slug: body.slug ?? current.rows[0].slug,
      defaultTemplateId: body.defaultTemplateId ?? current.rows[0].default_template_id,
      idleTtlSeconds: body.idleTtlSeconds ?? current.rows[0].idle_ttl_seconds,
      maxConcurrency: body.maxConcurrency ?? current.rows[0].max_concurrency
    };
    const result = await query(
      `UPDATE organizations
       SET name = $2, slug = $3, default_template_id = $4,
           idle_ttl_seconds = $5, max_concurrency = $6, updated_at = now()
       WHERE id = $1
       RETURNING id, name, slug, default_template_id AS "defaultTemplateId",
                 idle_ttl_seconds AS "idleTtlSeconds", max_concurrency AS "maxConcurrency"`,
      [request.auth.organizationId, next.name, next.slug, next.defaultTemplateId, next.idleTtlSeconds, next.maxConcurrency]
    );
    await audit(request.auth.organizationId, request.auth.userId, request.auth.actorLabel, "org.update", "organization", request.auth.organizationId, body);
    return { organization: result.rows[0] };
  });
};
