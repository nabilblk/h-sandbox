#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALL_DIR="${ROOT}/OCP-install/harakiri-security"
CHART_DIR="${ROOT}/OCP-install/charts"

log() { printf "\n\033[1;36m==> %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33mWARN: %s\033[0m\n" "$*" >&2; }
die() { printf "\033[1;31mERROR: %s\033[0m\n" "$*" >&2; exit 1; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "$1 not found on PATH"
}

normalize_host() {
  local raw="${1#http://}"
  raw="${raw#https://}"
  raw="${raw%%/*}"
  printf "%s" "$raw"
}

render() {
  local source="$1"
  local target="$2"
  envsubst < "$source" > "$target"
}

apply_rendered() {
  local source="$1"
  local target="${TMP_DIR}/$(basename "$source")"
  render "$source" "$target"
  oc apply -f "$target"
}

download_oci_chart() {
  local label="$1"
  local ref="$2"
  local version="$3"
  local fallback_path="$4"
  local dest_dir="${CHART_DIR}/${label}"

  rm -rf "$dest_dir"
  mkdir -p "$dest_dir"

  if helm pull "$ref" --version "$version" --destination "$dest_dir"; then
    find "$dest_dir" -maxdepth 1 -name '*.tgz' -print -quit
    return 0
  fi

  if [ -n "$fallback_path" ] && [ -d "$fallback_path" ]; then
    warn "Could not pull ${ref}; packaging local fallback ${fallback_path}"
    helm package "$fallback_path" --version "$version" --app-version "$version" --destination "$dest_dir" >/dev/null
    find "$dest_dir" -maxdepth 1 -name '*.tgz' -print -quit
    return 0
  fi

  die "Could not download chart ${ref}"
}

require_env() {
  local name="$1"
  local purpose="$2"
  if [ -z "${!name:-}" ]; then
    die "set ${name} (${purpose})"
  fi
}

helm_login() {
  local registry="$1"
  printf "%s" "$CLIENT_REGISTRY_PASSWORD" | helm registry login "$registry" \
    --username "$CLIENT_REGISTRY_USERNAME" \
    --password-stdin >/dev/null
}

copy_image() {
  local image="$1"
  if [ "$SOURCE_REGISTRY" = "$CLIENT_REGISTRY" ]; then
    echo "same registry: ${CLIENT_REGISTRY}/${image}"
    return 0
  fi

  require_command skopeo
  skopeo copy --all \
    "docker://${SOURCE_REGISTRY}/${image}" \
    "docker://${CLIENT_REGISTRY}/${image}"
}

urlencode() {
  node -e 'process.stdout.write(encodeURIComponent(process.argv[1] ?? ""))' "$1"
}

mask() {
  local value="${1:-}"
  if [ "${#value}" -le 4 ]; then
    printf "****"
  else
    printf "%s****%s" "${value:0:2}" "${value: -2}"
  fi
}

wait_url() {
  local url="$1"
  local label="$2"

  for _ in $(seq 1 30); do
    if curl -fsSk "$url" >/dev/null; then
      echo "${label}: ok"
      return 0
    fi
    sleep 2
  done

  warn "${label} did not become healthy: ${url}"
  curl -k -i "$url" 2>/dev/null | sed -n '1,40p' >&2 || true
  return 1
}

