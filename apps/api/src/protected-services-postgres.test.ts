import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import pg from "pg";
import { hashApiKey } from "./crypto.js";
import { registerProtectedServiceRoutes } from "./routes/protected-services.js";
import { getSandboxRouteProxyTarget } from "./services/protected-services/access.js";
import { protectedServiceLimits } from "./services/protected-services/limits.js";
import type { Query } from "./services/query.js";

const database = process.env.SERVICE_PROXY_TEST_DATABASE_URL;
if (process.env.SERVICE_PROXY_TEST_REQUIRED === "1" && !database) {
  throw new Error("Required protected-service test database is missing");
}

test("PostgreSQL grants enforce tenant, runtime, expiry and live revocation boundaries", {
  skip: !database, timeout: 30000
}, async () => {
  const connection = new pg.Client({ connectionString: database, statement_timeout: 5000 });
  await connection.connect();
  const schema = `service_${randomUUID().replaceAll("-", "")}`;
  const query: Query = (sql, params) => connection.query(sql, params);
  const app = Fastify();
  const upstream = createServer((_request, response) => response.write("first chunk"));
  const token = randomBytes(32).toString("hex");
  const organization = randomUUID(), otherOrganization = randomUUID();
  const read = (touch = false, suppliedToken = token) => getSandboxRouteProxyTarget({ routeKey: "owned", token: suppliedToken, touch }, query);
  try {
    await query(`CREATE SCHEMA ${schema}`);
    await query(`SET search_path TO ${schema}, public`);
    const migrations = new URL("../../../db/migrations/", import.meta.url);
    for (const name of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
      await query(await readFile(new URL(name, migrations), "utf8"));
    }
    await query("INSERT INTO organizations(id,name,slug) VALUES ($1,'service','service'), ($2,'other','other')", [organization, otherOrganization]);
    await query("INSERT INTO templates(id,name,description,image,icon) VALUES ('service-test','Service','','test:1','box')");
    await query("INSERT INTO sandboxes(id,organization_id,template_id,name,status,owner_label) VALUES ('sbx_service',$1,'service-test','service','running','test')", [organization]);
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    const target = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
    await query(`INSERT INTO sandbox_routes(sandbox_id,organization_id,port,host,target_url,route_key,state,access_mode,access_token_hash,access_header_name)
      VALUES ('sbx_service',$1,8000,'service.test',$2,'owned','ready','token',$3,'x-harakiri-route-token')`, [organization, target, hashApiKey(token)]);

    assert.equal((await read()).kind, "ok");
    assert.equal((await query("SELECT last_used_at FROM sandbox_routes WHERE route_key='owned'")).rows[0].last_used_at, null);
    assert.equal((await read(false, "wrong")).kind, "unauthorized");
    assert.equal((await read(true)).kind, "ok");
    assert.ok((await query("SELECT last_used_at FROM sandbox_routes WHERE route_key='owned'")).rows[0].last_used_at);

    await query("UPDATE sandbox_routes SET organization_id=$1 WHERE route_key='owned'", [otherOrganization]);
    assert.equal((await read()).kind, "not_found");
    await query("UPDATE sandbox_routes SET organization_id=$1 WHERE route_key='owned'", [organization]);
    for (const status of ["pending", "paused", "failed", "terminated"]) {
      await query("UPDATE sandboxes SET status=$1 WHERE id='sbx_service'", [status]);
      assert.equal((await read()).kind, "not_found", status);
    }
    await query("UPDATE sandboxes SET status='running' WHERE id='sbx_service'");
    for (const column of ["expires_at", "provider_expires_at"]) {
      await query(`UPDATE sandboxes SET ${column}=now()-interval '1 second' WHERE id='sbx_service'`);
      assert.equal((await read()).kind, "not_found", column);
      await query(`UPDATE sandboxes SET ${column}=now()+interval '1 hour' WHERE id='sbx_service'`);
      assert.equal((await read()).kind, "ok");
    }
    await query("UPDATE sandbox_routes SET state='unhealthy' WHERE route_key='owned'");
    assert.deepEqual(await read(), { kind: "route_not_ready", state: "unhealthy" });
    await query("UPDATE sandbox_routes SET state='ready',access_mode='public' WHERE route_key='owned'");
    assert.equal((await read()).kind, "public_route");
    await query("UPDATE sandbox_routes SET access_mode='token' WHERE route_key='owned'");

    await app.register(websocket);
    await registerProtectedServiceRoutes(app, { query, limits: { ...protectedServiceLimits(), authorizationIntervalMs: 20, authorizationTimeoutMs: 2000 } });
    const origin = await app.listen({ host: "127.0.0.1", port: 0 });
    const url = `${origin}/v1/route-proxy/owned`;
    const response = await fetch(url, { headers: { "x-harakiri-route-token": token }, signal: AbortSignal.timeout(10000) });
    const reader = response.body!.getReader();
    assert.equal(new TextDecoder().decode((await reader.read()).value), "first chunk");
    await query("UPDATE sandbox_routes SET state='terminated' WHERE route_key='owned'");
    await assert.rejects(reader.read());
    assert.equal((await fetch(url, { headers: { "x-harakiri-route-token": token } })).status, 404);
  } finally {
    app.server.closeAllConnections();
    await app.close();
    upstream.closeAllConnections();
    upstream.close();
    await query("SET search_path TO public");
    await query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await connection.end();
  }
});
