import { check, sha256 } from "./context.mjs";
import { run } from "./workload.mjs";

export const credentialHost = "postman-echo.com";
export const credentialTarget = `https://${credentialHost}/basic-auth`;
const basic = (username, password) => `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
export const placeholder = basic("acceptance", "unbound");

// Published example credentials for a public test endpoint, not a Postman account.
export const exampleCredential = () => basic("postman", "password");

export async function credentialFixture(ctx, client) {
  const value = exampleCredential();
  for (const [authorization, expected] of [[placeholder, 401], [value, 200]]) {
    const response = await fetch(credentialTarget, { headers: { authorization }, redirect: "error", signal: AbortSignal.timeout(15000) });
    check(response.status === expected, "Public HTTPS credential fixture is unavailable or changed");
    if (expected === 200) check((await response.json()).authenticated === true, "Public HTTPS fixture authentication contract changed");
  }
  const created = await client.credentialSecrets.create({
    name: "Recovery acceptance source", providerPresetId: "custom", value,
    customProfile: { host: credentialHost, authType: "apiKey", headerName: "Authorization", methods: ["GET"], paths: ["/basic-auth"], envName: "ACCEPTANCE_API_KEY", testPath: "/basic-auth" },
    fakeEnv: { ACCEPTANCE_API_KEY: placeholder }, usePolicy: "admins_only"
  });
  check(created.secret.hasEncryptedSecret, "Vault source does not report encrypted custody");
  check(!JSON.stringify(created).includes(value), "Credential API exposed source material");
  ctx.save("credential-source.json", { secretId: created.secret.id });
  return created.secret.id;
}

export async function probeCredential(client, sandboxId, expected) {
  // Do not echo request/response headers or weaken upstream TLS verification.
  const output = await run(client, sandboxId, `curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' -H "Authorization: $ACCEPTANCE_API_KEY" '${credentialTarget}'`, { ACCEPTANCE_API_KEY: placeholder });
  check(output.trim() === (expected ? "200" : "401"), expected ? "Credential proxy did not inject the recovered source" : "Unbound credential request was not rejected");
}

export async function assertCredentialBoundary(ctx, client, sandboxId) {
  const value = exampleCredential();
  const inspected = await client.credentials.inspect(sandboxId);
  check(!JSON.stringify(inspected).includes(value), "Sanitized Vault inspection exposed source material");
  const code = `import os,hashlib; print(any(hashlib.sha256(v.encode()).hexdigest()=="${sha256(value)}" for v in os.environ.values()))`;
  const result = await run(client, sandboxId, `python3 -c '${code}'`);
  check(result.trim() === "False", "The injected credential is present in sandbox environment values");
}