: "${NAMESPACE:=harakiri-security}"
: "${SOURCE_REGISTRY_URL:=https://core.campus.clusterdiali.me/}"
: "${CLIENT_REGISTRY_URL:=https://core.campus.clusterdiali.me/}"
: "${CLIENT_REGISTRY_USERNAME:=}"
: "${CLIENT_REGISTRY_PASSWORD:=}"
: "${HARBOR_PROJECT:=harakiri}"
: "${OPEN_SANDBOX_CHART_VERSION:=0.2.2}"
: "${SANDBOX_CHART_VERSION:=0.1.2}"
: "${BACKGROUND_AGENT_CHART_VERSION:=0.1.0}"
: "${SANDBOX_IMAGE_TAG:=0.1.0}"
: "${BACKGROUND_AGENT_IMAGE_TAG:=${BACKGROUND_AGENT_CHART_VERSION}}"
: "${BACKGROUND_AGENT_IMAGE_REPOSITORY:=harakiri/background-agents/harakiri-web}"
: "${BACKGROUND_AGENT_WORKSPACE:=}"
: "${BACKGROUND_AGENT_HARAKIRI_TEMPLATE:=python-3.12-data}"
: "${OPENSHIFT_API:=}"
: "${OPENSHIFT_USERNAME:=}"
: "${OPENSHIFT_PASSWORD:=}"
: "${OPENSHIFT_LOGIN:=false}"
: "${POSTGRES_PASSWORD:=}"
: "${POSTGRES_ADMIN_PASSWORD:=${POSTGRES_PASSWORD}}"
: "${POSTGRES_STORAGE:=20Gi}"
: "${POSTGRES_IMAGE:=registry.redhat.io/rhel9/postgresql-16:latest}"
: "${KEYCLOAK_ADMIN_PASSWORD:=}"
: "${KEYCLOAK_IMAGE_TAG:=26.4}"
: "${OPEN_SANDBOX_API_KEY:=}"
: "${HARAKIRI_API_KEY:=}"
: "${HARAKIRI_SEED_ON_BOOT:=0}"
: "${BOOTSTRAP_USER_EMAIL:=}"
: "${BOOTSTRAP_USER_PASSWORD:=}"
: "${OPEN_SANDBOX_CHART_REF:=oci://$(normalize_host "$CLIENT_REGISTRY_URL")/${HARBOR_PROJECT}/charts/opensandbox}"
: "${SANDBOX_CHART_REF:=oci://$(normalize_host "$CLIENT_REGISTRY_URL")/${HARBOR_PROJECT}/charts/harakiri}"
: "${BACKGROUND_AGENT_CHART_REF:=oci://$(normalize_host "$CLIENT_REGISTRY_URL")/${HARBOR_PROJECT}/background-agents/charts/harakiri}"
: "${BACKGROUND_AGENT_CHART_LOCAL_PATH:=${BACKGROUND_AGENT_WORKSPACE}/deploy/helm/harakiri}"
: "${SMOKE_TEST:=true}"
: "${SANDBOX_SMOKE_TEST:=false}"

SOURCE_REGISTRY="$(normalize_host "$SOURCE_REGISTRY_URL")"
CLIENT_REGISTRY="$(normalize_host "$CLIENT_REGISTRY_URL")"
export SOURCE_REGISTRY CLIENT_REGISTRY
export HARBOR="$CLIENT_REGISTRY"
export HARBOR_PROJECT NAMESPACE
export POSTGRES_PASSWORD POSTGRES_ADMIN_PASSWORD POSTGRES_STORAGE POSTGRES_IMAGE
export KEYCLOAK_ADMIN_PASSWORD
export KEYCLOAK_IMAGE="${CLIENT_REGISTRY}/${HARBOR_PROJECT}/mirror/keycloak:${KEYCLOAK_IMAGE_TAG}"
export OPEN_SANDBOX_API_KEY
export HARAKIRI_SEED_ON_BOOT BOOTSTRAP_USER_EMAIL BOOTSTRAP_USER_PASSWORD
export TEMPLATE_REGISTRY_HOST="${TEMPLATE_REGISTRY_HOST:-${CLIENT_REGISTRY}/${HARBOR_PROJECT}/templates}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

log "Preflight"
if command -v crc >/dev/null 2>&1; then
  eval "$(crc oc-env 2>/dev/null || true)"
fi
require_command oc
require_command helm
require_command envsubst
require_command node
require_command curl
require_env CLIENT_REGISTRY_USERNAME "client registry username or robot account"
require_env CLIENT_REGISTRY_PASSWORD "client registry password or robot token"
require_env POSTGRES_PASSWORD "shared PostgreSQL service password"
require_env KEYCLOAK_ADMIN_PASSWORD "Keycloak bootstrap admin password"
require_env OPEN_SANDBOX_API_KEY "OpenSandbox API key shared with Harakiri"
require_env BACKGROUND_AGENT_WORKSPACE "path to a checked-out BackgroundAgent workspace for chart fallback and secret import"
if [ "$SANDBOX_SMOKE_TEST" = "true" ]; then
  require_env HARAKIRI_API_KEY "workspace API key used by the post-install sandbox smoke test"
