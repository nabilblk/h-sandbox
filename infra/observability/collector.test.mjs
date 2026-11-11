import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collectorConfig } from "./collector.mjs";

const destinations = {
  logsEndpoint: "http://logs:9428/insert/opentelemetry",
  tracesEndpoint: "http://traces:10428/insert/opentelemetry"
};

test("privacy precedes batching and durable export for both signals", () => {
  const config = collectorConfig(destinations);
  for (const pipeline of Object.values(config.service.pipelines)) {
    assert.deepEqual(pipeline.processors, ["memory_limiter", "filter/binding", "transform/privacy", "batch/tenant"]);
    assert.equal(pipeline.exporters.length, 1);
  }
  assert.equal(config.processors["transform/privacy"].error_mode, "propagate");
  for (const target of ["span", "log"]) {
    assert.ok(JSON.stringify(config.processors["transform/privacy"]).includes(
      JSON.stringify(`delete_key(${target}.attributes, "harakiri.content.truncated") where ${target}.attributes["harakiri.content.truncated"] != true`).slice(1, -1)
    ));
  }
  assert.equal(config.processors["filter/binding"].error_mode, "propagate");
  assert.deepEqual(config.processors["batch/tenant"].metadata_keys, ["x-harakiri-tenant"]);
  assert.equal(config.processors["batch/tenant"].metadata_cardinality_limit, 128);
  for (const exporter of Object.values(config.exporters)) {
    assert.equal(exporter.sending_queue.storage, "file_storage/queue");
    assert.equal(exporter.sending_queue.sizer, "bytes");
    assert.equal(exporter.sending_queue.block_on_overflow, false);
    assert.ok(exporter.sending_queue.queue_size <= 8 * 1024 * 1024);
  }
});

test("private ingress requires authentication, includes metadata, and bounds payloads", () => {
  const config = collectorConfig(destinations);
  const receiver = config.receivers.otlp.protocols.http;
  assert.equal(receiver.auth.authenticator, "bearertokenauth/ingress");
  assert.equal(receiver.include_metadata, true);
  assert.equal(receiver.max_request_body_size, 1024 * 1024);
  assert.equal(config.extensions["bearertokenauth/ingress"].token, "${env:HARAKIRI_COLLECTOR_TOKEN}");
  assert.equal(config.service.telemetry.logs.level, "error");
  assert.deepEqual(config.exporters["otlp_http/logs"].headers, { "VL-Stream-Fields": "service.name" });
  assert.equal(JSON.stringify(config.exporters).includes("debug"), false);
  assert.deepEqual(config.extensions["headers_setter/tenant"].headers, [
    { key: "AccountID", from_context: "x-harakiri-tenant" }, { key: "ProjectID", value: "0" }
  ]);
});

test("OpenInference payloads are accepted only by the content capture allowlist", () => {
  const privacy = collectorConfig(destinations).processors["transform/privacy"];
  for (const [target, statements] of [["span", privacy.trace_statements[0].statements], ["log", privacy.log_statements[0].statements]]) {
    const allow = statements.filter(statement => statement.startsWith(`keep_keys(${target}.attributes,`));
    assert.equal(allow.length, 2);
    for (const field of ["input.value", "output.value"]) {
      assert.ok(allow[0].includes(`"${field}"`));
      assert.ok(!allow[1].includes(`"${field}"`));
      assert.ok(statements.some(statement => statement.includes(`Len(${target}.attributes["${field}"]) > 32768`)));
    }
    assert.ok(allow[1].includes('x-harakiri-capture'));
  }
});

test("destinations cannot smuggle authentication or arbitrary URL protocols", () => {
  for (const url of ["file:///tmp/data", "ftp://logs", "http://user:password@logs", "http://logs?token=secret", "http://logs#fragment"]) {
    assert.throws(() => collectorConfig({ ...destinations, logsEndpoint: url }));
    assert.throws(() => collectorConfig({ ...destinations, externalEndpoint: url }));
  }
});

test("optional fan-out shares the privacy boundary but has separate bounded queues and credentials", () => {
  const config = collectorConfig({ ...destinations, externalEndpoint: "https://otel.example.test" });
  for (const [signal, pipeline] of Object.entries(config.service.pipelines)) {
    assert.deepEqual(pipeline.exporters, [`otlp_http/${signal}`, "otlp_http/external"]);
    assert.ok(pipeline.processors.indexOf("transform/privacy") < pipeline.processors.indexOf("batch/tenant"));
  }
  const external = config.exporters["otlp_http/external"];
  assert.equal(external.endpoint, "https://otel.example.test");
  assert.equal(external.auth, undefined);
  assert.deepEqual(external.headers, { Authorization: "${env:HARAKIRI_EXTERNAL_OTLP_AUTHORIZATION}" });
  assert.equal(external.sending_queue.block_on_overflow, false);
  assert.equal(external.sending_queue.queue_size, 8 * 1024 * 1024);
});

test("qualification artifacts are digest pinned", async () => {
  const images = JSON.parse(await readFile(new URL("./images.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(images).sort(), ["collector", "logs", "traces"]);
  for (const image of Object.values(images)) assert.match(image, /:[0-9v][^@]+@sha256:[0-9a-f]{64}$/);
});

test("packaged Collector configuration and images cannot drift from qualification", async () => {
  const root = new URL("../charts/harakiri/files/", import.meta.url);
  const config = JSON.parse(await readFile(new URL("observability-collector.json", root), "utf8"));
  assert.deepEqual(config, collectorConfig({
    logsEndpoint: "http://HARAKIRI_OBSERVABILITY-logs:9428/insert/opentelemetry",
    tracesEndpoint: "http://HARAKIRI_OBSERVABILITY-traces:10428/insert/opentelemetry"
  }));
  assert.deepEqual(JSON.parse(await readFile(new URL("observability-images.json", root), "utf8")),
    JSON.parse(await readFile(new URL("./images.json", import.meta.url), "utf8")));
});
