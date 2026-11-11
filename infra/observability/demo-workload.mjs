import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { context, trace, SpanStatusCode } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { TracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace";
import { LoggerProvider, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";

const execute = promisify(execFile);

/** Controlled local processes, not fabricated API responses or sandbox execution. */
export async function recordDemoWorkload(grant, { repair = true } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "harakiri-observed-workload-"));
  const resource = resourceFromAttributes({ "service.name": "local-file-validation-demo" });
  const provider = new TracerProvider({ resource, spanProcessors: [new SimpleSpanProcessor({
    exporter: new OTLPTraceExporter({ ...grant.exporterOptions("traces"), timeoutMillis: 3000 })
  })] });
  const logger = new LoggerProvider({ resource, processors: [new SimpleLogRecordProcessor({
    exporter: new OTLPLogExporter({ ...grant.exporterOptions("logs"), timeoutMillis: 3000 })
  })] });
  const tracer = provider.getTracer("harakiri.local-demo", "1");
  const root = tracer.startSpan("Local report validation (no model or sandbox runtime)");
  const rootContext = trace.setSpan(context.active(), root);
  const steps = [];
  const run = async (name, source) => {
    const span = tracer.startSpan(name, { attributes: { "gen_ai.tool.name": "node_validation" } }, rootContext);
    const spanContext = trace.setSpan(rootContext, span);
    const log = (body, error = false) => logger.getLogger("harakiri.local-demo").emit({
      context: spanContext, severityText: error ? "ERROR" : "INFO", severityNumber: error ? 17 : 9, body
    });
    try {
      const { stdout, stderr } = await execute(process.execPath, ["--max-old-space-size=64", "--input-type=module", "-e", source], {
        cwd: directory, env: {}, timeout: 5000, maxBuffer: 8192
      });
      if (stdout) log(stdout.trim());
      if (stderr) log(stderr.trim(), true);
      span.setStatus({ code: SpanStatusCode.OK });
      steps.push({ name, exitCode: 0 });
      return true;
    } catch (error) {
      log(String(error.stderr || error.message).replaceAll(directory, "<owned-workdir>").slice(0, 8192), true);
      span.setStatus({ code: SpanStatusCode.ERROR, message: "Local validation process failed" });
      steps.push({ name, exitCode: typeof error.code === "number" ? error.code : null });
      return false;
    } finally { span.end(); }
  };
  let passed = false;
  try {
    await writeFile(path.join(directory, "orders.csv"), "item,amount\nalpha,15\nbeta,20\ngamma,7\n", { mode: 0o600 });
    assert.ok(await run("Read controlled input", `import fs from "node:fs"; console.log(fs.readFileSync("orders.csv", "utf8"));`));
    const parse = `import fs from "node:fs"; import assert from "node:assert/strict";
      const amounts = fs.readFileSync("orders.csv", "utf8").trim().split("\\n").slice(1).map(line => line.split(",")[1]);`;
    const first = await run("Validate total / first attempt", `${parse}
      const total = amounts.reduce((sum, amount) => sum + amount, 0);
      assert.equal(total, 42, "Amounts must be numeric, not concatenated strings");`);
    assert.equal(first, false, "The controlled regression must fail before the repair");
    if (repair) {
      assert.ok(await run("Convert amounts and retry", `${parse}
        const total = amounts.reduce((sum, amount) => sum + Number(amount), 0);
        assert.equal(total, 42);
        fs.writeFileSync("report.json", JSON.stringify({ rows: amounts.length, total }));
        console.log("PASS: 3 orders, total 42. report.json written.");`));
      assert.ok(await run("Independently verify the report", `import fs from "node:fs"; import assert from "node:assert/strict";
        assert.deepEqual(JSON.parse(fs.readFileSync("report.json", "utf8")), { rows: 3, total: 42 });
        console.log("PASS: report contents independently verified.");`));
      assert.deepEqual(JSON.parse(await readFile(path.join(directory, "report.json"), "utf8")), { rows: 3, total: 42 });
      passed = true;
    }
    root.setStatus({ code: passed ? SpanStatusCode.OK : SpanStatusCode.ERROR });
    return { outcome: passed ? "succeeded" : "failed", steps, traceId: root.spanContext().traceId };
  } finally {
    root.end();
    try {
      await provider.forceFlush();
      await logger.forceFlush();
    } finally {
      try { await provider.shutdown(); }
      finally { try { await logger.shutdown(); } finally { await rm(directory, { recursive: true, force: true }); } }
    }
  }
}