fi

if [ "$OPENSHIFT_LOGIN" = "true" ]; then
  require_env OPENSHIFT_API "OpenShift API URL"
  require_env OPENSHIFT_USERNAME "OpenShift username"
  require_env OPENSHIFT_PASSWORD "OpenShift password"
  oc login "$OPENSHIFT_API" \
    -u "$OPENSHIFT_USERNAME" \
    -p "$OPENSHIFT_PASSWORD" \
    --insecure-skip-tls-verify=true >/dev/null
fi

export APPS="${APPS:-$(oc get ingresses.config.openshift.io/cluster -o jsonpath='{.spec.domain}' 2>/dev/null || true)}"
if [ -z "$APPS" ]; then
  APPS="apps-crc.testing"
fi
export WEB_HOST="${WEB_HOST:-hs.${APPS}}"
export API_HOST="${API_HOST:-hs-api.${APPS}}"
export AUTH_HOST="${AUTH_HOST:-hs-auth.${APPS}}"
export BACKGROUND_AGENT_HOST="${BACKGROUND_AGENT_HOST:-hs-background-agent.${APPS}}"
export SBX_DOMAIN="${SBX_DOMAIN:-hs-sbx.${APPS}}"

POSTGRES_URL_PASSWORD="$(urlencode "$POSTGRES_PASSWORD")"
export HARAKIRI_DATABASE_URL="postgres://harakiri_sandbox:${POSTGRES_URL_PASSWORD}@platform-postgres.${NAMESPACE}.svc:5432/platform"
export BACKGROUND_AGENT_DATABASE_URL="postgres://background_agent:${POSTGRES_URL_PASSWORD}@platform-postgres.${NAMESPACE}.svc:5432/platform"

export BACKGROUND_AGENT_IMAGE="${CLIENT_REGISTRY}/${BACKGROUND_AGENT_IMAGE_REPOSITORY}"

echo "Namespace:          ${NAMESPACE}"
echo "Apps domain:        ${APPS}"
echo "Client registry:    ${CLIENT_REGISTRY}"
echo "Registry user:      ${CLIENT_REGISTRY_USERNAME}"
echo "Registry password:  $(mask "$CLIENT_REGISTRY_PASSWORD")"
echo "Harakiri web:       https://${WEB_HOST}"
echo "Harakiri API:       https://${API_HOST}"
echo "Keycloak:           https://${AUTH_HOST}"
echo "BackgroundAgent:    https://${BACKGROUND_AGENT_HOST}"
echo "Sandbox wildcard:   *.${SBX_DOMAIN}"

log "Namespace and registry pull secret"
oc create namespace "$NAMESPACE" --dry-run=client -o yaml | oc apply -f -
oc create secret docker-registry registry-pull -n "$NAMESPACE" \
  --docker-server="$CLIENT_REGISTRY" \
  --docker-username="$CLIENT_REGISTRY_USERNAME" \
  --docker-password="$CLIENT_REGISTRY_PASSWORD" \
  --dry-run=client -o yaml | oc apply -f - >/dev/null
oc -n "$NAMESPACE" secrets link default registry-pull --for=pull >/dev/null || true

log "Registry login and image availability"
helm_login "$CLIENT_REGISTRY"
if [ "$SOURCE_REGISTRY" != "$CLIENT_REGISTRY" ]; then
  copy_image "${HARBOR_PROJECT}/harakiri-api:${SANDBOX_IMAGE_TAG}"
  copy_image "${HARBOR_PROJECT}/harakiri-web:${SANDBOX_IMAGE_TAG}"
  copy_image "${HARBOR_PROJECT}/mirror/keycloak:${KEYCLOAK_IMAGE_TAG}"
  copy_image "${HARBOR_PROJECT}/mirror/opensandbox/controller:v0.2.0"
  copy_image "${HARBOR_PROJECT}/mirror/opensandbox/server:v0.2.3"
  copy_image "${HARBOR_PROJECT}/mirror/opensandbox/execd:v1.1.0"
  copy_image "${HARBOR_PROJECT}/mirror/opensandbox/egress:v1.1.7"
  copy_image "${HARBOR_PROJECT}/mirror/opensandbox/ingress:v1.0.10"
  copy_image "${HARBOR_PROJECT}/mirror/opensandbox/image-committer:v0.1.1"
  copy_image "${BACKGROUND_AGENT_IMAGE_REPOSITORY}:${BACKGROUND_AGENT_IMAGE_TAG}"
