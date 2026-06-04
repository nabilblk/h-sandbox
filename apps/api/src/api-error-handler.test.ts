import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { z } from "zod";
import { registerApiErrorHandler } from "./api-error-handler.js";

test("zod validation errors return a structured 400 response", async () => {
  const app = Fastify({ logger: false });
  registerApiErrorHandler(app);
  app.post("/validate", async (request) => {
    z.object({ waitTimeoutMs: z.number().int().max(30000) }).parse(request.body ?? {});
    return { ok: true };
  });

  const response = await app.inject({
    method: "POST",
    url: "/validate",
    payload: { waitTimeoutMs: 240000 }
  });

  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.equal(body.error, "validation_error");
  assert.match(body.message, /waitTimeoutMs/);
  assert.deepEqual(body.issues[0].path, ["waitTimeoutMs"]);
  await app.close();
});
