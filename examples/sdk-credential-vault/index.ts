import {
  HarakiriClient,
  credentialFromPreset,
  credentialProviderPresetCatalog,
  credentialProviderPresetIds,
  type CredentialProviderPresetId
} from "@h-sandbox/sdk";

const apiKey = process.env.HARAKIRI_API_KEY;
if (!apiKey) throw new Error("Set HARAKIRI_API_KEY before running this example.");

const rawPreset = process.env.HARAKIRI_CREDENTIAL_PRESET ?? "openai";
if (!credentialProviderPresetIds.some((id) => id === rawPreset)) {
  throw new Error(`Unknown HARAKIRI_CREDENTIAL_PRESET: ${rawPreset}`);
}
const presetId = rawPreset as CredentialProviderPresetId;
const preset = credentialProviderPresetCatalog[presetId];
const value = process.env.HARAKIRI_CREDENTIAL_VALUE ?? process.env[preset.defaultEnvName];
if (!value) {
  throw new Error(`Set HARAKIRI_CREDENTIAL_VALUE or ${preset.defaultEnvName} before running this example.`);
}

const harakiri = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL ?? "https://sb-api.harakiri.io",
  apiKey
});

const sandbox = await harakiri.sandboxes.create({
  template: process.env.HARAKIRI_TEMPLATE ?? "python-3.12-data",
  name: `vault-${presetId}`,
  ttlSeconds: 300,
  credentials: [credentialFromPreset(presetId, value)]
});

try {
  const attachments = await sandbox.credentials.list();
  const attachment = attachments.attachments[0];
  if (!attachment) throw new Error("Credential attachment was not created.");

  const fakeEnvCheck = await sandbox.run({
    command: `python -c "import os; assert os.getenv('${preset.defaultEnvName}', '').startswith('fake-')"`
  });
  if (fakeEnvCheck.result.exitCode !== 0) throw new Error("Sandbox did not receive the preset fake environment value.");

  const test = await sandbox.credentials.testAccess(attachment.id, {
    target: process.env.HARAKIRI_CREDENTIAL_TEST_TARGET ?? preset.test.target,
    method: preset.test.method
  });
  console.log({
    sandboxId: sandbox.id,
    attachmentId: attachment.id,
    preset: presetId,
    status: test.status,
    httpStatus: test.httpStatus
  });
} finally {
  await sandbox.kill().catch(() => undefined);
}