fi

log "Download Helm charts locally"
OPEN_SANDBOX_CHART="$(download_oci_chart opensandbox "$OPEN_SANDBOX_CHART_REF" "$OPEN_SANDBOX_CHART_VERSION" "")"
SANDBOX_CHART="$(download_oci_chart sandbox "$SANDBOX_CHART_REF" "$SANDBOX_CHART_VERSION" "${ROOT}/infra/charts/harakiri")"
BACKGROUND_AGENT_CHART="$(download_oci_chart background-agent "$BACKGROUND_AGENT_CHART_REF" "$BACKGROUND_AGENT_CHART_VERSION" "$BACKGROUND_AGENT_CHART_LOCAL_PATH")"
echo "OpenSandbox chart:     ${OPEN_SANDBOX_CHART}"
echo "Harakiri chart:        ${SANDBOX_CHART}"
echo "BackgroundAgent chart: ${BACKGROUND_AGENT_CHART}"

log "Install PostgreSQL"
apply_rendered "${INSTALL_DIR}/00-postgres.yaml"
oc -n "$NAMESPACE" rollout status deploy/platform-postgres --timeout=5m

log "Create PostgreSQL roles and schemas"
node - "$POSTGRES_PASSWORD" > "${TMP_DIR}/init-db.sql" <<'NODE'
const password = process.argv[2] ?? "";
const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
const roles = [
  ["harakiri_sandbox", "harakiri_sandbox"],
  ["background_agent", "public"],
  ["keycloak", "keycloak"]
];
for (const [role] of roles) {
  console.log(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} LOGIN PASSWORD ${quote(password)}; ELSE ALTER ROLE ${role} WITH LOGIN PASSWORD ${quote(password)}; END IF; END $$;`);
}
for (const [role, schema] of roles) {
  if (schema !== "public") {
    console.log(`CREATE SCHEMA IF NOT EXISTS ${schema} AUTHORIZATION ${role};`);
  }
  console.log(`GRANT CONNECT ON DATABASE platform TO ${role};`);
  console.log(`GRANT CREATE ON DATABASE platform TO ${role};`);
  console.log(`GRANT USAGE, CREATE ON SCHEMA ${schema} TO ${role};`);
  console.log(`ALTER ROLE ${role} IN DATABASE platform SET search_path TO ${schema}, public;`);
}
NODE
oc -n "$NAMESPACE" exec -i deploy/platform-postgres -- sh -lc \
  "PGPASSWORD='${POSTGRES_ADMIN_PASSWORD}' psql -U postgres -d platform -v ON_ERROR_STOP=1" < "${TMP_DIR}/init-db.sql"

log "Generate Keycloak realms and BackgroundAgent secret"
node - "$BACKGROUND_AGENT_WORKSPACE" "$TMP_DIR" "$WEB_HOST" "$AUTH_HOST" "$BACKGROUND_AGENT_HOST" "$BACKGROUND_AGENT_DATABASE_URL" "$HARAKIRI_API_KEY" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [workspace, outDir, webHost, authHost, backgroundHost, postgresUrl, harakiriApiKey] = process.argv.slice(2);
const files = [
  path.join(workspace, "apps/web/.env"),
  path.join(workspace, "apps/web/.env.local")
];

const env = {};
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [rawKey, ...rawValueParts] = trimmed.split("=");
    const key = rawKey.trim();
    let value = rawValueParts.join("=").trim();
    value = value.replace(/^export\s+/, "");
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) value = value.slice(1, -1);
    env[key] = value.replace(/\\n/g, "\n");
  }
}

const get = (key, fallback = "") => env[key] || fallback;
const backgroundClientSecret = get("KEYCLOAK_CLIENT_SECRET", "background-agent-dev-secret");
const allowedDomains = get("HARAKIRI_ALLOWED_EMAIL_DOMAINS", "");
const bootstrapEmail = process.env.BOOTSTRAP_USER_EMAIL || "";
const bootstrapPassword = process.env.BOOTSTRAP_USER_PASSWORD || "";
const adminEmails = get("HARAKIRI_ADMIN_EMAILS", get("HARAKIRI_ALLOWED_EMAILS", bootstrapEmail));
const allowedEmails = get("HARAKIRI_ALLOWED_EMAILS", bootstrapEmail);
const bootstrapUsers = bootstrapEmail && bootstrapPassword
  ? [{
      username: bootstrapEmail,
      email: bootstrapEmail,
      enabled: true,
      emailVerified: true,
      credentials: [{ type: "password", value: bootstrapPassword, temporary: true }]
    }]
  : [];

const secretKeys = [
  "POSTGRES_URL",
  "JWE_SECRET",
  "ENCRYPTION_KEY",
  "KEYCLOAK_CLIENT_SECRET",
  "NEXT_PUBLIC_GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
  "E2B_API_KEY",
  "HARAKIRI_API_KEY",
  "OPENROUTER_API_KEY",
  "AI_GATEWAY_API_KEY",
  "REDIS_URL",
  "KV_URL"
];
const secretValues = Object.fromEntries(secretKeys.map((key) => [key, get(key)]));
secretValues.POSTGRES_URL = postgresUrl;
secretValues.KEYCLOAK_CLIENT_SECRET = backgroundClientSecret;
secretValues.HARAKIRI_API_KEY = harakiriApiKey;

fs.writeFileSync(
  path.join(outDir, "background-agent-secrets.env"),
  Object.entries(secretValues).map(([key, value]) => `${key}=${String(value).replace(/\n/g, "\\n")}`).join("\n") + "\n",
  { mode: 0o600 }
);

const harakiriRealm = {
  realm: "harakiri",
  enabled: true,
  loginWithEmailAllowed: true,
  registrationAllowed: false,
  verifyEmail: false,
  clients: [{
    clientId: "harakiri-web",
    name: "Harakiri Sandbox Web",
    enabled: true,
    publicClient: true,
    standardFlowEnabled: true,
    directAccessGrantsEnabled: false,
    redirectUris: [`https://${webHost}/*`],
    webOrigins: [`https://${webHost}`],
    attributes: { "pkce.code.challenge.method": "S256" }
  }],
  users: bootstrapUsers
};

