import { isIP } from "node:net";

const role = (value) => ({ "harakiri.io/role": value });
const podSecurityContext = { runAsNonRoot: true, seccompProfile: { type: "RuntimeDefault" } };
const containerSecurityContext = {
  runAsNonRoot: true, allowPrivilegeEscalation: false,
  capabilities: { drop: ["ALL"] }, readOnlyRootFilesystem: true
};
const namePattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const requiredFields = [
  "namespace", "webOrigin", "apiOrigin", "authOrigin", "realm", "registry", "project",
  "apiDigest", "webDigest", "serverImage", "controllerImage", "gatewayImage", "execdImage",
  "imagePullSecret", "apiSecret", "runtimeSecret", "gatewaySecret", "sandboxEgressCIDRs"
];

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function validateOrigin(value, field) {
  requireValue(typeof value === "string" && /^https:\/\/[a-z0-9.-]+$/.test(value), `${field} must be a bare HTTPS origin`);
  const { hostname } = new URL(value);
  requireValue(hostname.length <= 253 && hostname.split(".").every((part) => namePattern.test(part)), `${field} must contain valid DNS labels`);
  requireValue(!isIP(hostname) && hostname.includes(".") && !hostname.endsWith(".localhost") && hostname !== "localhost", `${field} needs public DNS, not loopback or an IP address`);
}

function runtimeImage(value, field) {
  // Upstream charts accept repository:tag, including OCI's tag@digest form.
  const match = typeof value === "string" && value.match(/^([a-z0-9.-]+(?::[0-9]+)?\/[a-z0-9/_.-]+):([a-zA-Z0-9_.-]+)@(sha256:[a-f0-9]{64})$/);
  requireValue(match, `${field} must be a fully qualified repository:version@sha256 digest`);
  requireValue(!/^0+$/.test(match[3].slice(7)), `${field} contains a placeholder digest`);
  return { repository: match[1], tag: `${match[2]}@${match[3]}` };
}

export function validateInput(input) {
  requireValue(input && typeof input === "object" && !Array.isArray(input), "Configuration must be an object");
  requireValue(Object.keys(input).every((key) => [...requiredFields, "trustBundle"].includes(key)), "Unknown configuration field; credentials and overrides do not belong in this file");
  for (const key of requiredFields) {
    requireValue(Object.hasOwn(input, key), `Missing ${key}`);
    if (key !== "sandboxEgressCIDRs") requireValue(typeof input[key] === "string", `${key} must be a string`);
  }
  for (const key of ["namespace", "realm", "apiSecret", "runtimeSecret", "gatewaySecret", "imagePullSecret"]) {
    requireValue(typeof input[key] === "string" && namePattern.test(input[key]), `${key} must be a DNS label (at most 63 characters)`);
  }
  requireValue(input.namespace !== "default" && !/^(kube-|openshift-)/.test(input.namespace), "Use a dedicated application namespace, not a default or platform namespace");
  if (input.trustBundle !== undefined) requireValue(typeof input.trustBundle === "string" && (input.trustBundle === "" || namePattern.test(input.trustBundle)), "trustBundle must be a ConfigMap name or empty");
  for (const key of ["webOrigin", "apiOrigin", "authOrigin"]) validateOrigin(input[key], key);
  requireValue(new Set([input.webOrigin, input.apiOrigin, input.authOrigin]).size === 3, "Web, API and identity need distinct origins");
  requireValue(/^[a-z0-9.-]+(?::[0-9]+)?$/.test(input.registry), "registry must be a hostname with optional port, without a scheme");
  requireValue(/^[a-z0-9][a-z0-9/_.-]*$/.test(input.project), "project must be a registry repository path");
  requireValue(input.project.split("/").every((part) => part && part !== "." && part !== ".."), "project cannot contain empty or relative path segments");
  for (const key of ["apiDigest", "webDigest"]) {
    requireValue(digestPattern.test(input[key]) && !/^sha256:0+$/.test(input[key]), `${key} must be a verified sha256 digest, not a placeholder`);
  }
  for (const key of ["serverImage", "controllerImage", "gatewayImage", "execdImage"]) runtimeImage(input[key], key);
  requireValue(Array.isArray(input.sandboxEgressCIDRs), "sandboxEgressCIDRs must be an array, empty for DNS-only egress");
  for (const cidr of input.sandboxEgressCIDRs) {
    const [address, prefix, extra] = typeof cidr === "string" ? cidr.split("/") : [];
    const family = isIP(address ?? "");
    requireValue(family && !extra && /^\d+$/.test(prefix ?? "") && Number(prefix) > 0 && Number(prefix) <= (family === 4 ? 32 : 128), "Each sandbox egress CIDR must have a valid, non-zero prefix; never allow all addresses");
  }
  return input;
}

