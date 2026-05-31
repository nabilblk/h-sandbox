import { HarakiriClient } from "@h-sandbox/sdk";

const harakiri = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL,
  apiKey: process.env.HARAKIRI_API_KEY
});

let sandbox;
try {
  sandbox = (await harakiri.createSandbox({
    template: "node-20",
    name: "sdk-dev-server",
    wait: true,
    ttlSeconds: 900,
    env: { NODE_ENV: "development" }
  })).sandbox;

  await harakiri.files.write(sandbox.id, {
    path: "/workspace/package.json",
    content: JSON.stringify({ type: "module", scripts: { dev: "node server.mjs" } }, null, 2),
    createParents: true
  });
  await harakiri.files.write(sandbox.id, {
    path: "/workspace/server.mjs",
    content: "import http from 'node:http';\nhttp.createServer((_, res) => res.end('ready')).listen(3000, '0.0.0.0');\n"
  });

  const { command } = await harakiri.commands.start(sandbox.id, {
    command: "npm run dev",
    cwd: "/workspace",
    detached: true
  });
  await harakiri.commands.wait(sandbox.id, command.id, { statuses: ["running"], timeoutMs: 30_000, intervalMs: 500 });

  const route = await harakiri.routes.expose(sandbox.id, { port: 3000, accessMode: "token" });
  console.log(route.route.url);
  console.log(`${route.accessHeaderName}: ${route.accessToken}`);
  await harakiri.renewSandbox(sandbox.id);
} finally {
  if (sandbox) await harakiri.killSandbox(sandbox.id).catch(() => undefined);
}