const backgroundRealm = {
  realm: "background-agent",
  enabled: true,
  loginWithEmailAllowed: true,
  registrationAllowed: false,
  verifyEmail: false,
  clients: [{
    clientId: "open-agents-web",
    name: "BackgroundAgent Web",
    enabled: true,
    publicClient: false,
    secret: backgroundClientSecret,
    standardFlowEnabled: true,
    directAccessGrantsEnabled: false,
    redirectUris: [`https://${backgroundHost}/api/auth/keycloak/callback`, `https://${backgroundHost}/*`],
    webOrigins: [`https://${backgroundHost}`],
    attributes: { "pkce.code.challenge.method": "S256" }
  }],
  users: bootstrapUsers
};

fs.writeFileSync(path.join(outDir, "harakiri-realm.json"), JSON.stringify(harakiriRealm, null, 2));
fs.writeFileSync(path.join(outDir, "background-agent-realm.json"), JSON.stringify(backgroundRealm, null, 2));
fs.writeFileSync(path.join(outDir, "background-agent-vars.env"), [
  `BACKGROUND_AGENT_ALLOWED_EMAILS=${allowedEmails}`,
  `BACKGROUND_AGENT_ALLOWED_EMAIL_DOMAINS=${allowedDomains}`,
  `BACKGROUND_AGENT_ADMIN_EMAILS=${adminEmails}`,
  `BACKGROUND_AGENT_GITHUB_APP_SLUG=${get("NEXT_PUBLIC_GITHUB_APP_SLUG")}`,
  `BACKGROUND_AGENT_GITHUB_BOT_LOGINS=${get("HARAKIRI_GITHUB_BOT_LOGINS")}`,
  `BACKGROUND_AGENT_OPENROUTER_BASE_URL=${get("OPENROUTER_BASE_URL")}`,
  `BACKGROUND_AGENT_OPENROUTER_APP_NAME=${get("OPENROUTER_APP_NAME")}`,
  `BACKGROUND_AGENT_OPENROUTER_APP_URL=${get("OPENROUTER_APP_URL")}`,
  `BACKGROUND_AGENT_UTILITY_MODEL=${get("UTILITY_MODEL")}`
].join("\n") + "\n");
NODE
while IFS='=' read -r key value; do
  [ -n "$key" ] || continue
  export "${key}=${value}"
