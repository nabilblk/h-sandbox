import { randomBytes } from "node:crypto";
import { check, sha256 } from "./context.mjs";
import { applyOwned, platformNamespace } from "./operator.mjs";
import { run } from "./workload.mjs";

export const credentialHost = "acceptance-credential-check.harakiri-preview.svc.cluster.local";
export const credentialTarget = `http://${credentialHost}/check`;

// The fixture returns a boolean only. It never logs or reflects request headers.
export const credentialCheckScript = `import hmac, json, os
from http.server import BaseHTTPRequestHandler, HTTPServer
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_GET(self):
        valid = self.path == "/check" and hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + os.environ["EXPECTED_TOKEN"])
        payload = json.dumps({"verified": valid}).encode()
        self.send_response(200 if valid else 401)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
HTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
`;

export async function credentialFixture(ctx, client) {
  const value = randomBytes(32).toString("hex");
  applyOwned(ctx, { apiVersion: "v1", kind: "List", items: [
    { apiVersion: "v1", kind: "Secret", metadata: { name: "acceptance-credential-check", namespace: platformNamespace }, stringData: { EXPECTED_TOKEN: value } },
    { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "acceptance-credential-check", namespace: platformNamespace }, data: { "server.py": credentialCheckScript } },
    { apiVersion: "apps/v1", kind: "Deployment", metadata: { name: "acceptance-credential-check", namespace: platformNamespace }, spec: {
      replicas: 1, selector: { matchLabels: { app: "acceptance-credential-check" } },
      template: { metadata: { labels: { app: "acceptance-credential-check" } }, spec: { automountServiceAccountToken: false,
        containers: [{ name: "http", image: "python:3.12-alpine", command: ["python3", "/fixture/server.py"],
          envFrom: [{ secretRef: { name: "acceptance-credential-check" } }], ports: [{ containerPort: 8080 }],
          readinessProbe: { tcpSocket: { port: 8080 } }, resources: { requests: { cpu: "10m", memory: "32Mi" }, limits: { cpu: "250m", memory: "128Mi" } },
          volumeMounts: [{ name: "script", mountPath: "/fixture", readOnly: true }] }],
        volumes: [{ name: "script", configMap: { name: "acceptance-credential-check" } }]
      } }
    } },
    { apiVersion: "v1", kind: "Service", metadata: { name: "acceptance-credential-check", namespace: platformNamespace }, spec: { selector: { app: "acceptance-credential-check" }, ports: [{ port: 80, targetPort: 8080 }] } }
  ] }, "credential-fixture.json");
  ctx.k(["-n", platformNamespace, "rollout", "status", "deployment/acceptance-credential-check", "--timeout=180s"]);
  const created = await client.credentialSecrets.create({
    name: "Recovery acceptance source", providerPresetId: "custom", value,
    customProfile: { host: credentialHost, authType: "bearer", methods: ["GET"], paths: ["/check"], envName: "ACCEPTANCE_API_KEY", testPath: "/check" },
    fakeEnv: { ACCEPTANCE_API_KEY: "acceptance-placeholder-not-a-secret" }, usePolicy: "admins_only"
  });
  check(created.secret.hasEncryptedSecret, "Vault source does not report encrypted custody");
  check(!JSON.stringify(created).includes(value), "Credential API exposed plaintext");
  ctx.save("credential-source.json", { secretId: created.secret.id });
  return created.secret.id;
}

export async function probeCredential(client, sandboxId, expected) {
  // This sends a placeholder, never the real value, through the runtime proxy.
  const output = await run(client, sandboxId, `curl --silent --show-error --max-time 15 -H "Authorization: Bearer $ACCEPTANCE_API_KEY" '${credentialTarget}'`, { ACCEPTANCE_API_KEY: "acceptance-placeholder-not-a-secret" });
  const result = JSON.parse(output);
  check(result.verified === expected, expected ? "Credential proxy did not inject the recovered secret" : "Credential proxy still injects a credential that should be absent");
}

export async function assertCredentialBoundary(ctx, client, sandboxId) {
  const value = ctx.read("credential-fixture.json").items.find(item => item.kind === "Secret").stringData.EXPECTED_TOKEN;
  const inspected = await client.credentials.inspect(sandboxId);
  check(!JSON.stringify(inspected).includes(value), "Sanitized Vault inspection exposed plaintext");
  const code = `import os,hashlib; print(any(hashlib.sha256(v.encode()).hexdigest()=="${sha256(value)}" for v in os.environ.values()))`;
  const result = await run(client, sandboxId, `python3 -c '${code}'`);
  check(result.trim() === "False", "The real credential is present in sandbox environment values");
}
