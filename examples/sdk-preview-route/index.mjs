import { HarakiriClient } from "@harakiri/sdk";

const harakiri = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL,
  apiKey: process.env.HARAKIRI_API_KEY
});

let sandbox;
try {
  sandbox = (await harakiri.createSandbox({ template: "python-3.12", name: "sdk-preview-route", wait: true })).sandbox;
  const { command } = await harakiri.commands.start(sandbox.id, {
    command: "python -m http.server 5173 --bind 0.0.0.0",
    cwd: "/workspace",
    detached: true
  });
  await harakiri.commands.wait(sandbox.id, command.id, { statuses: ["running"], timeoutMs: 30_000, intervalMs: 500 });

  const route = await harakiri.routes.expose(sandbox.id, { port: 5173, accessMode: "token" });
  console.log(route.route.url);
  if (route.accessHeaderName && route.accessToken) {
    console.log(`${route.accessHeaderName}: ${route.accessToken}`);
  }
} finally {
  if (sandbox) await harakiri.killSandbox(sandbox.id).catch(() => undefined);
}