done < "${TMP_DIR}/background-agent-vars.env"

oc create configmap keycloak-realms -n "$NAMESPACE" \
  --from-file=harakiri-realm.json="${TMP_DIR}/harakiri-realm.json" \
  --from-file=background-agent-realm.json="${TMP_DIR}/background-agent-realm.json" \
  --dry-run=client -o yaml | oc apply -f - >/dev/null

log "Install Keycloak"
apply_rendered "${INSTALL_DIR}/01-keycloak.yaml"
oc -n "$NAMESPACE" rollout status deploy/keycloak --timeout=8m

log "Create application secrets"
oc create secret generic harakiri-api -n "$NAMESPACE" \
  --from-literal=DATABASE_URL="$HARAKIRI_DATABASE_URL" \
  --from-literal=OPEN_SANDBOX_API_KEY="$OPEN_SANDBOX_API_KEY" \
  --from-literal=KEYCLOAK_ADMIN_USERNAME=admin \
  --from-literal=KEYCLOAK_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" \
  --dry-run=client -o yaml | oc apply -f - >/dev/null
oc create secret generic background-agent-secrets -n "$NAMESPACE" \
  --from-env-file="${TMP_DIR}/background-agent-secrets.env" \
  --dry-run=client -o yaml | oc apply -f - >/dev/null

log "Install OpenSandbox"
render "${INSTALL_DIR}/02-opensandbox-values.yaml" "${TMP_DIR}/opensandbox-values.yaml"
helm upgrade --install opensandbox "$OPEN_SANDBOX_CHART" \
  -n "$NAMESPACE" \
  -f "${TMP_DIR}/opensandbox-values.yaml" \
  --timeout=8m
oc -n "$NAMESPACE" secrets link opensandbox-server registry-pull --for=pull >/dev/null 2>&1 || true
oc -n "$NAMESPACE" secrets link opensandbox-ingress-gateway registry-pull --for=pull >/dev/null 2>&1 || true
oc -n "$NAMESPACE" secrets link opensandbox-controller-manager registry-pull --for=pull >/dev/null 2>&1 || true
oc -n "$NAMESPACE" rollout restart deploy/opensandbox-server >/dev/null
oc -n "$NAMESPACE" rollout status deploy/opensandbox-controller-manager --timeout=5m
oc -n "$NAMESPACE" rollout status deploy/opensandbox-server --timeout=8m || {
  warn "Retrying OpenSandbox server rollout after service-account pull-secret link"
  oc -n "$NAMESPACE" rollout restart deploy/opensandbox-server
  oc -n "$NAMESPACE" rollout status deploy/opensandbox-server --timeout=8m
}
oc -n "$NAMESPACE" rollout status deploy/opensandbox-ingress-gateway --timeout=8m || {
  warn "Retrying OpenSandbox gateway rollout after service-account pull-secret link"
  oc -n "$NAMESPACE" rollout restart deploy/opensandbox-ingress-gateway
  oc -n "$NAMESPACE" rollout status deploy/opensandbox-ingress-gateway --timeout=8m
}

log "Install Harakiri Sandbox"
render "${INSTALL_DIR}/03-harakiri-values.yaml" "${TMP_DIR}/harakiri-values.yaml"
helm upgrade --install harakiri "$SANDBOX_CHART" \
  -n "$NAMESPACE" \
  -f "${TMP_DIR}/harakiri-values.yaml" \
  --timeout=8m
oc -n "$NAMESPACE" rollout status deploy/harakiri-api --timeout=8m
oc -n "$NAMESPACE" rollout status deploy/harakiri-web --timeout=8m
oc -n "$NAMESPACE" rollout status deploy/harakiri-scheduler --timeout=5m