function networkPolicies(namespace, cidrs) {
  const peer = (value) => ({ podSelector: { matchLabels: role(value) } });
  const trusted = [peer("control-plane"), peer("runtime-control")];
  const policy = (name, value, spec) => ({
    apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy", metadata: { name, namespace },
    spec: { podSelector: { matchLabels: role(value) }, ...spec }
  });
  return [
    policy("harakiri-sandbox-boundary", "sandbox", {
      policyTypes: ["Ingress", "Egress"], ingress: [{ from: trusted }],
      egress: [
        { to: [{ namespaceSelector: { matchLabels: { "kubernetes.io/metadata.name": "openshift-dns" } } }],
          ports: [53, 5353].flatMap((port) => [{ port, protocol: "UDP" }, { port, protocol: "TCP" }]) },
        ...cidrs.map((cidr) => ({ to: [{ ipBlock: { cidr } }], ports: [{ protocol: "TCP", port: 443 }] }))
      ]
    }),
    policy("harakiri-control-plane-ingress", "control-plane", {
      policyTypes: ["Ingress"], ingress: [{ from: [
        ...trusted, { namespaceSelector: { matchLabels: { "kubernetes.io/metadata.name": "openshift-ingress" } } }
      ] }]
    }),
    policy("harakiri-runtime-ingress", "runtime-control", { policyTypes: ["Ingress"], ingress: [{ from: trusted }] })
  ];
}

