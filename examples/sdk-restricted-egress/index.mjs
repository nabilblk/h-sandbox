import { HarakiriClient } from "@h-sandbox/sdk";

const harakiri = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL,
  apiKey: process.env.HARAKIRI_API_KEY
});

let sandbox;
try {
  sandbox = (await harakiri.createSandbox({
    template: "python-3.12-data",
    name: "sdk-restricted-egress",
    wait: true,
    egress: { mode: "restricted", presets: ["python-package-install"] }
  })).sandbox;

  await harakiri.allowDomains(sandbox.id, ["api.github.com"]);
  const github = await harakiri.testOutboundAccess(sandbox.id, "https://api.github.com");
  const google = await harakiri.testOutboundAccess(sandbox.id, "https://www.google.com");

  console.log({ github: github.status, google: google.status });
} finally {
  if (sandbox) await harakiri.killSandbox(sandbox.id).catch(() => undefined);
}