log "Install BackgroundAgent"
render "${INSTALL_DIR}/04-background-agent-values.yaml" "${TMP_DIR}/background-agent-values.yaml"
oc -n "$NAMESPACE" delete job background-agent-harakiri-migrate --ignore-not-found >/dev/null
helm upgrade --install background-agent "$BACKGROUND_AGENT_CHART" \
  -n "$NAMESPACE" \
  -f "${TMP_DIR}/background-agent-values.yaml" \
  --timeout=8m
oc -n "$NAMESPACE" rollout status deploy/background-agent-harakiri --timeout=8m

log "Install public routes"
apply_rendered "${INSTALL_DIR}/05-routes.yaml"

if [ "$SMOKE_TEST" = "true" ]; then
  log "Smoke test"
  wait_url "https://${API_HOST}/health" "Harakiri API"
  wait_url "https://${WEB_HOST}/config.js" "Harakiri web"
  wait_url "https://${AUTH_HOST}/realms/harakiri/.well-known/openid-configuration" "Keycloak harakiri realm"
  wait_url "https://${BACKGROUND_AGENT_HOST}/api/health" "BackgroundAgent" || warn "BackgroundAgent /api/health is not healthy yet; inspect readiness details in the app."

  if [ "$SANDBOX_SMOKE_TEST" != "true" ]; then
    warn "Skipping sandbox create/run smoke. Set SANDBOX_SMOKE_TEST=true and HARAKIRI_API_KEY to enable it."
  else
    CREATE_BODY="$(mktemp)"
    CREATE_RESPONSE="$(mktemp)"
    printf '{"template":"%s","name":"ocp-smoke","ttlSeconds":300,"env":{"HARAKIRI_SMOKE":"ok"},"wait":true,"waitTimeoutMs":30000}' "$BACKGROUND_AGENT_HARAKIRI_TEMPLATE" > "$CREATE_BODY"
    http_code="$(curl -sSk -o "$CREATE_RESPONSE" -w '%{http_code}' \
      -H "x-api-key: ${HARAKIRI_API_KEY}" \
      -H "content-type: application/json" \
      -d @"$CREATE_BODY" \
      "https://${API_HOST}/v1/sandboxes")"
    if [ "$http_code" != "201" ]; then
      warn "Harakiri sandbox create smoke failed with HTTP ${http_code}"
      sed -n '1,40p' "$CREATE_RESPONSE" >&2 || true
    else
      sandbox_id="$(node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(body.sandbox?.id || "")' "$CREATE_RESPONSE")"
      if [ -n "$sandbox_id" ]; then
        RUN_RESPONSE="$(mktemp)"
        run_code="$(curl -sSk -o "$RUN_RESPONSE" -w '%{http_code}' -H "x-api-key: ${HARAKIRI_API_KEY}" \
          -H "content-type: application/json" \
          -d '{"command":"printenv HARAKIRI_SMOKE","timeoutMs":30000}' \
          "https://${API_HOST}/v1/sandboxes/${sandbox_id}/run")"
        if [ "$run_code" != "200" ] || ! node -e 'const fs=require("fs"); const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (body.result?.exitCode !== 0 || body.result?.stdout !== "ok\n") process.exit(1);' "$RUN_RESPONSE"; then
          warn "Sandbox run smoke failed"
          sed -n '1,40p' "$RUN_RESPONSE" >&2 || true
        fi
        curl -sSk -X DELETE -H "x-api-key: ${HARAKIRI_API_KEY}" \
          "https://${API_HOST}/v1/sandboxes/${sandbox_id}" >/dev/null || true
      fi
    fi
  fi
fi

log "Installed"
cat <<EOF
Namespace:          ${NAMESPACE}
Harakiri dashboard: https://${WEB_HOST}
Harakiri API:       https://${API_HOST}
Keycloak:           https://${AUTH_HOST}
BackgroundAgent:    https://${BACKGROUND_AGENT_HOST}
Sandbox routes:     https://<route>.${SBX_DOMAIN}

Status:
  oc get pods -n ${NAMESPACE}
  oc get routes -n ${NAMESPACE}
EOF

if [ -n "$BOOTSTRAP_USER_EMAIL" ]; then
  cat <<EOF

Bootstrap user:
  Email:    ${BOOTSTRAP_USER_EMAIL}
  Password: temporary; change it on first login
EOF
fi
