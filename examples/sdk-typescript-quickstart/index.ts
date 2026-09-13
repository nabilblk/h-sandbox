import { HarakiriClient } from "@h-sandbox/sdk";

// Unreleased DX API: build/install the workspace SDK before running this example.
const client = HarakiriClient.fromEnv();
const sandbox = await client.sandboxes.create({
  template: process.env.HARAKIRI_TEMPLATE ?? "python-3.12",
  name: "typescript-quickstart",
  ttlSeconds: 300,
  wait: false
});
try {
  await sandbox.wait({ timeoutMs: 180_000 });
  await sandbox.files.write("hello.py", "print('hello from harakiri')\n");
  const result = await sandbox.run("python hello.py", { check: true, timeoutMs: 30_000 });
  console.log(result.stdout.trim());
} finally {
  await sandbox.kill({ wait: true, timeoutMs: 90_000 });
}
