import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { relative } from "node:path";
import test from "node:test";

const srcDir = new URL(".", import.meta.url);

const productionSources = async (dir: URL): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    if (entry.isDirectory()) return productionSources(child);
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) return [];
    return [child.pathname];
  }));
  return files.flat();
};

const forbiddenRuntimePatterns = [
  "pods/exec",
  "kubectl exec",
  "readNamespacedPodExec",
  "runInSandboxPod",
  "kubernetes.exec",
  "readNamespacedPodLog"
];

const allowedAdminKubernetesUsage: Record<string, { patterns: string[]; category: string; reason: string }> = {
  "builders/buildkit-kubernetes-builder.ts": {
    patterns: ["readNamespacedPodLog"],
    category: "template-builder",
    reason: "template build logs are platform/admin build-job logs, not sandbox runtime logs"
  },
  "builders/kaniko-builder.ts": {
    patterns: ["readNamespacedPodLog"],
    category: "legacy-template-builder",
    reason: "legacy template build logs are platform/admin build-job logs, not sandbox runtime logs"
  }
};

const allowedAdminPattern = (file: string, pattern: string) =>
  allowedAdminKubernetesUsage[file]?.patterns.includes(pattern) ?? false;

test("API production runtime source does not use Kubernetes pod exec or pod-log attach paths", async () => {
  const files = await productionSources(srcDir);
  const violations: string[] = [];

  for (const file of files) {
    const rel = relative(srcDir.pathname, file);
    const body = await readFile(file, "utf8");
    for (const pattern of forbiddenRuntimePatterns) {
      if (!body.includes(pattern)) continue;
      if (allowedAdminPattern(rel, pattern)) continue;
      violations.push(`${rel}: ${pattern}`);
    }
  }

  assert.deepEqual(violations, [], `normal sandbox runtime code must use OpenSandbox APIs, not direct Kubernetes pod exec/log paths:\n${violations.join("\n")}`);
});
