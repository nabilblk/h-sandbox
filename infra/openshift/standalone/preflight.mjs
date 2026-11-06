#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { validateInput } from "./configuration.mjs";

export function inspectPrerequisites(input, { kubeconfig, context }, run = spawnSync) {
  validateInput(input);
  if (!isAbsolute(kubeconfig ?? "") || !context || context.startsWith("-")) throw new Error("An absolute kubeconfig path and explicit context are required");
  const checks = [];
  const check = (name, args, accept = (text) => text.trim().length > 0) => {
    const result = run("oc", ["--kubeconfig", kubeconfig, "--context", context, "--request-timeout=15s", "-n", input.namespace, ...args], {
      encoding: "utf8", timeout: 20000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"]
    });
    // Do not include kubeconfig, identity, Secret values, command output or stderr in shared receipts.
    checks.push({ name, passed: result.status === 0 && !result.error && accept(result.stdout ?? "") });
  };
  check("authenticated", ["whoami"]);
  check("namespace-uid-allocation", ["get", "namespace", input.namespace, "-o", "jsonpath={.metadata.annotations.openshift\\.io/sa\\.scc\\.uid-range}"]);
  check("route-api", ["api-resources", "--api-group=route.openshift.io", "-o", "name"], (text) => text.split(/\s+/).includes("routes.route.openshift.io"));
  for (const resource of ["deployments.apps", "services", "configmaps", "serviceaccounts", "routes.route.openshift.io", "networkpolicies.networking.k8s.io"]) {
    check(`create-${resource}`, ["auth", "can-i", "create", resource], (text) => text.trim() === "yes");
  }
  const keysOnly = "go-template={{range $key, $value := .data}}{{$key}}{{\"\\n\"}}{{end}}";
  for (const [name, required] of [
    [input.apiSecret, ["DATABASE_URL", "OPEN_SANDBOX_API_KEY", "CONTROL_PLANE_SECRET_KEY", "TEMPLATE_REGISTRY_CREDENTIAL_KEY"]],
    [input.runtimeSecret, ["api-key"]], [input.gatewaySecret, ["keys", "active-key"]],
    [input.imagePullSecret, [".dockerconfigjson"]]
  ]) {
    check(`secret-keys:${name}`, ["get", "secret", name, "-o", keysOnly], (text) => {
      const keys = new Set(text.split(/\s+/));
      return required.every((key) => keys.has(key));
    });
  }
  if (input.trustBundle) check("private-ca-configmap", ["get", "configmap", input.trustBundle, "-o", keysOnly], (text) => text.split(/\s+/).includes("ca-bundle.crt"));
  return {
    schemaVersion: 1, profile: "openshift-restricted", namespace: input.namespace,
    readyForPlatformReview: checks.every((item) => item.passed), qualification: "native-validation-pending", checks
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [inputPath, kubeconfig, context, ...extra] = process.argv.slice(2);
    if (!inputPath || extra.length) throw new Error("Usage: node preflight.mjs operator-input.json /absolute/kubeconfig CONTEXT (read-only)");
    const report = inspectPrerequisites(JSON.parse(readFileSync(inputPath, "utf8")), { kubeconfig, context });
    console.log(JSON.stringify(report, null, 2));
    if (!report.readyForPlatformReview) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof SyntaxError ? "Invalid JSON input; file content is not printed" : error instanceof Error ? error.message : "Preflight failed");
    process.exitCode = 1;
  }
}