export function createConfiguration(raw) {
  const input = validateInput(raw);
  const { namespace, registry, project, realm, webOrigin, apiOrigin, authOrigin } = input;
  const issuer = `${authOrigin}/realms/${realm}`;
  const pulls = [{ name: input.imagePullSecret }];
  const gateway = `opensandbox-ingress-gateway.${namespace}.svc.cluster.local:80`;
  const resources = (cpu, memory) => ({ requests: { cpu, memory }, limits: { cpu: "1", memory: "1Gi" } });
  const runtimeTemplate = {
    spec: { replicas: 1, template: {
      metadata: { labels: role("sandbox") },
      spec: {
        restartPolicy: "Never", serviceAccountName: "harakiri-runtime", automountServiceAccountToken: false,
        securityContext: podSecurityContext, imagePullSecrets: pulls,
        containers: [{ name: "sandbox", securityContext: { ...containerSecurityContext, readOnlyRootFilesystem: false } }]
      }
    } }
  };
  const runtimeResources = [
    { apiVersion: "v1", kind: "ServiceAccount", metadata: { name: "harakiri-runtime", namespace }, automountServiceAccountToken: false, imagePullSecrets: pulls },
    { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "harakiri-runtime-template", namespace },
      data: { "batchsandbox-template.json": JSON.stringify(runtimeTemplate, null, 2) } }
  ];
  const harakiri = {
    fullnameOverride: "harakiri", imagePullSecrets: pulls,
    image: { registry, repository: project, api: { digest: input.apiDigest }, web: { digest: input.webDigest } },
    secret: { create: false, existingSecret: input.apiSecret }, registry: { enabled: false },
    serviceAccount: { automountServiceAccountToken: false }, rbac: { create: false, prepullClusterRole: false },
    podSecurityContext, securityContext: containerSecurityContext, temporaryStorage: { enabled: true },
    trustBundle: { configMapName: input.trustBundle ?? "" },
    openshift: { restricted: true, routes: { enabled: true } },
    config: {
      HARAKIRI_RUNTIME_PROVIDER: "opensandbox", AUTH_DEV_ALLOW: "0", SEED_ON_BOOT: "0", AUTO_MIGRATE: "1",
      RUNTIME_DISABLED_FEATURES: "egress,credential-vault,snapshots,pause-resume",
      PUBLIC_WEB_URL: webOrigin, PUBLIC_API_URL: apiOrigin, PUBLIC_KEYCLOAK_URL: authOrigin,
      PUBLIC_KEYCLOAK_REALM: realm, PUBLIC_KEYCLOAK_CLIENT_ID: "harakiri-web", PUBLIC_OPEN_SANDBOX_URL: "",
      KEYCLOAK_ISSUER: issuer, KEYCLOAK_ISSUER_ALLOWLIST: issuer, KEYCLOAK_AUDIENCE: "harakiri-api",
      KEYCLOAK_JWKS_URL: `${issuer}/protocol/openid-connect/certs`,
      KEYCLOAK_ADMIN_BASE_URL: authOrigin, KEYCLOAK_ADMIN_REALM: realm, KEYCLOAK_ADMIN_TOKEN_REALM: realm,
      KEYCLOAK_ADMIN_CLIENT_ID: "harakiri-admin", KEYCLOAK_INVITATION_REDIRECT_URI: `${webOrigin}/#dashboard/sandboxes`,
      OPEN_SANDBOX_BASE_URL: `http://opensandbox-server.${namespace}.svc.cluster.local:80`,
      OPEN_SANDBOX_GATEWAY_URL: `http://${gateway}`, OPEN_SANDBOX_ALLOW_FALLBACK: "0", OPEN_SANDBOX_SEND_OPEN_NETWORK_POLICY: "0",
      SANDBOX_ROUTE_DEFAULT_ACCESS_MODE: "token", SANDBOX_ROUTE_LOCAL_FALLBACK_URL: "", SANDBOX_ROUTE_BASE_DOMAIN: "",
      TEMPLATE_DOCKERFILE_BUILDER: "disabled", TEMPLATE_IMAGE_ALLOW_REGISTRIES: registry,
      TEMPLATE_REGISTRY_PUSH_HOST: "", TEMPLATE_REGISTRY_RUNTIME_HOST: registry, TEMPLATE_REGISTRY_REPOSITORY_PREFIX: `${project}/templates`,
      TEMPLATE_REGISTRY_CREDENTIAL_KEY: "", TEMPLATE_BUILDKIT_REGISTRY_INSECURE: "0",
      TEMPLATE_BUILDER_NAMESPACE: namespace, TEMPLATE_RUNTIME_PULL_PREFLIGHT_ENABLED: "0",
      TEMPLATE_RUNTIME_PULL_PREFLIGHT_NAMESPACE: namespace, TEMPLATE_IMAGE_PREPULL_ENABLED: "0",
      TEMPLATE_IMAGE_PREPULL_NAMESPACE: namespace, TEMPLATE_RETENTION_DELETE_BUILDER_JOBS: "0", PERSISTENT_WORKSPACES_ENABLED: "0"
    }
  };
  const runtime = {
    "opensandbox-node-agent": { enabled: false },
    "opensandbox-controller": {
      namespaceOverride: namespace, fullnameOverride: "harakiri-runtime-controller", imagePullSecrets: pulls,
      controller: {
        image: runtimeImage(input.controllerImage, "controllerImage"), podLabels: role("runtime-control"),
        podSecurityContext, containerSecurityContext, resources: resources("100m", "128Mi"),
        snapshot: { imageCommitterImage: "" }
      }
    },
    "opensandbox-server": {
      namespaceOverride: namespace, imagePullSecrets: pulls,
      server: {
        port: 8080, replicaCount: 1, image: runtimeImage(input.serverImage, "serverImage"),
        podLabels: role("runtime-control"), podSecurityContext, containerSecurityContext, resources: resources("100m", "256Mi"),
        env: [{ name: "HOME", value: "/tmp" }, { name: "OPENSANDBOX_SERVER_API_KEY", valueFrom: { secretKeyRef: { name: input.runtimeSecret, key: "api-key" } } }],
        volumes: [{ name: "temporary", emptyDir: { sizeLimit: "256Mi" } }, { name: "runtime-template", configMap: { name: "harakiri-runtime-template" } }],
        volumeMounts: [{ name: "temporary", mountPath: "/tmp" }, { name: "runtime-template", mountPath: "/etc/harakiri-runtime", readOnly: true }],
        gateway: {
          enabled: true, host: gateway, gatewayRouteMode: "header", dataplaneNamespace: namespace, replicaCount: 1,
          image: runtimeImage(input.gatewayImage, "gatewayImage"), secureAccess: { existingSecret: input.gatewaySecret },
          podLabels: role("runtime-control"), podSecurityContext, containerSecurityContext, resources: resources("50m", "128Mi")
        }
      },
      configToml: `[server]\nhost = "0.0.0.0"\nport = 8080\n\n[log]\nlevel = "INFO"\n\n[runtime]\ntype = "kubernetes"\nexecd_image = "${input.execdImage}"\n\n[kubernetes]\nnamespace = "${namespace}"\nworkload_provider = "batchsandbox"\ninformer_enabled = true\nbatchsandbox_template_file = "/etc/harakiri-runtime/batchsandbox-template.json"\n`
    }
  };
  return {
    "harakiri-values.json": harakiri,
    "runtime-values.json": runtime,
    "runtime-resources.json": { apiVersion: "v1", kind: "List", items: runtimeResources },
    "network-policies.json": { apiVersion: "v1", kind: "List", items: networkPolicies(namespace, input.sandboxEgressCIDRs) },
    "qualification.json": {
      schemaVersion: 1, profile: "openshift-restricted", status: "native-validation-pending",
      namespace, origins: { web: webOrigin, api: apiOrigin, auth: authOrigin },
      images: { api: `${registry}/${project}/harakiri-api@${input.apiDigest}`, web: `${registry}/${project}/harakiri-web@${input.webDigest}`,
        server: input.serverImage, controller: input.controllerImage, gateway: input.gatewayImage, execd: input.execdImage },
      runtimeChart: "0.2.2-harakiri.2", disabledFeatures: ["egress", "credential-vault", "snapshots", "pause-resume", "workspaces", "dockerfile-builds"],
      evidence: { openshiftVersion: null, architecture: null, scc: null, acceptance: null }
    }
  };
}
