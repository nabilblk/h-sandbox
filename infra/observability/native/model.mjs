import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { check, until } from "../../acceptance/context.mjs";
import { applyOwned, platformNamespace } from "../../acceptance/operator.mjs";

export const pinnedModel = Object.freeze({
  image: "ollama/ollama:0.34.3@sha256:7ab595e4ead391f6818c7215297781282babe0701f6d9a9f8862ac591360a58b",
  name: "qwen3:4b-instruct",
  digest: "0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0"
});
const name = "acceptance-local-model";
const localUrl = "http://127.0.0.1:28514";

async function prepareModel(ctx) {
  applyOwned(ctx, { apiVersion: "v1", kind: "Service", metadata: { name, namespace: platformNamespace },
    spec: { selector: { app: name }, ports: [{ port: 11434, targetPort: 11434 }] }
  }, "telemetry-model-service.json");
  ctx.k(["-n", platformNamespace, "wait", "--for=condition=Ready", `pod/${name}`, "--timeout=300s"]);
  await ctx.forward(name, 28514, 11434);
  const response = await fetch(`${localUrl}/api/pull`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: pinnedModel.name, stream: true }), signal: AbortSignal.timeout(600_000) });
  check(response.ok && response.body, "Local model pull failed");
  let complete = false;
  for await (const line of createInterface({ input: Readable.fromWeb(response.body) })) {
    const progress = JSON.parse(line);
    check(!progress.error, "Local model pull rejected");
    complete = progress.status === "success";
  }
  check(complete, "Local model download did not complete");
  await until("Pinned model digest", async () => {
    const tags = await (await fetch(`${localUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })).json();
    return tags.models?.some(model => model.name === pinnedModel.name && model.digest === pinnedModel.digest);
  }, 10_000);
}

/** Guard before any action. Never starts inference on the maintainer's machine. */
export async function withModel(ctx, gate, action) {
  ctx.guard();
  applyOwned(ctx, { apiVersion: "v1", kind: "Pod", metadata: { name, namespace: platformNamespace, labels: { app: name } },
    spec: { restartPolicy: "Never", automountServiceAccountToken: false, terminationGracePeriodSeconds: 5,
      securityContext: { runAsNonRoot: true, runAsUser: 10001, runAsGroup: 10001, fsGroup: 10001, seccompProfile: { type: "RuntimeDefault" } },
      containers: [{ name: "model", image: pinnedModel.image,
        securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ["ALL"] } },
        env: Object.entries({ HOME: "/tmp", OLLAMA_MODELS: "/tmp/models", OLLAMA_HOST: "0.0.0.0:11434",
          OLLAMA_NO_CLOUD: "1", OLLAMA_NUM_PARALLEL: "1", GOMAXPROCS: "2" }).map(([name, value]) => ({ name, value })),
        ports: [{ containerPort: 11434 }], resources: { requests: { cpu: "250m", memory: "2Gi" }, limits: { cpu: "2", memory: "6Gi" } },
        readinessProbe: { httpGet: { path: "/api/version", port: 11434 }, periodSeconds: 2 },
        volumeMounts: [{ name: "temporary", mountPath: "/tmp" }] }],
      volumes: [{ name: "temporary", emptyDir: { sizeLimit: "5Gi" } }] }
  }, "telemetry-model-pod.json");
  try {
    await gate("local-model-start", () => prepareModel(ctx));
    return await action({ name: pinnedModel.name, localUrl, remoteUrl: `http://${name}.${platformNamespace}.svc.cluster.local:11434` });
  } finally {
    ctx.guard();
    ctx.k(["-n", platformNamespace, "delete", "pod", name, "--wait=true", "--timeout=90s"]);
    ctx.k(["-n", platformNamespace, "delete", "service", name, "--ignore-not-found=true"]);
  }
}
