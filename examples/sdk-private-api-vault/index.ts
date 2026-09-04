import { HarakiriClient, type InlineEphemeralSandboxCredentialBody } from "@h-sandbox/sdk";

const apiKey = process.env.HARAKIRI_API_KEY;
const credentialValue = process.env.HARAKIRI_PRIVATE_API_KEY;
const host = process.env.HARAKIRI_PRIVATE_API_HOST;
if (!apiKey) throw new Error("Set HARAKIRI_API_KEY before running this example.");
if (!credentialValue) throw new Error("Set HARAKIRI_PRIVATE_API_KEY before running this example.");
if (!host) throw new Error("Set HARAKIRI_PRIVATE_API_HOST to an exact DNS host.");

const headerName = process.env.HARAKIRI_PRIVATE_API_HEADER ?? "X-API-Key";
const path = process.env.HARAKIRI_PRIVATE_API_PATH ?? "/health";
const credential: InlineEphemeralSandboxCredentialBody = {
  sourceType: "inline_ephemeral",
  displayName: "Private API",
  credentialName: "private-api",
  value: credentialValue,
  fakeEnv: { PRIVATE_API_KEY: "fake-private-api-key" },
  binding: {
    name: "private-api",
    match: { schemes: ["https"], hosts: [host], methods: ["GET"], paths: [path] },
    auth: { type: "apiKey", name: headerName }
  }
};

const harakiri = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL ?? "https://sb-api.harakiri.io",
  apiKey
});
const sandbox = await harakiri.sandboxes.create({
  template: process.env.HARAKIRI_TEMPLATE ?? "python-3.12-data",
  name: "private-api-vault",
  ttlSeconds: 300,
  credentials: [credential]
});

try {
  const attachment = (await sandbox.credentials.list()).attachments[0];
  if (!attachment) throw new Error("Credential attachment was not created.");
  const result = await sandbox.credentials.testAccess(attachment.id, { target: `https://${host}${path}` });
  console.log({ sandboxId: sandbox.id, attachmentId: attachment.id, status: result.status, httpStatus: result.httpStatus });
} finally {
  await sandbox.kill().catch(() => undefined);
}
